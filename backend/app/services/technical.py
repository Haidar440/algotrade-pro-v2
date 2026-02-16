"""
Module: app/services/technical.py
Purpose: Technical analysis engine using pandas-ta (130+ indicators).

Replaces the old 484-line TypeScript TechnicalAnalysisEngine with a clean
Python implementation that leverages pandas-ta for all indicator calculations.

Usage:
    analyzer = TechnicalAnalyzer()
    result = analyzer.analyze(df)  # df must have OHLCV columns
"""

import logging
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import pandas as pd
import pandas_ta as ta

from app.constants import MarketCondition, Signal

logger = logging.getLogger(__name__)


# ━━━━━━━━━━━━━━━ Data Classes ━━━━━━━━━━━━━━━


@dataclass
class IndicatorValues:
    """Raw indicator values calculated from price data."""

    # Trend
    rsi: float = 0.0
    macd_line: float = 0.0
    macd_signal: float = 0.0
    macd_histogram: float = 0.0
    adx: float = 0.0
    plus_di: float = 0.0
    minus_di: float = 0.0
    supertrend: float = 0.0
    supertrend_direction: int = 1  # 1 = bullish, -1 = bearish

    # Moving Averages
    ema_9: float = 0.0
    ema_21: float = 0.0
    ema_50: float = 0.0
    ema_200: float = 0.0

    # Volatility
    bb_upper: float = 0.0
    bb_middle: float = 0.0
    bb_lower: float = 0.0
    bb_width: float = 0.0
    atr: float = 0.0

    # Volume
    volume_ratio: float = 0.0  # current vol / 20-day avg vol
    mfi: float = 0.0           # Money Flow Index
    obv: float = 0.0           # On Balance Volume

    # Price context
    current_price: float = 0.0
    prev_close: float = 0.0
    day_change_pct: float = 0.0


@dataclass
class SupportResistance:
    """Key support and resistance levels."""

    support: float = 0.0
    resistance: float = 0.0
    pivot: float = 0.0


@dataclass
class TechnicalSignals:
    """Interpreted signals from raw indicators."""

    rsi_signal: str = "NEUTRAL"        # OVERSOLD / NEUTRAL / OVERBOUGHT
    macd_signal: str = "NEUTRAL"       # BULLISH / BEARISH / NEUTRAL
    ema_signal: str = "NEUTRAL"        # BULLISH / BEARISH / NEUTRAL
    adx_signal: str = "NEUTRAL"        # STRONG_TREND / WEAK_TREND / NO_TREND
    supertrend_signal: str = "NEUTRAL" # BULLISH / BEARISH
    bb_signal: str = "NEUTRAL"         # SQUEEZE / EXPANSION / NEUTRAL
    volume_signal: str = "NEUTRAL"     # HIGH / NORMAL / LOW


@dataclass
class TechnicalAnalysisResult:
    """Complete technical analysis output."""

    indicators: IndicatorValues = field(default_factory=IndicatorValues)
    signals: TechnicalSignals = field(default_factory=TechnicalSignals)
    support_resistance: SupportResistance = field(default_factory=SupportResistance)
    market_condition: MarketCondition = MarketCondition.RANGE_BOUND
    overall_signal: Signal = Signal.NO_TRADE
    signal_strength: float = 0.0  # 0-100
    summary: str = ""


# ━━━━━━━━━━━━━━━ Technical Analyzer ━━━━━━━━━━━━━━━


class TechnicalAnalyzer:
    """Technical analysis engine powered by pandas-ta.

    Calculates 15+ indicators and interprets them into actionable signals.
    Replaces the old 484-line TypeScript implementation with clean pandas-ta calls.

    Example:
        analyzer = TechnicalAnalyzer()
        df = pd.DataFrame({"open": [...], "high": [...], "low": [...],
                           "close": [...], "volume": [...]})
        result = analyzer.analyze(df)
        print(result.overall_signal)  # Signal.BUY / Signal.SELL / Signal.NO_TRADE
    """

    # Minimum candles required for reliable analysis
    MIN_CANDLES = 50

    def analyze(self, df: pd.DataFrame) -> TechnicalAnalysisResult:
        """Run full technical analysis on OHLCV data.

        Args:
            df: DataFrame with columns: open, high, low, close, volume.
                Must have at least MIN_CANDLES rows.

        Returns:
            TechnicalAnalysisResult with indicators, signals, and recommendation.

        Raises:
            ValueError: If DataFrame is missing required columns or too short.
        """
        self._validate_dataframe(df)
        df = self._normalize_columns(df)

        indicators = self._calculate_indicators(df)
        signals = self._interpret_signals(indicators)
        support_resistance = self._calculate_support_resistance(df)
        market_condition = self._determine_market_condition(indicators, signals)
        overall_signal, strength = self._generate_overall_signal(indicators, signals)

        summary = self._build_summary(indicators, signals, overall_signal, strength)

        return TechnicalAnalysisResult(
            indicators=indicators,
            signals=signals,
            support_resistance=support_resistance,
            market_condition=market_condition,
            overall_signal=overall_signal,
            signal_strength=strength,
            summary=summary,
        )

    def calculate_indicators_only(self, df: pd.DataFrame) -> IndicatorValues:
        """Calculate raw indicators without signal interpretation.

        Useful when you just need numbers (e.g., for stock picker scoring).

        Args:
            df: OHLCV DataFrame.

        Returns:
            IndicatorValues with all calculated values.
        """
        self._validate_dataframe(df)
        df = self._normalize_columns(df)
        return self._calculate_indicators(df)

    # ━━━━━━━━━━━━ Private: Validation ━━━━━━━━━━━━

    def _validate_dataframe(self, df: pd.DataFrame) -> None:
        """Validate that the DataFrame has required columns and minimum rows."""
        required = {"open", "high", "low", "close", "volume"}
        # Case-insensitive column check
        actual = {c.lower() for c in df.columns}
        missing = required - actual
        if missing:
            raise ValueError(f"Missing OHLCV columns: {missing}")
        if len(df) < self.MIN_CANDLES:
            raise ValueError(
                f"Need at least {self.MIN_CANDLES} candles, got {len(df)}"
            )

    def _normalize_columns(self, df: pd.DataFrame) -> pd.DataFrame:
        """Normalize column names to lowercase for consistency."""
        df = df.copy()
        df.columns = [c.lower() for c in df.columns]
        return df

    # ━━━━━━━━━━━━ Private: Indicators ━━━━━━━━━━━━

    def _calculate_indicators(self, df: pd.DataFrame) -> IndicatorValues:
        """Calculate all technical indicators using pandas-ta."""
        close = df["close"]
        high = df["high"]
        low = df["low"]
        volume = df["volume"]

        iv = IndicatorValues()

        # Price context
        iv.current_price = float(close.iloc[-1])
        iv.prev_close = float(close.iloc[-2])
        iv.day_change_pct = ((iv.current_price - iv.prev_close) / iv.prev_close) * 100

        # RSI
        rsi = ta.rsi(close, length=14)
        iv.rsi = self._safe_last(rsi)

        # MACD
        macd_df = ta.macd(close, fast=12, slow=26, signal=9)
        if macd_df is not None and len(macd_df.columns) >= 3:
            iv.macd_line = self._safe_last(macd_df.iloc[:, 0])
            iv.macd_histogram = self._safe_last(macd_df.iloc[:, 1])
            iv.macd_signal = self._safe_last(macd_df.iloc[:, 2])

        # ADX + DI
        adx_df = ta.adx(high, low, close, length=14)
        if adx_df is not None and len(adx_df.columns) >= 3:
            iv.adx = self._safe_last(adx_df.iloc[:, 0])
            iv.plus_di = self._safe_last(adx_df.iloc[:, 1])
            iv.minus_di = self._safe_last(adx_df.iloc[:, 2])

        # Supertrend
        st_df = ta.supertrend(high, low, close, length=10, multiplier=3.0)
        if st_df is not None and len(st_df.columns) >= 2:
            iv.supertrend = self._safe_last(st_df.iloc[:, 0])
            iv.supertrend_direction = int(self._safe_last(st_df.iloc[:, 1]))

        # EMAs
        iv.ema_9 = self._safe_last(ta.ema(close, length=9))
        iv.ema_21 = self._safe_last(ta.ema(close, length=21))
        iv.ema_50 = self._safe_last(ta.ema(close, length=50))
        ema_200 = ta.ema(close, length=200)
        iv.ema_200 = self._safe_last(ema_200) if ema_200 is not None else 0.0

        # Bollinger Bands
        bb_df = ta.bbands(close, length=20, std=2.0)
        if bb_df is not None and len(bb_df.columns) >= 3:
            iv.bb_lower = self._safe_last(bb_df.iloc[:, 0])
            iv.bb_middle = self._safe_last(bb_df.iloc[:, 1])
            iv.bb_upper = self._safe_last(bb_df.iloc[:, 2])
            if iv.bb_middle > 0:
                iv.bb_width = ((iv.bb_upper - iv.bb_lower) / iv.bb_middle) * 100

        # ATR
        iv.atr = self._safe_last(ta.atr(high, low, close, length=14))

        # Volume analysis
        vol_sma = ta.sma(volume, length=20)
        current_vol = float(volume.iloc[-1])
        avg_vol = self._safe_last(vol_sma)
        iv.volume_ratio = (current_vol / avg_vol) if avg_vol > 0 else 1.0

        # MFI
        iv.mfi = self._safe_last(ta.mfi(high, low, close, volume, length=14))

        # OBV
        obv = ta.obv(close, volume)
        iv.obv = self._safe_last(obv)

        return iv

    # ━━━━━━━━━━━━ Private: Signal Interpretation ━━━━━━━━━━━━

    def _interpret_signals(self, iv: IndicatorValues) -> TechnicalSignals:
        """Convert raw indicator values into human-readable signals."""
        signals = TechnicalSignals()

        # RSI interpretation
        if iv.rsi < 30:
            signals.rsi_signal = "OVERSOLD"
        elif iv.rsi > 70:
            signals.rsi_signal = "OVERBOUGHT"
        else:
            signals.rsi_signal = "NEUTRAL"

        # MACD interpretation
        if iv.macd_histogram > 0 and iv.macd_line > iv.macd_signal:
            signals.macd_signal = "BULLISH"
        elif iv.macd_histogram < 0 and iv.macd_line < iv.macd_signal:
            signals.macd_signal = "BEARISH"
        else:
            signals.macd_signal = "NEUTRAL"

        # EMA interpretation (price vs EMA 21/50)
        if iv.current_price > iv.ema_21 > iv.ema_50:
            signals.ema_signal = "BULLISH"
        elif iv.current_price < iv.ema_21 < iv.ema_50:
            signals.ema_signal = "BEARISH"
        else:
            signals.ema_signal = "NEUTRAL"

        # ADX interpretation
        if iv.adx > 25 and iv.plus_di > iv.minus_di:
            signals.adx_signal = "STRONG_TREND"
        elif iv.adx > 25 and iv.minus_di > iv.plus_di:
            signals.adx_signal = "STRONG_TREND"
        elif iv.adx > 20:
            signals.adx_signal = "WEAK_TREND"
        else:
            signals.adx_signal = "NO_TREND"

        # Supertrend
        signals.supertrend_signal = (
            "BULLISH" if iv.supertrend_direction == 1 else "BEARISH"
        )

        # Bollinger Bands
        if iv.bb_width < 4:
            signals.bb_signal = "SQUEEZE"
        elif iv.bb_width > 10:
            signals.bb_signal = "EXPANSION"
        else:
            signals.bb_signal = "NEUTRAL"

        # Volume
        if iv.volume_ratio > 2.0:
            signals.volume_signal = "HIGH"
        elif iv.volume_ratio < 0.5:
            signals.volume_signal = "LOW"
        else:
            signals.volume_signal = "NORMAL"

        return signals

    # ━━━━━━━━━━━━ Private: Support/Resistance ━━━━━━━━━━━━

    def _calculate_support_resistance(self, df: pd.DataFrame) -> SupportResistance:
        """Calculate basic support/resistance using pivot points."""
        high = float(df["high"].iloc[-1])
        low = float(df["low"].iloc[-1])
        close = float(df["close"].iloc[-1])

        pivot = (high + low + close) / 3
        support = (2 * pivot) - high
        resistance = (2 * pivot) - low

        return SupportResistance(
            support=round(support, 2),
            resistance=round(resistance, 2),
            pivot=round(pivot, 2),
        )

    # ━━━━━━━━━━━━ Private: Market Condition ━━━━━━━━━━━━

    def _determine_market_condition(
        self, iv: IndicatorValues, signals: TechnicalSignals
    ) -> MarketCondition:
        """Determine the overall market condition from indicators."""
        bullish_count = 0
        bearish_count = 0

        if signals.ema_signal == "BULLISH":
            bullish_count += 1
        elif signals.ema_signal == "BEARISH":
            bearish_count += 1

        if signals.macd_signal == "BULLISH":
            bullish_count += 1
        elif signals.macd_signal == "BEARISH":
            bearish_count += 1

        if signals.supertrend_signal == "BULLISH":
            bullish_count += 1
        else:
            bearish_count += 1

        if iv.adx > 25:
            if bullish_count > bearish_count:
                return MarketCondition.UPTREND
            elif bearish_count > bullish_count:
                return MarketCondition.DOWNTREND

        return MarketCondition.RANGE_BOUND

    # ━━━━━━━━━━━━ Private: Overall Signal ━━━━━━━━━━━━

    def _generate_overall_signal(
        self, iv: IndicatorValues, signals: TechnicalSignals
    ) -> tuple[Signal, float]:
        """Generate composite buy/sell signal with strength score (0-100).

        Scoring weights:
            RSI sweet spot (30-50):     15 pts
            MACD bullish:               15 pts
            EMA alignment:              15 pts
            ADX strong trend:           10 pts
            Supertrend bullish:         15 pts
            Volume confirmation:        15 pts
            BB squeeze (potential):     15 pts

        Returns:
            Tuple of (Signal, strength_score).
        """
        score = 50.0  # Start neutral

        # RSI: favor oversold (buy) or overbought (sell)
        if signals.rsi_signal == "OVERSOLD":
            score += 15
        elif signals.rsi_signal == "OVERBOUGHT":
            score -= 15
        elif 40 <= iv.rsi <= 60:
            score += 5  # Neutral RSI — slight positive

        # MACD
        if signals.macd_signal == "BULLISH":
            score += 15
        elif signals.macd_signal == "BEARISH":
            score -= 15

        # EMA alignment
        if signals.ema_signal == "BULLISH":
            score += 15
        elif signals.ema_signal == "BEARISH":
            score -= 15

        # ADX trend strength
        if signals.adx_signal == "STRONG_TREND" and iv.plus_di > iv.minus_di:
            score += 10
        elif signals.adx_signal == "STRONG_TREND" and iv.minus_di > iv.plus_di:
            score -= 10

        # Supertrend
        if signals.supertrend_signal == "BULLISH":
            score += 15
        else:
            score -= 15

        # Volume confirmation
        if signals.volume_signal == "HIGH":
            score += 10
        elif signals.volume_signal == "LOW":
            score -= 5

        # BB squeeze — potential breakout
        if signals.bb_signal == "SQUEEZE":
            score += 5

        # Clamp to 0-100
        score = max(0.0, min(100.0, score))

        # Determine signal
        if score >= 70:
            signal = Signal.STRONG_BUY
        elif score >= 55:
            signal = Signal.BUY
        elif score <= 30:
            signal = Signal.SELL
        else:
            signal = Signal.NO_TRADE

        return signal, round(score, 1)

    # ━━━━━━━━━━━━ Private: Summary ━━━━━━━━━━━━

    def _build_summary(
        self,
        iv: IndicatorValues,
        signals: TechnicalSignals,
        overall: Signal,
        strength: float,
    ) -> str:
        """Build a human-readable summary of the analysis."""
        parts = [
            f"Price: {iv.current_price:.2f} ({iv.day_change_pct:+.2f}%)",
            f"RSI: {iv.rsi:.1f} ({signals.rsi_signal})",
            f"MACD: {signals.macd_signal}",
            f"EMA: {signals.ema_signal}",
            f"ADX: {iv.adx:.1f} ({signals.adx_signal})",
            f"Supertrend: {signals.supertrend_signal}",
            f"Volume: {iv.volume_ratio:.1f}x ({signals.volume_signal})",
            f"Signal: {overall.value} (strength: {strength}/100)",
        ]
        return " | ".join(parts)

    # ━━━━━━━━━━━━ Private: Helpers ━━━━━━━━━━━━

    @staticmethod
    def _safe_last(series: Optional[pd.Series]) -> float:
        """Safely extract the last value from a pandas Series."""
        if series is None or series.empty:
            return 0.0
        val = series.iloc[-1]
        if pd.isna(val):
            return 0.0
        return float(val)
