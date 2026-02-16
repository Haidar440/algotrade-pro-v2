"""
Module: app/services/stock_picker.py
Purpose: Smart Stock Picker — scans stocks, scores them, and recommends picks.

Combines technical analysis, AI reasoning, and news sentiment into a
composite score (0-100) for each stock. Returns top picks with entry,
stop loss, and target prices tailored to the user's capital.

Scoring Algorithm (100 points):
    Technical (40): RSI, MACD, ADX, EMA alignment, Support proximity, BB squeeze
    Volume (20): Volume spike, Delivery %, MFI pressure
    Strength (15): Relative strength vs Nifty, Sector trend
    Fundamentals (15): PE ratio, Market cap, Debt (future)
    News (10): Positive/negative news sentiment
"""

import logging
from dataclasses import dataclass, field
from typing import Optional

import pandas as pd

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
    delivery_score: float = 0.0      # 5 pts (future: NSE bhavcopy)

    # Strength (15 pts max)
    relative_strength_score: float = 0.0  # 10 pts (future: vs Nifty)
    sector_score: float = 0.0             # 5 pts (future)

    # Fundamentals (15 pts max)
    pe_score: float = 0.0       # 5 pts (future: yfinance)
    mcap_score: float = 0.0     # 5 pts (future)
    debt_score: float = 0.0     # 5 pts (future)

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

    Combines technical analysis with optional AI/news sentiment to
    produce a ranked list of stock picks with entry/SL/target levels.

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

    def __init__(
        self,
        analyzer: Optional[TechnicalAnalyzer] = None,
    ) -> None:
        """Initialize the stock picker.

        Args:
            analyzer: TechnicalAnalyzer instance (created if not provided).
        """
        self._analyzer = analyzer or TechnicalAnalyzer()

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

        for symbol, df in stock_data.items():
            try:
                pick = self._analyze_stock(
                    symbol=symbol,
                    df=df,
                    capital=capital,
                    max_risk_percent=max_risk_percent,
                    news_sentiment=news_sentiments.get(symbol),
                )
                if pick and pick.score >= 40:  # Minimum score threshold
                    picks.append(pick)
            except Exception as e:
                logger.warning("Failed to analyze %s: %s", symbol, e)
                continue

        # Sort by score descending
        picks.sort(key=lambda p: p.score, reverse=True)

        logger.info(
            "Stock picker scanned %d stocks, found %d picks (showing top %d)",
            len(stock_data),
            len(picks),
            min(top_n, len(picks)),
        )

        return picks[:top_n]

    def score_stock(
        self,
        analysis: TechnicalAnalysisResult,
        news_sentiment: Optional[dict] = None,
    ) -> StockScore:
        """Score a single stock based on its technical analysis.

        Args:
            analysis: TechnicalAnalysisResult from the analyzer.
            news_sentiment: Optional sentiment dict with 'score' (-100 to 100).

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

        # Delivery % (5 pts) — placeholder for NSE bhavcopy integration
        score.delivery_score = 2.5  # Default mid score until data source added

        # ── Strength (15 pts) ──
        # Placeholder — will use Nifty relative strength + sector data later
        score.relative_strength_score = 5.0  # Default mid
        score.sector_score = 2.5

        # ── Fundamentals (15 pts) ──
        # Placeholder — will integrate yfinance for PE, mcap, debt
        score.pe_score = 2.5
        score.mcap_score = 2.5
        score.debt_score = 2.5

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

        score = self.score_stock(analysis, news_sentiment)
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
        reasons = self._build_reasons(analysis, score)

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

    @staticmethod
    def _build_reasons(
        analysis: TechnicalAnalysisResult, score: StockScore
    ) -> list[str]:
        """Build human-readable reasons for the pick."""
        reasons = []
        iv = analysis.indicators
        signals = analysis.signals

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

        return reasons[:5]  # Max 5 reasons
