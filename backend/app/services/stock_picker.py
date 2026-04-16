"""
Module: app/services/stock_picker.py
Purpose: Smart Stock Picker — scans stocks, scores them, and recommends picks.

Combines technical analysis, fundamentals (yfinance), relative strength
vs Nifty 50, and news sentiment into a composite score (0-100).
Returns top picks with entry, stop loss, and target prices tailored
to the user's capital.

Scoring Algorithm (100 points):
    Technical (40): RSI, MACD, ADX, EMA alignment, Support proximity, BB squeeze
    Volume (20): Volume spike, Volume trend consistency, MFI pressure
    Strength (15): Relative strength vs Nifty 50, Sector momentum
    Fundamentals (15): PE ratio, Market cap, Debt-to-equity
    News (10): Gemini news sentiment
"""

import logging
from dataclasses import dataclass, field
from typing import Any, Optional

import pandas as pd
import yfinance as yf

from app.constants import PickerRating, Signal
from app.services.technical import (
    IndicatorValues,
    TechnicalAnalysisResult,
    TechnicalAnalyzer,
)

logger = logging.getLogger(__name__)


# ━━━━━━━━━━━━━━━ Data Classes ━━━━━━━━━━━━━━━


@dataclass
class StockScore:
    """Detailed scoring breakdown for a single stock."""

    # Technical (40 pts max)
    rsi_score: float = 0.0          # 10 pts
    macd_score: float = 0.0         # 10 pts
    adx_score: float = 0.0          # 5 pts
    ema_score: float = 0.0          # 5 pts
    support_score: float = 0.0      # 5 pts
    bb_score: float = 0.0           # 5 pts

    # Volume (20 pts max)
    volume_spike_score: float = 0.0   # 10 pts
    mfi_score: float = 0.0           # 5 pts
    delivery_score: float = 0.0      # 5 pts — volume trend consistency

    # Strength (15 pts max)
    relative_strength_score: float = 0.0  # 10 pts — vs Nifty 50
    sector_score: float = 0.0             # 5 pts — sector momentum

    # Fundamentals (15 pts max)
    pe_score: float = 0.0       # 5 pts — yfinance PE ratio
    mcap_score: float = 0.0     # 5 pts — yfinance market cap
    debt_score: float = 0.0     # 5 pts — yfinance debt-to-equity

    # News (10 pts max)
    news_score: float = 0.0     # 10 pts

    @property
    def technical_total(self) -> float:
        """Sum of technical scores (max 40)."""
        return (
            self.rsi_score + self.macd_score + self.adx_score
            + self.ema_score + self.support_score + self.bb_score
        )

    @property
    def volume_total(self) -> float:
        """Sum of volume scores (max 20)."""
        return self.volume_spike_score + self.mfi_score + self.delivery_score

    @property
    def strength_total(self) -> float:
        """Sum of strength scores (max 15)."""
        return self.relative_strength_score + self.sector_score

    @property
    def fundamental_total(self) -> float:
        """Sum of fundamental scores (max 15)."""
        return self.pe_score + self.mcap_score + self.debt_score

    @property
    def total(self) -> float:
        """Total composite score (max 100)."""
        return (
            self.technical_total + self.volume_total
            + self.strength_total + self.fundamental_total + self.news_score
        )


@dataclass
class StockPick:
    """A single stock recommendation with all details."""

    symbol: str = ""
    score: float = 0.0
    rating: str = ""
    price: float = 0.0
    entry_range: str = ""
    stop_loss: float = 0.0
    target: float = 0.0
    risk_reward: str = ""
    shares: int = 0
    investment: float = 0.0
    risk_amount: float = 0.0
    reasons: list[str] = field(default_factory=list)
    score_breakdown: Optional[StockScore] = None


# ━━━━━━━━━━━━━━━ Stock Picker ━━━━━━━━━━━━━━━


class StockPicker:
    """Smart Stock Picker — scans, scores, and recommends stocks.

    Combines technical analysis with yfinance fundamentals, Nifty relative
    strength, and Gemini news sentiment to produce a ranked list of stock
    picks with entry/SL/target levels.

    Example:
        picker = StockPicker(analyzer=TechnicalAnalyzer())
        picks = await picker.scan_stocks(stock_data, capital=13500)
        for pick in picks:
            print(f"{pick.symbol}: {pick.score}/100 ({pick.rating})")
    """

    # Risk parameters
    DEFAULT_SL_PERCENT = 4.0    # 4% stop loss
    DEFAULT_TARGET_PERCENT = 8.0  # 8% target (2:1 RR)
    MAX_RISK_PER_TRADE_PCT = 20  # Max 20% of capital per trade

    # Cache for Nifty 50 returns (refreshed per scan)
    _nifty_return: Optional[float] = None

    def __init__(
        self,
        analyzer: Optional[TechnicalAnalyzer] = None,
    ) -> None:
        """Initialize the stock picker.

        Args:
            analyzer: TechnicalAnalyzer instance (created if not provided).
        """
        self._analyzer = analyzer or TechnicalAnalyzer()
        self._fundamentals_cache: dict[str, dict[str, Any]] = {}

    async def scan_stocks(
        self,
        stock_data: dict[str, pd.DataFrame],
        capital: float = 13_500.0,
        max_risk_percent: float = 4.0,
        news_sentiments: Optional[dict[str, dict]] = None,
        top_n: int = 10,
    ) -> list[StockPick]:
        """Scan multiple stocks and return top picks.

        Args:
            stock_data: Dict mapping symbol -> OHLCV DataFrame.
            capital: Available trading capital in INR.
            max_risk_percent: Maximum risk per trade (%).
            news_sentiments: Optional dict of symbol -> sentiment data.
            top_n: Number of top picks to return.

        Returns:
            List of StockPick objects sorted by score (highest first).
        """
        picks = []
        news_sentiments = news_sentiments or {}

        # B8 FIX: Offload blocking yfinance calls to threads + cache 15min
        from app.services.async_utils import run_in_thread, cached_async, make_cache_key

        # Cache Nifty return (15 min TTL)
        async def _cached_nifty():
            return await run_in_thread(self._get_nifty_return)

        self._nifty_return = await cached_async(
            "fundamentals", "nifty_return", _cached_nifty, ttl=900,
        )

        # Cache fundamentals batch (15 min TTL, keyed by symbols hash)
        all_syms = sorted(stock_data.keys())
        cache_key = make_cache_key(*all_syms)

        async def _cached_fundamentals():
            await run_in_thread(self._prefetch_fundamentals, list(stock_data.keys()))
            return dict(self._fundamentals_cache)

        cached_fund = await cached_async(
            "fundamentals", cache_key, _cached_fundamentals, ttl=900,
        )
        if cached_fund:
            self._fundamentals_cache = cached_fund

        # Offload CPU-bound pandas-ta scan loop to thread
        def _scan_all():
            results = []
            for symbol, df in stock_data.items():
                try:
                    pick = self._analyze_stock(
                        symbol=symbol,
                        df=df,
                        capital=capital,
                        max_risk_percent=max_risk_percent,
                        news_sentiment=news_sentiments.get(symbol),
                    )
                    if pick and pick.score >= 40:
                        results.append(pick)
                except Exception as e:
                    logger.warning("Failed to analyze %s: %s", symbol, e)
            results.sort(key=lambda p: p.score, reverse=True)
            return results[:top_n]

        picks = await run_in_thread(_scan_all)

        logger.info(
            "Stock picker scanned %d stocks, found %d picks (showing top %d)",
            len(stock_data),
            len(picks),
            min(top_n, len(picks)),
        )

        return picks[:top_n]

    def _get_nifty_return(self) -> float:
        """Get Nifty 50 1-month return for relative strength calculation."""
        try:
            nifty = yf.Ticker("^NSEI")
            hist = nifty.history(period="1mo")
            if hist is not None and len(hist) >= 2:
                ret = ((hist["Close"].iloc[-1] / hist["Close"].iloc[0]) - 1) * 100
                logger.info("Nifty 50 1-month return: %.2f%%", ret)
                return float(ret)
        except Exception as e:
            logger.warning("Failed to fetch Nifty return: %s", e)
        return 0.0

    def _prefetch_fundamentals(self, symbols: list[str]) -> None:
        """Batch-fetch fundamentals from yfinance for all symbols.

        Fetches PE ratio, market cap, and debt-to-equity in one pass.
        Results cached in self._fundamentals_cache.
        """
        self._fundamentals_cache.clear()
        nse_symbols = [f"{sym}.NS" for sym in symbols]

        try:
            tickers = yf.Tickers(" ".join(nse_symbols))
            for sym, nse_sym in zip(symbols, nse_symbols):
                try:
                    ticker = tickers.tickers.get(nse_sym)
                    if not ticker:
                        continue
                    info = ticker.info or {}
                    self._fundamentals_cache[sym] = {
                        "pe": info.get("trailingPE") or info.get("forwardPE"),
                        "mcap": info.get("marketCap"),
                        "debt_to_equity": info.get("debtToEquity"),
                        "sector": info.get("sector", ""),
                        "return_1mo": self._calc_stock_return(ticker),
                    }
                    logger.debug(
                        "Fundamentals %s: PE=%.1f, Mcap=%s, D/E=%s",
                        sym,
                        self._fundamentals_cache[sym].get("pe") or 0,
                        self._fundamentals_cache[sym].get("mcap"),
                        self._fundamentals_cache[sym].get("debt_to_equity"),
                    )
                except Exception as e:
                    logger.debug("Fundamentals skip %s: %s", sym, e)
        except Exception as e:
            logger.warning("Batch fundamentals fetch failed: %s", e)

    @staticmethod
    def _calc_stock_return(ticker: Any) -> Optional[float]:
        """Calculate 1-month return for a stock ticker."""
        try:
            hist = ticker.history(period="1mo")
            if hist is not None and len(hist) >= 2:
                return float(
                    ((hist["Close"].iloc[-1] / hist["Close"].iloc[0]) - 1) * 100
                )
        except Exception:
            pass
        return None

    def score_stock(
        self,
        analysis: TechnicalAnalysisResult,
        news_sentiment: Optional[dict] = None,
        symbol: str = "",
        df: Optional[pd.DataFrame] = None,
    ) -> StockScore:
        """Score a single stock based on technicals, fundamentals, and news.

        Args:
            analysis: TechnicalAnalysisResult from the analyzer.
            news_sentiment: Optional sentiment dict with 'score' (-100 to 100).
            symbol: Stock symbol for fundamentals lookup.
            df: OHLCV DataFrame for volume trend analysis.

        Returns:
            StockScore with detailed breakdown.
        """
        iv = analysis.indicators
        signals = analysis.signals
        score = StockScore()

        # ── Technical (40 pts) ──

        # RSI sweet spot (10 pts): Best at 30-50 (oversold recovery zone)
        if 30 <= iv.rsi <= 50:
            score.rsi_score = 10.0
        elif 25 <= iv.rsi < 30:
            score.rsi_score = 8.0  # Very oversold — risky but potential
        elif 50 < iv.rsi <= 60:
            score.rsi_score = 6.0
        elif iv.rsi < 25 or iv.rsi > 70:
            score.rsi_score = 2.0  # Extreme — caution
        else:
            score.rsi_score = 4.0

        # MACD crossover (10 pts)
        if signals.macd_signal == "BULLISH":
            score.macd_score = 10.0
        elif signals.macd_signal == "NEUTRAL":
            score.macd_score = 5.0
        else:
            score.macd_score = 0.0

        # ADX trend (5 pts)
        if signals.adx_signal == "STRONG_TREND" and iv.plus_di > iv.minus_di:
            score.adx_score = 5.0
        elif signals.adx_signal == "WEAK_TREND" and iv.plus_di > iv.minus_di:
            score.adx_score = 3.0
        else:
            score.adx_score = 0.0

        # EMA alignment (5 pts): Price > EMA 21 > EMA 50
        if signals.ema_signal == "BULLISH":
            score.ema_score = 5.0
        elif signals.ema_signal == "NEUTRAL":
            score.ema_score = 2.0
        else:
            score.ema_score = 0.0

        # Near support (5 pts)
        sr = analysis.support_resistance
        if sr.support > 0 and iv.current_price > 0:
            pct_from_support = (
                (iv.current_price - sr.support) / iv.current_price * 100
            )
            if 0 < pct_from_support <= 3:
                score.support_score = 5.0  # Very near support
            elif 3 < pct_from_support <= 6:
                score.support_score = 3.0
            else:
                score.support_score = 1.0

        # Bollinger Band squeeze (5 pts)
        if signals.bb_signal == "SQUEEZE":
            score.bb_score = 5.0
        elif signals.bb_signal == "NEUTRAL":
            score.bb_score = 2.0
        else:
            score.bb_score = 1.0

        # ── Volume (20 pts) ──

        # Volume spike (10 pts)
        if iv.volume_ratio >= 2.0:
            score.volume_spike_score = 10.0
        elif iv.volume_ratio >= 1.5:
            score.volume_spike_score = 7.0
        elif iv.volume_ratio >= 1.0:
            score.volume_spike_score = 4.0
        else:
            score.volume_spike_score = 1.0

        # MFI (5 pts)
        if 20 <= iv.mfi <= 40:
            score.mfi_score = 5.0  # Oversold money flow
        elif 40 < iv.mfi <= 60:
            score.mfi_score = 3.0
        elif iv.mfi > 80:
            score.mfi_score = 1.0  # Overbought
        else:
            score.mfi_score = 2.0

        # Volume trend consistency (5 pts) — are recent volumes rising?
        score.delivery_score = self._score_volume_trend(df)

        # ── Strength (15 pts) — REAL DATA via yfinance ──
        fundamentals = self._fundamentals_cache.get(symbol, {})

        # Relative strength vs Nifty 50 (10 pts)
        stock_return = fundamentals.get("return_1mo")
        score.relative_strength_score = self._score_relative_strength(stock_return)

        # Sector momentum (5 pts) — based on stock's own momentum profile
        score.sector_score = self._score_sector_momentum(df, iv)

        # ── Fundamentals (15 pts) — REAL DATA via yfinance ──
        score.pe_score = self._score_pe(fundamentals.get("pe"))
        score.mcap_score = self._score_mcap(fundamentals.get("mcap"))
        score.debt_score = self._score_debt(fundamentals.get("debt_to_equity"))

        # ── News (10 pts) ──
        if news_sentiment:
            sent_score = news_sentiment.get("score", 0)
            sentiment = news_sentiment.get("sentiment", "NEUTRAL")

            if sentiment == "POSITIVE" and sent_score > 30:
                score.news_score = 10.0
            elif sentiment == "POSITIVE":
                score.news_score = 7.0
            elif sentiment == "NEUTRAL":
                score.news_score = 5.0
            elif sentiment == "NEGATIVE" and sent_score < -30:
                score.news_score = 0.0  # Bad news — strong penalty
            else:
                score.news_score = 3.0
        else:
            score.news_score = 5.0  # No news = neutral

        return score

    # ━━━━━━━━━━━ Real Scoring Helpers ━━━━━━━━━━━

    @staticmethod
    def _score_volume_trend(df: Optional[pd.DataFrame]) -> float:
        """Score volume trend consistency (5 pts).

        Checks if recent 5-day average volume is rising vs 20-day average.
        Rising volume on up-days = accumulation = bullish.
        """
        if df is None or len(df) < 20:
            return 2.5  # Not enough data

        try:
            vol = df["volume"] if "volume" in df.columns else df.get("Volume")
            if vol is None:
                return 2.5

            avg_5 = vol.tail(5).mean()
            avg_20 = vol.tail(20).mean()

            if avg_20 <= 0:
                return 2.5

            ratio = avg_5 / avg_20
            if ratio >= 1.5:
                return 5.0   # Strong volume accumulation
            elif ratio >= 1.2:
                return 4.0
            elif ratio >= 0.8:
                return 2.5   # Normal volume
            else:
                return 1.0   # Volume drying up — distribution
        except Exception:
            return 2.5

    def _score_relative_strength(self, stock_return: Optional[float]) -> float:
        """Score relative strength vs Nifty 50 (10 pts).

        Compares stock's 1-month return to Nifty 50's 1-month return.
        Outperforming stocks get higher scores.
        """
        if stock_return is None:
            return 3.0  # No data — slightly below mid

        nifty_ret = self._nifty_return or 0.0
        excess = stock_return - nifty_ret  # Excess return over Nifty

        if excess >= 10:
            return 10.0  # Massive outperformer
        elif excess >= 5:
            return 8.0
        elif excess >= 2:
            return 6.0
        elif excess >= 0:
            return 4.0   # In line with market
        elif excess >= -5:
            return 2.0   # Underperforming
        else:
            return 0.0   # Severe underperformer

    @staticmethod
    def _score_sector_momentum(
        df: Optional[pd.DataFrame], iv: IndicatorValues
    ) -> float:
        """Score sector/price momentum (5 pts).

        Uses price position relative to 52-week range and short-term momentum.
        """
        if df is None or len(df) < 20:
            return 2.0

        try:
            close = df["close"] if "close" in df.columns else df.get("Close")
            if close is None:
                return 2.0

            price = float(close.iloc[-1])
            high_52w = float(close.max())
            low_52w = float(close.min())

            if high_52w == low_52w:
                return 2.0

            # Position in range (0-100%)
            position = (price - low_52w) / (high_52w - low_52w) * 100

            # Sweet spot: 60-85% of range (strong but not overextended)
            if 60 <= position <= 85:
                return 5.0
            elif 40 <= position < 60:
                return 4.0  # Recovering
            elif position > 85:
                return 2.0  # Near high — limited upside
            elif 20 <= position < 40:
                return 3.0  # Beaten down — could bounce
            else:
                return 1.0  # Near lows — falling knife
        except Exception:
            return 2.0

    @staticmethod
    def _score_pe(pe: Optional[float]) -> float:
        """Score PE ratio (5 pts). Lower PE = better value.

        Indian market context: Nifty avg PE ~22.
        """
        if pe is None or pe <= 0:
            return 2.0  # No data or loss-making

        if pe <= 15:
            return 5.0   # Deep value
        elif pe <= 22:
            return 4.0   # Fair value
        elif pe <= 35:
            return 3.0   # Growth premium
        elif pe <= 60:
            return 1.5   # Expensive
        else:
            return 0.5   # Very expensive

    @staticmethod
    def _score_mcap(mcap: Optional[float]) -> float:
        """Score market cap (5 pts). Prefer large & mid caps for safety.

        Indian market context (INR):
        - Large cap: > ₹50,000 Cr (500B)
        - Mid cap: ₹10,000 - 50,000 Cr
        - Small cap: < ₹10,000 Cr (100B)
        """
        if mcap is None or mcap <= 0:
            return 2.0  # No data

        mcap_cr = mcap / 1e7  # Convert to Crores (yfinance returns in currency)

        if mcap_cr >= 100_000:
            return 5.0   # Mega cap — safest
        elif mcap_cr >= 50_000:
            return 4.5   # Large cap
        elif mcap_cr >= 10_000:
            return 4.0   # Mid cap — good growth + stability
        elif mcap_cr >= 2_000:
            return 3.0   # Small cap — riskier
        else:
            return 1.5   # Micro cap — high risk

    @staticmethod
    def _score_debt(debt_to_equity: Optional[float]) -> float:
        """Score debt-to-equity ratio (5 pts). Lower debt = healthier.

        Indian market context:
        - D/E < 0.5: Very low debt (excellent)
        - D/E 0.5-1.0: Moderate debt
        - D/E > 1.5: High debt (risky)
        """
        if debt_to_equity is None:
            return 2.5  # No data (common for financials)

        if debt_to_equity <= 0.3:
            return 5.0   # Almost debt-free
        elif debt_to_equity <= 0.5:
            return 4.0   # Low debt
        elif debt_to_equity <= 1.0:
            return 3.0   # Moderate
        elif debt_to_equity <= 1.5:
            return 1.5   # High debt
        else:
            return 0.5   # Heavily leveraged

    # ━━━━━━━━━━━━ Private ━━━━━━━━━━━━

    def _analyze_stock(
        self,
        symbol: str,
        df: pd.DataFrame,
        capital: float,
        max_risk_percent: float,
        news_sentiment: Optional[dict] = None,
    ) -> Optional[StockPick]:
        """Analyze a single stock and produce a pick if score is high enough."""
        try:
            analysis = self._analyzer.analyze(df)
        except ValueError as e:
            logger.debug("Skipping %s: %s", symbol, e)
            return None

        score = self.score_stock(
            analysis, news_sentiment, symbol=symbol, df=df,
        )
        total = score.total
        rating = self._get_rating(total)

        # Skip bearish stocks
        if analysis.overall_signal == Signal.SELL:
            return None

        price = analysis.indicators.current_price
        if price <= 0:
            return None

        # Calculate entry/SL/target
        sl_pct = min(max_risk_percent, self.DEFAULT_SL_PERCENT)
        stop_loss = round(price * (1 - sl_pct / 100), 2)
        target = round(price * (1 + self.DEFAULT_TARGET_PERCENT / 100), 2)

        # Capital-aware position sizing
        max_investment = capital * (self.MAX_RISK_PER_TRADE_PCT / 100)
        shares = max(1, int(max_investment / price))
        investment = round(shares * price, 2)
        risk_amount = round(shares * (price - stop_loss), 2)

        # Risk-reward ratio
        reward = target - price
        risk = price - stop_loss
        rr = f"1:{reward / risk:.1f}" if risk > 0 else "N/A"

        # Entry range
        entry_low = round(price * 0.99, 2)  # -1%
        entry_high = round(price * 1.01, 2)  # +1%

        # Build reasons
        reasons = self._build_reasons(
            analysis, score, symbol=symbol, news_sentiment=news_sentiment,
        )

        return StockPick(
            symbol=symbol,
            score=round(total, 1),
            rating=rating,
            price=price,
            entry_range=f"{entry_low} - {entry_high}",
            stop_loss=stop_loss,
            target=target,
            risk_reward=rr,
            shares=shares,
            investment=investment,
            risk_amount=risk_amount,
            reasons=reasons,
            score_breakdown=score,
        )

    @staticmethod
    def _get_rating(score: float) -> str:
        """Map score to rating label."""
        if score >= 85:
            return PickerRating.GOLDEN.value
        elif score >= 70:
            return PickerRating.STRONG.value
        elif score >= 55:
            return PickerRating.MODERATE.value
        else:
            return PickerRating.SKIP.value

    def _build_reasons(
        self,
        analysis: TechnicalAnalysisResult,
        score: StockScore,
        symbol: str = "",
        news_sentiment: Optional[dict] = None,
    ) -> list[str]:
        """Build human-readable reasons for the pick."""
        reasons = []
        iv = analysis.indicators
        signals = analysis.signals

        # Technical reasons
        if signals.macd_signal == "BULLISH":
            reasons.append("MACD bullish crossover")
        if signals.rsi_signal == "OVERSOLD":
            reasons.append(f"RSI oversold at {iv.rsi:.0f}")
        elif 30 <= iv.rsi <= 50:
            reasons.append(f"RSI in sweet spot ({iv.rsi:.0f})")
        if signals.ema_signal == "BULLISH":
            reasons.append("Price above EMA 21/50")
        if signals.supertrend_signal == "BULLISH":
            reasons.append("Supertrend bullish")
        if iv.volume_ratio >= 2.0:
            reasons.append(f"Volume spike {iv.volume_ratio:.1f}x")
        elif iv.volume_ratio >= 1.5:
            reasons.append(f"Above-average volume {iv.volume_ratio:.1f}x")
        if signals.bb_signal == "SQUEEZE":
            reasons.append("Bollinger squeeze — breakout potential")
        if signals.adx_signal == "STRONG_TREND":
            reasons.append(f"Strong trend (ADX {iv.adx:.0f})")

        # Fundamental reasons
        fundamentals = self._fundamentals_cache.get(symbol, {})
        pe = fundamentals.get("pe")
        if pe and pe <= 15:
            reasons.append(f"Deep value PE {pe:.1f}")
        elif pe and pe <= 22:
            reasons.append(f"Fair value PE {pe:.1f}")

        debt = fundamentals.get("debt_to_equity")
        if debt is not None and debt <= 0.3:
            reasons.append("Almost debt-free balance sheet")

        # Relative strength
        if score.relative_strength_score >= 8.0:
            reasons.append("Strong outperformer vs Nifty 50")

        # News sentiment
        if news_sentiment:
            sentiment = news_sentiment.get("sentiment", "")
            if sentiment == "POSITIVE":
                reasons.append("Positive news sentiment")
            elif sentiment == "NEGATIVE":
                reasons.append("⚠ Negative news — caution")

        return reasons[:7]  # Max 7 reasons
