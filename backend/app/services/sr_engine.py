"""
Module: app/services/sr_engine.py
Purpose: Advanced Support/Resistance engine — multi-timeframe pivots,
         swing highs/lows, and demand/supply zone detection.

Replaces the naive single-candle pivot in technical.py with a proper
multi-candle analysis that a real trader would use.
"""

import logging
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

MIN_CANDLES = 20  # Minimum candles required for meaningful S/R


@dataclass
class SRLevels:
    """Complete support/resistance profile for a stock."""

    support: float = 0.0
    resistance: float = 0.0
    pivot: float = 0.0
    s1: float = 0.0
    s2: float = 0.0
    r1: float = 0.0
    r2: float = 0.0
    demand_zone: tuple[float, float] = (0.0, 0.0)
    supply_zone: tuple[float, float] = (0.0, 0.0)
    swing_lows: list[float] = field(default_factory=list)
    swing_highs: list[float] = field(default_factory=list)


def _safe_float(val) -> float:
    """Convert to float, replacing NaN/Inf with 0."""
    if val is None:
        return 0.0
    f = float(val)
    if np.isnan(f) or np.isinf(f):
        return 0.0
    return round(f, 2)


class SREngine:
    """Calculates support/resistance levels from OHLCV data.

    Methods:
        calculate(df) -> SRLevels
    """

    def calculate(self, df: pd.DataFrame) -> SRLevels:
        """Run full S/R analysis.

        Args:
            df: OHLCV DataFrame with columns: open, high, low, close, volume.
                Must have at least MIN_CANDLES rows.

        Returns:
            SRLevels with pivots, demand/supply zones, and swing points.
        """
        if df is None or len(df) < MIN_CANDLES:
            logger.warning("Insufficient data for S/R (%d candles)", len(df) if df is not None else 0)
            return SRLevels()

        try:
            high = df["high"]
            low = df["low"]
            close = df["close"]

            # 1. Multi-candle pivot (last 5 days)
            pivot_data = self._calculate_pivots(high, low, close)

            # 2. Swing highs/lows
            swing_highs = self._find_swing_highs(high, window=5)
            swing_lows = self._find_swing_lows(low, window=5)

            # 3. Demand/Supply zones
            demand_zone = self._find_demand_zone(df, swing_lows)
            supply_zone = self._find_supply_zone(df, swing_highs)

            # 4. Nearest support/resistance from swing points
            current_price = _safe_float(close.iloc[-1])
            support = self._nearest_below(swing_lows, current_price, fallback=pivot_data["s1"])
            resistance = self._nearest_above(swing_highs, current_price, fallback=pivot_data["r1"])

            return SRLevels(
                support=_safe_float(support),
                resistance=_safe_float(resistance),
                pivot=_safe_float(pivot_data["pivot"]),
                s1=_safe_float(pivot_data["s1"]),
                s2=_safe_float(pivot_data["s2"]),
                r1=_safe_float(pivot_data["r1"]),
                r2=_safe_float(pivot_data["r2"]),
                demand_zone=(
                    _safe_float(demand_zone[0]),
                    _safe_float(demand_zone[1]),
                ),
                supply_zone=(
                    _safe_float(supply_zone[0]),
                    _safe_float(supply_zone[1]),
                ),
                swing_lows=[_safe_float(s) for s in swing_lows[-5:]],
                swing_highs=[_safe_float(s) for s in swing_highs[-5:]],
            )

        except Exception as e:
            logger.error("S/R calculation failed: %s", e, exc_info=True)
            return SRLevels()

    # ── Pivot Points (Classic Floor Pivots) ──

    def _calculate_pivots(
        self, high: pd.Series, low: pd.Series, close: pd.Series
    ) -> dict:
        """Classic floor pivot using last 5 candles' range.

        More stable than single-candle pivot because it captures the
        actual trading range over a week.
        """
        lookback = min(5, len(high))
        h = float(high.iloc[-lookback:].max())
        l = float(low.iloc[-lookback:].min())
        c = float(close.iloc[-1])

        pivot = (h + l + c) / 3
        s1 = (2 * pivot) - h
        s2 = pivot - (h - l)
        r1 = (2 * pivot) - l
        r2 = pivot + (h - l)

        return {"pivot": pivot, "s1": s1, "s2": s2, "r1": r1, "r2": r2}

    # ── Swing Detection ──

    def _find_swing_highs(self, high: pd.Series, window: int = 5) -> list[float]:
        """Find local maxima in highs series.

        A swing high is a candle whose high is higher than `window` candles
        on both sides. Returns the price values, sorted ascending.
        """
        highs_arr = high.values
        swings = []
        for i in range(window, len(highs_arr) - window):
            if highs_arr[i] == max(highs_arr[i - window : i + window + 1]):
                swings.append(float(highs_arr[i]))
        return sorted(set(swings))

    def _find_swing_lows(self, low: pd.Series, window: int = 5) -> list[float]:
        """Find local minima in lows series."""
        lows_arr = low.values
        swings = []
        for i in range(window, len(lows_arr) - window):
            if lows_arr[i] == min(lows_arr[i - window : i + window + 1]):
                swings.append(float(lows_arr[i]))
        return sorted(set(swings))

    # ── Demand / Supply Zones ──

    def _find_demand_zone(
        self, df: pd.DataFrame, swing_lows: list[float]
    ) -> tuple[float, float]:
        """Identify demand zone — price range where buyers stepped in.

        Logic: Find the most recent swing low cluster. The demand zone
        spans from the lowest to highest point of that consolidation,
        weighted by volume.
        """
        if not swing_lows:
            # Fallback: use last 10 candles' low range
            recent = df.iloc[-10:]
            return (float(recent["low"].min()), float(recent["low"].quantile(0.25)))

        # Cluster nearby swing lows (within 2% of each other)
        clusters = self._cluster_levels(swing_lows, threshold=0.02)
        if not clusters:
            lo = swing_lows[-1]
            return (lo * 0.99, lo * 1.01)

        # Use the cluster closest to current price (most relevant)
        current = float(df["close"].iloc[-1])
        best_cluster = min(clusters, key=lambda c: abs(np.mean(c) - current))
        return (min(best_cluster), max(best_cluster))

    def _find_supply_zone(
        self, df: pd.DataFrame, swing_highs: list[float]
    ) -> tuple[float, float]:
        """Identify supply zone — price range where sellers appeared."""
        if not swing_highs:
            recent = df.iloc[-10:]
            return (float(recent["high"].quantile(0.75)), float(recent["high"].max()))

        clusters = self._cluster_levels(swing_highs, threshold=0.02)
        if not clusters:
            hi = swing_highs[-1]
            return (hi * 0.99, hi * 1.01)

        current = float(df["close"].iloc[-1])
        # Supply zone should be ABOVE current price
        above = [c for c in clusters if np.mean(c) > current]
        if above:
            best_cluster = min(above, key=lambda c: np.mean(c) - current)
        else:
            best_cluster = max(clusters, key=lambda c: np.mean(c))
        return (min(best_cluster), max(best_cluster))

    # ── Utilities ──

    def _cluster_levels(
        self, levels: list[float], threshold: float = 0.02
    ) -> list[list[float]]:
        """Group nearby price levels into clusters.

        Two levels are in the same cluster if they're within `threshold`
        (as a fraction) of each other.
        """
        if not levels:
            return []

        sorted_levels = sorted(levels)
        clusters: list[list[float]] = [[sorted_levels[0]]]

        for level in sorted_levels[1:]:
            if abs(level - clusters[-1][-1]) / clusters[-1][-1] < threshold:
                clusters[-1].append(level)
            else:
                clusters.append([level])

        return clusters

    def _nearest_below(
        self, levels: list[float], price: float, fallback: float
    ) -> float:
        """Find nearest level below current price."""
        below = [l for l in levels if l < price]
        return max(below) if below else fallback

    def _nearest_above(
        self, levels: list[float], price: float, fallback: float
    ) -> float:
        """Find nearest level above current price."""
        above = [l for l in levels if l > price]
        return min(above) if above else fallback
