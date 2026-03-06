"""
Module: app/routers/ai.py
Purpose: AI analysis endpoints — technical analysis, AI predictions, stock picks, news.

All endpoints require JWT authentication.
AI responses are sanitized before returning to clients.
"""

import logging
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, Query

from app.config import settings
from app.dependencies import get_current_user
from app.exceptions import NotFoundError, ServiceUnavailableError
from app.models.schemas import (
    AIAnalysisSchema,
    ApiResponse,
    NewsArticleSchema,
    NewsSearchSchema,
    PerformanceMetricsSchema,
    StockPickSchema,
    StockPicksResponse,
    TechnicalAnalysisSchema,
    TechnicalIndicatorsSchema,
    TechnicalSignalsSchema,
)
from app.services.ai_engine import AIEngine, StockAnalysisInput
from app.services.analytics import PerformanceAnalytics, TradeRecord
from app.services.data_provider import DataProvider
from app.services.gemini_news import GeminiNewsService
from app.services.stock_picker import StockPicker
from app.services.swing_screener import SwingScreener
from app.services.technical import TechnicalAnalyzer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["AI & Analysis"])

# ━━━━━━━━━━━━━━━ Service Singletons ━━━━━━━━━━━━━━━

_analyzer = TechnicalAnalyzer()
_news_service = GeminiNewsService()
_analytics = PerformanceAnalytics()
_picker = StockPicker(analyzer=_analyzer)
_data_provider = DataProvider()  # Default: yfinance → demo
_swing_screener = SwingScreener()

# Lazy-init AI engine (needs GEMINI_API_KEY)
_ai_engine: Optional[AIEngine] = None


def _get_ai_engine() -> AIEngine:
    """Lazy-initialize AI engine on first use."""
    global _ai_engine
    if _ai_engine is None:
        if not settings.GEMINI_API_KEY:
            raise ServiceUnavailableError("GEMINI_API_KEY not configured")
        _ai_engine = AIEngine()
    return _ai_engine


# NSE trading series suffixes used by Angel One SmartAPI
_NSE_SUFFIXES = ("-EQ", "-BE", "-BL", "-AF", "-IQ", "-RL",
                 "-SL", "-SM", "-SQ", "-ST", "-RV", "-MF")


def _strip_nse_suffix(symbol: str) -> str:
    """Strip NSE trading series suffix from Angel One symbols.

    Angel One uses suffixes like IDEA-EQ, RELIANCE-BE, TCS-BL.
    yfinance and demo data expect plain symbols: IDEA, RELIANCE, TCS.

    Args:
        symbol: Symbol with optional NSE suffix (e.g., "IDEA-EQ").

    Returns:
        Clean symbol without suffix (e.g., "IDEA").
    """
    upper = symbol.upper()
    for suffix in _NSE_SUFFIXES:
        if upper.endswith(suffix):
            return upper[: -len(suffix)]
    return upper


def _derive_sentiment_from_text(text: str) -> tuple[str, float]:
    """Derive sentiment label and score (-100 to 100) from text keywords.

    Used as fallback when Gemini AI is unavailable. Scans text
    for bullish/bearish keywords and returns a sentiment + score.

    Args:
        text: The text to analyze.

    Returns:
        Tuple of (sentiment_label, score) where score is -100 to 100.
    """
    text_lower = text.lower()
    bull_words = [
        "growth", "surge", "surges", "rally", "rallies", "bullish",
        "gain", "gains", "profit", "profits", "upgrade", "upgraded",
        "positive", "strong", "stronger", "outperform", "beat", "beats",
        "recovery", "bounce", "breakout", "uptrend", "record high",
        "buy", "accumulate", "optimistic", "dividend",
    ]
    bear_words = [
        "decline", "declines", "fall", "falls", "fell", "bearish",
        "loss", "losses", "downgrade", "downgraded",
        "negative", "weak", "weaker", "weakness", "underperform",
        "crash", "crashed", "sell", "strong sell",
        "concern", "concerns", "risk", "pressure",
        "52-week low", "low", "slump", "headwinds",
        "deteriorating", "distress", "debt", "correction",
        "downward", "plunge", "plunges",
    ]
    bull_count = sum(1 for w in bull_words if w in text_lower)
    bear_count = sum(1 for w in bear_words if w in text_lower)

    if bull_count > bear_count:
        diff = bull_count - bear_count
        score = min(diff * 15, 80)  # Scale to -100..100 range
        return "BULLISH", score
    elif bear_count > bull_count:
        diff = bear_count - bull_count
        score = max(-diff * 15, -80)
        return "BEARISH", score
    else:
        return "NEUTRAL", 0


async def _get_stock_data(symbol: str, days: int = 100, use_broker: bool = True) -> pd.DataFrame:
    """Fetch real OHLCV data: Angel One → yfinance → demo fallback.

    Uses the active broker connection (if available) for real-time data,
    then falls back to yfinance, then demo data.

    For bulk operations (AI picks scanning 50 stocks), set use_broker=False
    to skip Angel One (too slow for batch — ~2-3s per stock API latency).
    Angel One is used for single-stock endpoints (/analyze, /predict).

    DataProvider returns capitalized columns (Open, High, Low, Close, Volume)
    for backtesting.py. TechnicalAnalyzer expects lowercase. This helper
    normalizes the columns.

    Also strips NSE trading series suffixes (-EQ, -BE, -BL, -AF, -IQ, -RL)
    from Angel One symbols before passing to yfinance, since yfinance
    expects plain symbols (e.g., "IDEA", not "IDEA-EQ").

    Args:
        symbol: Stock symbol (e.g., "RELIANCE", "IDEA-EQ").
        days: Number of historical days.
        use_broker: If True, try Angel One first. If False, skip to yfinance.

    Returns:
        DataFrame with lowercase columns: open, high, low, close, volume.
    """
    # Strip NSE series suffixes for yfinance compatibility
    # Angel One uses IDEA-EQ, RELIANCE-BE, etc. yfinance needs IDEA, RELIANCE
    clean_symbol = _strip_nse_suffix(symbol)

    # ── Dynamically attach/detach active broker to DataProvider ──
    # This ensures Angel One is used as Tier 1 when connected AND requested
    if use_broker:
        try:
            from app.routers.broker import get_active_broker_optional

            broker = get_active_broker_optional()
            if broker is not None and _data_provider._angel_broker is None:
                _data_provider._angel_broker = broker
                logger.info("🔗 Angel One broker attached to AI DataProvider")
            elif broker is None and _data_provider._angel_broker is not None:
                _data_provider._angel_broker = None
                logger.debug("Angel One broker detached from AI DataProvider")
        except Exception:
            pass  # broker module not available, skip

    # Choose data source based on use_broker flag
    data_source = None if use_broker else "yfinance"

    try:
        df = await _data_provider.get_ohlcv(clean_symbol, days=days, data_source=data_source)
        if df is not None and not df.empty:
            # Normalize column names to lowercase for TechnicalAnalyzer
            df.columns = [c.lower() for c in df.columns]
            source = "Angel One → yfinance" if use_broker else "yfinance"
            logger.info("Data loaded for %s: %d rows (source: %s)", symbol, len(df), source)
            return df
    except Exception as e:
        logger.warning("DataProvider failed for %s: %s — falling back to demo", symbol, e)

    # Fallback: demo data
    logger.info("Using demo data for %s", symbol)
    return _generate_demo_ohlcv(clean_symbol)


# ━━━━━━━━━━━━━━━ Demo Data Helper ━━━━━━━━━━━━━━━


def _generate_demo_ohlcv(symbol: str, days: int = 100) -> pd.DataFrame:
    """Generate realistic demo OHLCV data for testing.

    In production, this will be replaced with real data from broker APIs.
    Uses random walk with drift for realistic price action.

    Args:
        symbol: Stock symbol (used to seed RNG for consistency).
        days: Number of trading days to generate.

    Returns:
        DataFrame with open, high, low, close, volume columns.
    """
    # Seed based on symbol for consistent results
    seed = sum(ord(c) for c in symbol) % 10000
    rng = np.random.default_rng(seed)

    # Base prices for some well-known stocks
    base_prices = {
        "RELIANCE": 2500.0, "TCS": 3800.0, "INFY": 1500.0,
        "HDFCBANK": 1650.0, "ICICIBANK": 1200.0, "SBIN": 780.0,
        "TATAMOTORS": 950.0, "TATAPOWER": 420.0, "ITC": 460.0,
        "WIPRO": 480.0, "BAJFINANCE": 7200.0, "MARUTI": 12500.0,
        "SUNPHARMA": 1800.0, "HINDUNILVR": 2400.0, "LT": 3500.0,
    }
    base_price = base_prices.get(symbol, 500.0 + rng.random() * 2000)

    # Generate price series with random walk
    returns = rng.normal(0.001, 0.02, days)  # slight upward drift
    prices = [base_price]
    for r in returns:
        prices.append(prices[-1] * (1 + r))

    closes = prices[1:]
    opens = [c * (1 + rng.normal(0, 0.005)) for c in closes]
    highs = [max(float(o), float(c)) * (1 + abs(rng.normal(0, 0.01))) for o, c in zip(opens, closes)]
    lows = [min(float(o), float(c)) * (1 - abs(rng.normal(0, 0.01))) for o, c in zip(opens, closes)]
    volumes = [int(rng.uniform(500_000, 5_000_000)) for _ in closes]

    return pd.DataFrame({
        "open": opens,
        "high": highs,
        "low": lows,
        "close": closes,
        "volume": volumes,
    })


# ━━━━━━━━━━━━━━━ Endpoints ━━━━━━━━━━━━━━━


@router.get(
    "/analyze/{symbol}",
    response_model=ApiResponse[TechnicalAnalysisSchema],
    summary="Technical Analysis",
    description="Get full technical analysis for a stock (RSI, MACD, EMA, ADX, etc.).",
)
async def analyze_stock(
    symbol: str,
    user: dict = Depends(get_current_user),
) -> ApiResponse[TechnicalAnalysisSchema]:
    """Run technical analysis on a stock.

    Uses pandas-ta for 15+ indicators and returns signals + market condition.

    Args:
        symbol: Stock symbol (e.g., "RELIANCE", "TCS").
        user: Authenticated user (from JWT).

    Returns:
        ApiResponse with full technical analysis.
    """
    symbol = symbol.upper()
    logger.info("Technical analysis requested for %s by user=%s", symbol, user.get("sub"))

    # Fetch real market data (yfinance → demo fallback)
    df = await _get_stock_data(symbol)
    result = _analyzer.analyze(df)

    return ApiResponse(
        data=TechnicalAnalysisSchema(
            indicators=TechnicalIndicatorsSchema(
                rsi=result.indicators.rsi,
                macd_line=result.indicators.macd_line,
                macd_signal=result.indicators.macd_signal,
                macd_histogram=result.indicators.macd_histogram,
                adx=result.indicators.adx,
                ema_9=result.indicators.ema_9,
                ema_21=result.indicators.ema_21,
                ema_50=result.indicators.ema_50,
                ema_200=result.indicators.ema_200,
                bb_upper=result.indicators.bb_upper,
                bb_middle=result.indicators.bb_middle,
                bb_lower=result.indicators.bb_lower,
                atr=result.indicators.atr,
                volume_ratio=result.indicators.volume_ratio,
                mfi=result.indicators.mfi,
                supertrend_direction=result.indicators.supertrend_direction,
                current_price=result.indicators.current_price,
                day_change_pct=result.indicators.day_change_pct,
            ),
            signals=TechnicalSignalsSchema(
                rsi_signal=result.signals.rsi_signal,
                macd_signal=result.signals.macd_signal,
                ema_signal=result.signals.ema_signal,
                adx_signal=result.signals.adx_signal,
                supertrend_signal=result.signals.supertrend_signal,
                bb_signal=result.signals.bb_signal,
                volume_signal=result.signals.volume_signal,
            ),
            market_condition=result.market_condition.value,
            overall_signal=result.overall_signal.value,
            signal_strength=result.signal_strength,
            support=result.support_resistance.support,
            resistance=result.support_resistance.resistance,
            summary=result.summary,
        ),
        message=f"Technical analysis for {symbol}",
    )


@router.get(
    "/predict/{symbol}",
    response_model=ApiResponse[AIAnalysisSchema],
    summary="AI Prediction",
    description="Get AI-powered BUY/SELL/HOLD prediction with confidence and reasoning.",
)
async def predict_stock(
    symbol: str,
    user: dict = Depends(get_current_user),
) -> ApiResponse[AIAnalysisSchema]:
    """Get AI prediction for a stock using Gemini.

    Combines technical analysis with AI reasoning for a recommendation.

    Args:
        symbol: Stock symbol.
        user: Authenticated user.

    Returns:
        ApiResponse with AI analysis result.
    """
    symbol = symbol.upper()
    logger.info("AI prediction requested for %s by user=%s", symbol, user.get("sub"))

    engine = _get_ai_engine()
    clean_sym = _strip_nse_suffix(symbol)

    # Fetch real market data (yfinance → demo fallback)
    df = await _get_stock_data(symbol)
    ta_result = _analyzer.analyze(df)

    # Get news if Gemini news service is available (use clean symbol for better search)
    news_summary = None
    if _news_service.is_enabled:
        try:
            news = await _news_service.get_stock_news(clean_sym, max_articles=3)
            news_summary = news.combined_text if news.article_count > 0 else news.summary or None
        except Exception as e:
            logger.warning("News fetch for prediction failed: %s", e)

    # Build AI input
    ai_input = StockAnalysisInput(
        symbol=symbol,
        current_price=ta_result.indicators.current_price,
        day_change_pct=ta_result.indicators.day_change_pct,
        rsi=ta_result.indicators.rsi,
        macd_signal=ta_result.signals.macd_signal,
        ema_signal=ta_result.signals.ema_signal,
        adx=ta_result.indicators.adx,
        adx_signal=ta_result.signals.adx_signal,
        supertrend_signal=ta_result.signals.supertrend_signal,
        volume_ratio=ta_result.indicators.volume_ratio,
        support=ta_result.support_resistance.support,
        resistance=ta_result.support_resistance.resistance,
        market_condition=ta_result.market_condition.value,
        technical_signal=ta_result.overall_signal.value,
        signal_strength=ta_result.signal_strength,
        news_summary=news_summary,
    )

    result = await engine.analyze_stock(ai_input)

    return ApiResponse(
        data=AIAnalysisSchema(
            symbol=result.symbol,
            signal=result.signal.value,
            confidence=result.confidence,
            predicted_direction=result.predicted_direction,
            target_price=result.target_price,
            stop_loss=result.stop_loss,
            time_horizon=result.time_horizon,
            reasoning=result.reasoning,
            key_factors=result.key_factors,
            risk_level=result.risk_level,
            news_sentiment=result.news_sentiment,
        ),
        message=f"AI prediction for {symbol}",
    )


@router.get(
    "/news/{symbol}",
    response_model=ApiResponse[NewsSearchSchema],
    summary="Stock News Intelligence",
    description="Get latest stock news with AI sentiment analysis powered by Gemini + Google Search.",
)
async def get_stock_news(
    symbol: str,
    with_sentiment: bool = Query(default=False, description="Include AI sentiment analysis (always true with Gemini)"),
    user: dict = Depends(get_current_user),
) -> ApiResponse[NewsSearchSchema]:
    """Get real-time stock news intelligence using Gemini + Google Search.

    Gemini searches Google for latest news, analyzes sentiment,
    extracts key drivers and risk factors -- all in one call.
    No separate search API needed.

    Args:
        symbol: Stock symbol (e.g., RELIANCE, IDEA, TCS).
        with_sentiment: Ignored -- Gemini always provides sentiment.
        user: Authenticated user.

    Returns:
        ApiResponse with news articles, sentiment, key drivers, risk factors.
    """
    symbol = symbol.upper()
    logger.info("News intelligence for %s by user=%s", symbol, user.get("sub"))

    clean_sym = _strip_nse_suffix(symbol)
    result = await _news_service.get_stock_news(clean_sym, max_articles=5)

    return ApiResponse(
        data=NewsSearchSchema(
            symbol=symbol,
            query=result.query,
            articles=[
                NewsArticleSchema(
                    title=a.title,
                    url=a.url,
                    content=a.content,
                    score=a.score,
                    published_date=a.published_date,
                    source=a.source,
                )
                for a in result.articles
            ],
            sentiment=result.sentiment,
            sentiment_score=result.sentiment_score,
            sentiment_summary=result.summary,
            article_count=result.article_count,
            key_drivers=result.key_drivers,
            risk_factors=result.risk_factors,
        ),
        message=f"News for {symbol} (sentiment: {result.sentiment})",
    )


@router.get(
    "/picks",
    response_model=ApiResponse[StockPicksResponse],
    summary="Smart Stock Picks",
    description="Get AI-scored stock recommendations based on capital and risk tolerance.",
)
async def get_stock_picks(
    capital: float = Query(default=13_500, ge=100, le=10_000_000, description="Trading capital in INR"),
    max_risk_percent: float = Query(default=4.0, ge=0.5, le=10.0, description="Max risk per trade %"),
    top_n: int = Query(default=5, ge=1, le=20, description="Number of picks to return"),
    user: dict = Depends(get_current_user),
) -> ApiResponse[StockPicksResponse]:
    """Get smart stock picks tailored to your capital.

    Scans stocks, applies 10-layer scoring (technicals + fundamentals +
    relative strength + news sentiment), and returns top picks with
    entry/SL/target levels and position sizing.

    Args:
        capital: Available trading capital in INR.
        max_risk_percent: Maximum percentage risk per trade.
        top_n: Number of top picks to return.
        user: Authenticated user.

    Returns:
        ApiResponse with scored and ranked stock picks.
    """
    logger.info(
        "Stock picks requested: capital=%.0f, risk=%.1f%%, by user=%s",
        capital, max_risk_percent, user.get("sub"),
    )

    # ── Build stock universe (dynamic swing candidates from TradingView) ──
    watchlist = _swing_screener.get_swing_candidates(max_results=50)

    # ── Fetch OHLCV data (yfinance preferred for bulk — Angel One too slow for 50 stocks) ──
    # Angel One has ~2-3s per stock API latency = 100-150s for 50 stocks.
    # yfinance handles batch much better (~1s per stock, cached).
    # Angel One is still used for single-stock endpoints (/analyze, /predict).
    stock_data = {}
    for sym in watchlist:
        try:
            stock_data[sym] = await _get_stock_data(sym, use_broker=False)
        except Exception as e:
            logger.warning("Failed to fetch data for %s: %s", sym, e)

    # ── Fetch Gemini news sentiment for all symbols (parallel-safe) ──
    news_sentiments: dict[str, dict] = {}
    if _news_service.is_enabled:
        for sym in list(stock_data.keys())[:15]:  # Limit to 15 to avoid rate limits
            try:
                result = await _news_service.get_stock_news(sym, max_articles=3)
                if result and result.sentiment:
                    news_sentiments[sym] = {
                        "sentiment": result.sentiment,
                        "score": result.sentiment_score,
                    }
                    logger.debug(
                        "News sentiment %s: %s (%.0f)",
                        sym, result.sentiment, result.sentiment_score,
                    )
            except Exception as e:
                logger.debug("News sentiment skip %s: %s", sym, e)

    logger.info(
        "News sentiment fetched for %d/%d stocks",
        len(news_sentiments), len(stock_data),
    )

    picks = await _picker.scan_stocks(
        stock_data=stock_data,
        capital=capital,
        max_risk_percent=max_risk_percent,
        news_sentiments=news_sentiments,
        top_n=top_n,
    )

    return ApiResponse(
        data=StockPicksResponse(
            capital=capital,
            total_scanned=len(stock_data),
            picks_found=len(picks),
            top_picks=[
                StockPickSchema(
                    symbol=p.symbol,
                    score=p.score,
                    rating=p.rating,
                    price=p.price,
                    entry_range=p.entry_range,
                    stop_loss=p.stop_loss,
                    target=p.target,
                    risk_reward=p.risk_reward,
                    shares=p.shares,
                    investment=p.investment,
                    risk_amount=p.risk_amount,
                    reasons=p.reasons,
                )
                for p in picks
            ],
        ),
        message=f"Top {len(picks)} picks for capital {capital:.0f}",
    )


@router.get(
    "/analytics",
    response_model=ApiResponse[PerformanceMetricsSchema],
    summary="Performance Analytics",
    description="Get portfolio performance metrics (Sharpe, drawdown, win rate, etc.).",
)
async def get_analytics(
    user: dict = Depends(get_current_user),
) -> ApiResponse[PerformanceMetricsSchema]:
    """Calculate portfolio performance metrics from trade history.

    Uses demo data for now — will pull from trades table in production.

    Args:
        user: Authenticated user.

    Returns:
        ApiResponse with comprehensive performance metrics.
    """
    logger.info("Analytics requested by user=%s", user.get("sub"))

    # TODO: Pull real trades from database
    # For now, generate demo trades
    rng = np.random.default_rng(42)
    demo_trades = []
    for i in range(30):
        pnl = float(rng.normal(200, 500))
        entry = float(rng.uniform(200, 3000))
        exit_price = entry * (1 + pnl / (entry * 10))
        demo_trades.append(
            TradeRecord(
                pnl=round(pnl, 2),
                pnl_percent=round((pnl / (entry * 10)) * 100, 2),
                entry_price=round(entry, 2),
                exit_price=round(exit_price, 2),
                quantity=10,
                holding_days=int(rng.uniform(1, 15)),
                symbol=f"STOCK{i}",
            )
        )

    metrics = _analytics.calculate(demo_trades)

    return ApiResponse(
        data=PerformanceMetricsSchema(
            total_trades=metrics.total_trades,
            winning_trades=metrics.winning_trades,
            losing_trades=metrics.losing_trades,
            win_rate=round(metrics.win_rate, 1),
            total_pnl=round(metrics.total_pnl, 2),
            average_pnl=round(metrics.average_pnl, 2),
            profit_factor=round(metrics.profit_factor, 2),
            sharpe_ratio=metrics.sharpe_ratio,
            max_drawdown=metrics.max_drawdown,
            max_drawdown_amount=metrics.max_drawdown_amount,
            best_trade=metrics.best_trade,
            worst_trade=metrics.worst_trade,
            best_streak=metrics.best_streak,
            worst_streak=metrics.worst_streak,
            current_streak=metrics.current_streak,
            risk_reward_ratio=round(metrics.risk_reward_ratio, 2),
            expectancy=round(metrics.expectancy, 2),
            avg_holding_days=round(metrics.avg_holding_days, 1),
        ),
        message="Portfolio performance analytics",
    )


@router.get(
    "/market/indices",
    summary="Get Market Indices",
    description="Get live values for Nifty, BankNifty, Sensex via yfinance.",
)
async def get_market_indices(
    user: dict = Depends(get_current_user),
) -> ApiResponse[dict]:
    """Get market indices from yfinance.

    Fetches real-time Nifty50, Sensex, and BankNifty prices.
    Falls back to cached/default values if yfinance fails.

    Args:
        user: Authenticated user.

    Returns:
        ApiResponse with index prices and change percentages.
    """
    import asyncio

    # Default fallback values
    defaults = {
        "nifty": {"price": 22450.30, "changePercent": 0.0},
        "sensex": {"price": 73980.15, "changePercent": 0.0},
        "bankNifty": {"price": 47850.00, "changePercent": 0.0},
    }

    try:
        import yfinance as yf

        tickers = {
            "nifty": "^NSEI",
            "sensex": "^BSESN",
            "bankNifty": "^NSEBANK",
        }

        def _fetch_indices() -> dict:
            """Fetch index data from yfinance (blocking, runs in thread)."""
            result = {}
            for key, yf_symbol in tickers.items():
                try:
                    ticker = yf.Ticker(yf_symbol)
                    info = ticker.fast_info
                    price = getattr(info, "last_price", None) or getattr(info, "previous_close", None)
                    prev_close = getattr(info, "previous_close", None)
                    if price and prev_close and prev_close > 0:
                        change_pct = round(((price - prev_close) / prev_close) * 100, 2)
                    else:
                        change_pct = 0.0
                    result[key] = {
                        "price": round(float(price), 2) if price else defaults[key]["price"],
                        "changePercent": change_pct,
                    }
                except Exception:
                    result[key] = defaults[key]
            return result

        indices = await asyncio.to_thread(_fetch_indices)
    except Exception as exc:
        logger.warning("yfinance index fetch failed: %s — using defaults", exc)
        indices = defaults

    # Add market news summary from Gemini (non-blocking, failure safe)
    market_summary = None
    try:
        if _news_service.is_enabled:
            market_news = await _news_service.get_market_overview()
            if market_news.summary:
                market_summary = market_news.summary
    except Exception as exc:
        logger.debug("Market news fetch skipped: %s", exc)

    indices["market_summary"] = market_summary  # type: ignore[assignment]

    return ApiResponse(
        data=indices,
        message="Market indices (live)" if indices != defaults else "Market indices (fallback)",
    )


# ━━━━━━━━━━━━━━━ Swing Screener Diagnostics ━━━━━━━━━━━━━━━


@router.get("/screener/status")
async def get_screener_status(
    user: dict = Depends(get_current_user),
):
    """
    Get swing screener diagnostics — cache status, last scan info.

    Args:
        user: Authenticated user.

    Returns:
        ApiResponse with screener status and top candidates.
    """
    return ApiResponse(
        data=_swing_screener.get_last_scan_info(),
        message="Swing screener status",
    )
