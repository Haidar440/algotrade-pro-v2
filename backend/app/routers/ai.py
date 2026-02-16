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
from app.services.stock_picker import StockPicker
from app.services.tavily_search import TavilySearchService
from app.services.technical import TechnicalAnalyzer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["AI & Analysis"])

# ━━━━━━━━━━━━━━━ Service Singletons ━━━━━━━━━━━━━━━

_analyzer = TechnicalAnalyzer()
_search_service = TavilySearchService()
_analytics = PerformanceAnalytics()
_picker = StockPicker(analyzer=_analyzer)

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
    highs = [max(o, c) * (1 + abs(rng.normal(0, 0.01))) for o, c in zip(opens, closes)]
    lows = [min(o, c) * (1 - abs(rng.normal(0, 0.01))) for o, c in zip(opens, closes)]
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

    # TODO: Replace with real broker data in production
    df = _generate_demo_ohlcv(symbol)
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

    # Get technical analysis first
    df = _generate_demo_ohlcv(symbol)
    ta_result = _analyzer.analyze(df)

    # Get news if Tavily is available
    news_summary = None
    if _search_service.is_enabled:
        news = await _search_service.search_stock_news(symbol, max_results=3)
        news_summary = news.combined_text if news.article_count > 0 else None

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
    summary="Stock News",
    description="Search latest news for a stock with optional AI sentiment analysis.",
)
async def get_stock_news(
    symbol: str,
    with_sentiment: bool = Query(default=False, description="Include AI sentiment analysis"),
    user: dict = Depends(get_current_user),
) -> ApiResponse[NewsSearchSchema]:
    """Search for latest news about a stock.

    Optionally includes AI-powered sentiment analysis via Gemini.

    Args:
        symbol: Stock symbol.
        with_sentiment: Whether to run AI sentiment analysis on results.
        user: Authenticated user.

    Returns:
        ApiResponse with news articles and optional sentiment.
    """
    symbol = symbol.upper()
    logger.info("News search for %s by user=%s", symbol, user.get("sub"))

    news = await _search_service.search_stock_news(symbol, max_results=5)

    sentiment = None
    sentiment_score = None
    sentiment_summary = None

    if with_sentiment and news.article_count > 0:
        try:
            engine = _get_ai_engine()
            result = await engine.get_sentiment_analysis(symbol, news.combined_text)
            sentiment = result["sentiment"]
            sentiment_score = result["score"]
            sentiment_summary = result["summary"]
        except Exception as e:
            logger.warning("Sentiment analysis failed: %s", e)

    return ApiResponse(
        data=NewsSearchSchema(
            symbol=symbol,
            query=news.query,
            articles=[
                NewsArticleSchema(
                    title=a.title,
                    url=a.url,
                    content=a.content,
                    score=a.score,
                )
                for a in news.articles
            ],
            sentiment=sentiment,
            sentiment_score=sentiment_score,
            sentiment_summary=sentiment_summary,
            article_count=news.article_count,
        ),
        message=f"News for {symbol}" + (
            f" (sentiment: {sentiment})" if sentiment else ""
        ),
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

    Scans stocks, applies technical scoring, and returns top picks
    with entry/SL/target levels and position sizing.

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

    # Generate demo data for a basket of stocks
    # TODO: Replace with real data from broker APIs
    watchlist = [
        "RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK",
        "SBIN", "TATAMOTORS", "TATAPOWER", "ITC", "WIPRO",
        "BAJFINANCE", "MARUTI", "SUNPHARMA", "HINDUNILVR", "LT",
    ]

    stock_data = {}
    for sym in watchlist:
        try:
            stock_data[sym] = _generate_demo_ohlcv(sym)
        except Exception as e:
            logger.warning("Failed to generate data for %s: %s", sym, e)

    picks = await _picker.scan_stocks(
        stock_data=stock_data,
        capital=capital,
        max_risk_percent=max_risk_percent,
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
