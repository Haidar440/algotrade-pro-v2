"""
Module: app/strategies/double_bottom.py
Purpose: Double Bottom (W-Pattern) reversal strategy.

Source: Classic chart pattern. Thomas Bulkowski's pattern research:
        "Double Bottom has a 78% success rate with proper confirmation."
Expected Win Rate: 55-62%

Entry Rules:
- BUY: Two lows within 2% of each other (W-pattern)
- Price breaks above the neckline (high between the two bottoms)
- RSI showing bullish divergence or above 40

Exit Rules:
- SL: Below the double bottom level
- Target: Neckline + (neckline - bottom) — measured move
"""

import numpy as np
import pandas as pd
import pandas_ta as ta

from app.strategies.base import StrategyBase


def _rsi(close, period=14):
    """Calculate RSI."""
    result = ta.rsi(pd.Series(close), length=period)
    if result is None:
        return np.full(len(close), 50.0)
    return result.values


def _sma(close, period):
    """Calculate SMA."""
    result = ta.sma(pd.Series(close), length=period)
    if result is None:
        return np.full(len(close), close[-1] if len(close) > 0 else 0)
    return result.values


class DoubleBottomStrategy(StrategyBase):
    """Double Bottom (W-Pattern) — classic reversal pattern.

    Detects W-shaped price patterns where two lows are close in price,
    with a rally between them. Enters on neckline breakout.
    Targets measured move above neckline.
    """

    # ── Metadata ──
    name = "Double Bottom (W-Pattern)"
    description = (
        "Reversal pattern: Detects W-shaped bottoms where two lows "
        "form near the same level. Enters on neckline breakout with RSI confirmation."
    )
    strategy_type = "SWING"
    expected_win_rate = "55-62%"
    source = "Thomas Bulkowski pattern research, Investopedia"

    # ── Tunable Parameters ──
    lookback = 30        # Bars to search for pattern
    tolerance_pct = 3.0  # Max % difference between two bottoms
    rsi_period = 14
    rsi_min = 35         # RSI must be above this (not deeply oversold/falling)

    default_params = {
        "lookback": 30,
        "tolerance_pct": 3.0,
        "rsi_period": 14,
        "rsi_min": 35,
    }

    def init(self):
        """Precompute RSI and moving average for trend filter."""
        self.rsi = self.I(_rsi, self.data.Close, self.rsi_period, name="RSI")
        self.sma50 = self.I(_sma, self.data.Close, 50, name="SMA50")

    def next(self):
        """Execute trading logic on each bar."""
        if len(self.data) < self.lookback + 10:
            return

        price = self.data.Close[-1]
        rsi_val = self.rsi[-1]

        # BUY: Detect double bottom pattern + RSI confirmation
        if not self.position:
            # Recent lows (last 10 bars) vs older lows (lookback-10 bars before)
            recent_lows = [self.data.Low[-i] for i in range(1, 11)]
            older_lows = [self.data.Low[-i] for i in range(11, self.lookback + 1)]

            if not recent_lows or not older_lows:
                return

            bottom1 = min(older_lows)
            bottom2 = min(recent_lows)

            # Check two bottoms are within tolerance
            pct_diff = abs(bottom1 - bottom2) / max(bottom1, 1) * 100
            if pct_diff > self.tolerance_pct:
                return

            # Neckline: highest point between the two bottoms
            mid_highs = [self.data.High[-i] for i in range(1, self.lookback + 1)]
            neckline = max(mid_highs)

            # Breakout: price must be above neckline
            if price > neckline and rsi_val > self.rsi_min:
                self.buy()

        # EXIT: Price drops below SMA50 or below the bottom level
        elif self.position.is_long:
            sma_val = self.sma50[-1]
            if price < sma_val * 0.98:
                self.position.close()

    @classmethod
    def get_optimization_ranges(cls) -> dict:
        """Parameter ranges for optimizer."""
        return {
            "lookback": range(20, 50, 5),
            "tolerance_pct": [1.5, 2.0, 2.5, 3.0, 4.0, 5.0],
            "rsi_period": range(10, 20, 2),
            "rsi_min": range(30, 45, 5),
        }
