"""
Module: app/services/entry_engine.py
Purpose: Smart entry price calculation using demand zones, VWAP, support, and ATR.

Replaces the naive `price * 1.01` entry with proper institutional-grade logic.
Answers: "At what EXACT price should I place my buy order?"
"""

import logging
from dataclasses import dataclass

import numpy as np
import pandas as pd

from app.services.sr_engine import SRLevels
from app.services.technical import TechnicalAnalysisResult

logger = logging.getLogger(__name__)

MIN_CANDLES = 10


@dataclass
class EntryResult:
    """Smart entry calculation result."""

    exact_entry: float = 0.0
    entry_range_low: float = 0.0
    entry_range_high: float = 0.0
    entry_logic: str = "Current market price"
    stop_loss: float = 0.0
    stop_loss_reason: str = "Default ATR-based stop"
    risk_percent: float = 0.0  # % distance from entry to stop loss


def _safe(val: float) -> float:
    """Replace NaN/Inf with 0."""
    if val is None or np.isnan(val) or np.isinf(val):
        return 0.0
    return round(val, 2)


class EntryEngine:
    """Calculates optimal entry price and stop loss.

    Priority order:
    1. Demand zone retest
    2. VWAP proximity
    3. Support bounce (pivot S1 or swing low)
    4. EMA pullback (50 EMA in uptrend)
    5. Fallback: current price with ATR buffer

    Methods:
        calculate(df, indicators, sr_levels) -> EntryResult
    """

    def calculate(
        self,
        df: pd.DataFrame,
        indicators: TechnicalAnalysisResult,
        sr_levels: SRLevels,
    ) -> EntryResult:
        """Calculate smart entry price and stop loss.

        Args:
            df: OHLCV DataFrame.
            indicators: Technical analysis result.
            sr_levels: Support/resistance levels.

        Returns:
            EntryResult with exact entry, range, logic, and stop loss.
        """
        if df is None or len(df) < MIN_CANDLES:
            return EntryResult()

        try:
            iv = indicators.indicators
            price = iv.current_price
            atr = iv.atr if iv.atr > 0 else price * 0.02  # 2% fallback

            if price <= 0:
                return EntryResult()

            # Calculate VWAP from recent candles
            vwap = self._calculate_vwap(df, period=20)

            # Try each entry strategy in priority order
            entry, logic = self._try_demand_zone(price, atr, sr_levels)
            if entry == 0:
                entry, logic = self._try_vwap(price, atr, vwap)
            if entry == 0:
                entry, logic = self._try_support_bounce(price, atr, sr_levels)
            if entry == 0:
                entry, logic = self._try_ema_pullback(price, atr, iv)
            if entry == 0:
                entry = price
                logic = "Current market price"

            # Entry range: ±ATR*0.3 around exact entry
            buffer = atr * 0.3
            range_low = entry - buffer
            range_high = entry + buffer

            # Stop loss calculation
            sl, sl_reason = self._calculate_stop_loss(
                entry, atr, sr_levels, iv
            )

            # Risk percent
            risk_pct = abs(entry - sl) / entry * 100 if entry > 0 else 0

            return EntryResult(
                exact_entry=_safe(entry),
                entry_range_low=_safe(range_low),
                entry_range_high=_safe(range_high),
                entry_logic=logic,
                stop_loss=_safe(sl),
                stop_loss_reason=sl_reason,
                risk_percent=_safe(risk_pct),
            )

        except Exception as e:
            logger.error("Entry calculation failed: %s", e, exc_info=True)
            return EntryResult()

    # ── Entry Strategies (priority order) ──

    def _try_demand_zone(
        self, price: float, atr: float, sr: SRLevels
    ) -> tuple[float, str]:
        """If price is within or near the demand zone, enter at zone top."""
        dz_low, dz_high = sr.demand_zone
        if dz_low <= 0 or dz_high <= 0:
            return 0, ""

        # Price is within the demand zone or within 1% above it
        if dz_low <= price <= dz_high * 1.01:
            entry = dz_high
            return entry, f"Demand zone retest ₹{dz_low:.2f}-{dz_high:.2f}"

        # Price is just above demand zone (within 2%)
        if dz_high < price <= dz_high * 1.02:
            entry = dz_high + (atr * 0.1)
            return entry, f"Near demand zone ₹{dz_high:.2f} + ATR buffer"

        return 0, ""

    def _try_vwap(
        self, price: float, atr: float, vwap: float
    ) -> tuple[float, str]:
        """If price is within 1.5% of VWAP, use VWAP as entry reference."""
        if vwap <= 0:
            return 0, ""

        distance = abs(price - vwap) / price
        if distance < 0.015:
            entry = vwap + (atr * 0.1)
            return entry, f"VWAP confluence ₹{vwap:.2f}"

        return 0, ""

    def _try_support_bounce(
        self, price: float, atr: float, sr: SRLevels
    ) -> tuple[float, str]:
        """If price is near S1 or a swing low, enter with ATR buffer."""
        # Check S1 pivot
        if sr.s1 > 0 and abs(price - sr.s1) / price < 0.02:
            entry = sr.s1 + (atr * 0.2)
            return entry, f"S1 pivot support ₹{sr.s1:.2f} + buffer"

        # Check nearest swing low
        if sr.swing_lows:
            nearest = min(sr.swing_lows, key=lambda s: abs(s - price))
            if abs(price - nearest) / price < 0.02:
                entry = nearest + (atr * 0.2)
                return entry, f"Swing low support ₹{nearest:.2f} + buffer"

        return 0, ""

    def _try_ema_pullback(
        self, price: float, atr: float, iv
    ) -> tuple[float, str]:
        """If uptrend and price is near EMA50, enter at EMA + buffer."""
        ema50 = iv.ema_50
        ema200 = iv.ema_200

        if ema50 <= 0:
            return 0, ""

        # Uptrend check: price > EMA50 > EMA200
        is_uptrend = price > ema50 and (ema200 <= 0 or ema50 > ema200)
        dist_to_50 = abs(price - ema50) / price

        if is_uptrend and dist_to_50 < 0.03:
            entry = ema50 + (atr * 0.1)
            return entry, f"EMA 50 pullback ₹{ema50:.2f} + buffer"

        return 0, ""

    # ── Stop Loss ──

    def _calculate_stop_loss(
        self, entry: float, atr: float, sr: SRLevels, iv
    ) -> tuple[float, str]:
        """Calculate stop loss using the safest level.

        Priority:
        1. Below demand zone low
        2. Below nearest swing low
        3. Below S1 pivot
        4. ATR-based: entry - 1.5*ATR
        """
        candidates: list[tuple[float, str]] = []

        # 1. Below demand zone
        dz_low = sr.demand_zone[0]
        if dz_low > 0 and dz_low < entry:
            sl = dz_low - (atr * 0.3)
            candidates.append((sl, f"Below demand zone ₹{dz_low:.2f}"))

        # 2. Below nearest swing low
        if sr.swing_lows:
            below_entry = [s for s in sr.swing_lows if s < entry]
            if below_entry:
                nearest = max(below_entry)
                sl = nearest - (atr * 0.2)
                candidates.append((sl, f"Below swing low ₹{nearest:.2f}"))

        # 3. Below S1 pivot
        if sr.s1 > 0 and sr.s1 < entry:
            sl = sr.s1 - (atr * 0.2)
            candidates.append((sl, f"Below S1 pivot ₹{sr.s1:.2f}"))

        # 4. ATR-based fallback
        sl_atr = entry - (atr * 1.5)
        candidates.append((sl_atr, f"ATR-based ({1.5:.1f}× ATR)"))

        # Pick the tightest stop that makes sense (highest value = least risk)
        # But must be below entry
        valid = [(sl, r) for sl, r in candidates if 0 < sl < entry]
        if valid:
            # Use the highest (tightest) stop
            best = max(valid, key=lambda x: x[0])
            return best
        else:
            return (sl_atr, "ATR-based fallback")

    # ── Helpers ──

    def _calculate_vwap(self, df: pd.DataFrame, period: int = 20) -> float:
        """Calculate Volume-Weighted Average Price."""
        try:
            recent = df.iloc[-period:]
            typical_price = (recent["high"] + recent["low"] + recent["close"]) / 3
            pv = (typical_price * recent["volume"]).sum()
            vol = recent["volume"].sum()
            if vol > 0:
                return float(pv / vol)
        except Exception:
            pass
        return 0.0
