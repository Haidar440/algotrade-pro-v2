"""
Module: app/services/target_engine.py
Purpose: S/R-based target calculation using pivots, Fibonacci, and swing levels.

Replaces the naive `price * 1.10` targets with real chart-based levels.
Answers: "What are realistic profit targets based on historical price action?"
"""

import logging
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from app.services.sr_engine import SRLevels

logger = logging.getLogger(__name__)

MIN_CANDLES = 10


@dataclass
class SingleTarget:
    """A single price target."""

    price: float = 0.0
    percent_gain: float = 0.0   # % gain from entry
    logic: str = ""             # Why this level


@dataclass
class TargetResult:
    """Complete target calculation result."""

    targets: list[SingleTarget] = field(default_factory=list)
    risk_reward_ratio: float = 0.0  # Overall R:R for T1


class TargetEngine:
    """Calculates profit targets from S/R levels.

    Target priorities:
    T1 = Nearest resistance (R1, supply zone bottom, or 20-day high)
    T2 = Fibonacci 1.618 extension OR R2 pivot
    T3 = Major resistance (50-day high or extended Fibonacci)

    Minimum R:R enforcement: T1 must be >= 1:1 R:R from stop loss.
    If all S/R levels are too close, falls back to ATR-based multiples.

    Methods:
        calculate(df, indicators, sr_levels, entry, stop_loss) -> TargetResult
    """

    def calculate(
        self,
        df: pd.DataFrame,
        sr_levels: SRLevels,
        entry_price: float,
        stop_loss: float,
        atr: float,
    ) -> TargetResult:
        """Calculate 3 profit targets.

        Args:
            df: OHLCV DataFrame.
            sr_levels: Support/resistance levels.
            entry_price: Smart entry price from EntryEngine.
            stop_loss: Stop loss from EntryEngine.
            atr: Average True Range.

        Returns:
            TargetResult with 3 targets and R:R ratio.
        """
        if entry_price <= 0:
            return TargetResult()

        try:
            # Risk distance
            risk = abs(entry_price - stop_loss) if stop_loss > 0 else atr * 1.5
            risk = max(risk, atr * 0.5)  # Floor: at least 0.5 ATR

            # Collect candidate target levels
            candidates = self._collect_candidates(df, sr_levels, entry_price, atr)

            # Filter: only above entry price (for BUY)
            above = sorted([c for c in candidates if c[0] > entry_price], key=lambda x: x[0])

            # Build 3 targets
            targets: list[SingleTarget] = []

            # T1: Nearest resistance above entry (must be >= 1:1 R:R)
            min_t1 = entry_price + risk  # 1:1 R:R minimum
            t1_candidates = [c for c in above if c[0] >= min_t1]
            if t1_candidates:
                t1_price, t1_logic = t1_candidates[0]
            else:
                # ATR-based fallback
                t1_price = entry_price + (atr * 1.5)
                t1_logic = "1.5× ATR extension"

            targets.append(SingleTarget(
                price=self._safe(t1_price),
                percent_gain=self._pct(entry_price, t1_price),
                logic=t1_logic,
            ))

            # T2: Fibonacci 1.618 extension or next S/R level
            fib_1618 = self._fibonacci_extension(df, entry_price, 1.618)
            t2_candidates = [c for c in above if c[0] > t1_price * 1.005]
            if t2_candidates:
                t2_price, t2_logic = t2_candidates[0]
                # Use Fibonacci if it's between T1 and this candidate
                if fib_1618 > t1_price and fib_1618 < t2_price:
                    t2_price = fib_1618
                    t2_logic = "Fibonacci 1.618 extension"
            elif fib_1618 > t1_price:
                t2_price = fib_1618
                t2_logic = "Fibonacci 1.618 extension"
            else:
                t2_price = entry_price + (atr * 2.5)
                t2_logic = "2.5× ATR extension"

            targets.append(SingleTarget(
                price=self._safe(t2_price),
                percent_gain=self._pct(entry_price, t2_price),
                logic=t2_logic,
            ))

            # T3: Major resistance or Fibonacci 2.618
            fib_2618 = self._fibonacci_extension(df, entry_price, 2.618)
            t3_candidates = [c for c in above if c[0] > t2_price * 1.005]
            if t3_candidates:
                t3_price, t3_logic = t3_candidates[0]
            elif fib_2618 > t2_price:
                t3_price = fib_2618
                t3_logic = "Fibonacci 2.618 extension"
            else:
                t3_price = entry_price + (atr * 3.5)
                t3_logic = "3.5× ATR extension"

            targets.append(SingleTarget(
                price=self._safe(t3_price),
                percent_gain=self._pct(entry_price, t3_price),
                logic=t3_logic,
            ))

            # Risk:Reward ratio for T1
            rr = (t1_price - entry_price) / risk if risk > 0 else 0

            return TargetResult(
                targets=targets,
                risk_reward_ratio=self._safe(rr),
            )

        except Exception as e:
            logger.error("Target calculation failed: %s", e, exc_info=True)
            return TargetResult()

    # ── Candidate Collection ──

    def _collect_candidates(
        self,
        df: pd.DataFrame,
        sr: SRLevels,
        entry: float,
        atr: float,
    ) -> list[tuple[float, str]]:
        """Collect all potential target levels from different sources."""
        candidates: list[tuple[float, str]] = []

        # Pivot levels
        if sr.r1 > 0:
            candidates.append((sr.r1, "R1 pivot resistance"))
        if sr.r2 > 0:
            candidates.append((sr.r2, "R2 pivot resistance"))

        # Supply zone bottom
        sz_low, sz_high = sr.supply_zone
        if sz_low > 0:
            candidates.append((sz_low, f"Supply zone bottom ₹{sz_low:.2f}"))

        # Swing highs
        for sh in sr.swing_highs:
            if sh > entry:
                candidates.append((sh, f"Swing high ₹{sh:.2f}"))

        # 20-day / 50-day highs from DataFrame
        if df is not None and len(df) >= 20:
            high_20 = float(df["high"].iloc[-20:].max())
            if high_20 > entry:
                candidates.append((high_20, "20-day high"))

        if df is not None and len(df) >= 50:
            high_50 = float(df["high"].iloc[-50:].max())
            if high_50 > entry and high_50 != (candidates[-1][0] if candidates else 0):
                candidates.append((high_50, "50-day high"))

        return candidates

    # ── Fibonacci Extension ──

    def _fibonacci_extension(
        self, df: pd.DataFrame, entry: float, ratio: float
    ) -> float:
        """Calculate Fibonacci extension from recent swing low to swing high."""
        if df is None or len(df) < MIN_CANDLES:
            return 0

        try:
            recent = df.iloc[-30:] if len(df) >= 30 else df
            swing_low = float(recent["low"].min())
            swing_high = float(recent["high"].max())
            move = swing_high - swing_low

            if move <= 0:
                return 0

            extension = swing_low + (move * ratio)
            return extension if extension > entry else 0

        except Exception:
            return 0

    # ── Utilities ──

    @staticmethod
    def _safe(val: float) -> float:
        if val is None or np.isnan(val) or np.isinf(val):
            return 0.0
        return round(val, 2)

    @staticmethod
    def _pct(entry: float, target: float) -> float:
        if entry <= 0:
            return 0.0
        return round(((target - entry) / entry) * 100, 2)
