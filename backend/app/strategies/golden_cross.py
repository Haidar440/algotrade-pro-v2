"""
Module: app/strategies/golden_cross.py
Purpose: Golden Cross (50/200 EMA) strategy.

Source: Classic Wall Street signal. Historically produces 8-12% annualized
        returns on large-cap indices. Widely cited in institutional research.
Expected Win Rate: 50-55% (but high avg win vs avg loss)

Entry Rules:
- BUY: EMA(50) crosses above SMA(200) AND price > EMA(50)
- Confirmation: Volume above 20-day average

Exit Rules:
- SL: SMA(200) — dynamic trailing
- Target: Opposite death cross (EMA50 < SMA200)
"""

import numpy as np
import pandas as pd
import pandas_ta as ta

from app.strategies.base import StrategyBase


def _ema(close, period):
    """Calculate EMA."""
    result = ta.ema(pd.Series(close), length=period)
    if result is None:
        return np.full(len(close), close[-1] if len(close) > 0 else 0)
    return result.values


def _sma(close, period):
    """Calculate SMA."""
    result = ta.sma(pd.Series(close), length=period)
    if result is None:
        return np.full(len(close), close[-1] if len(close) > 0 else 0)
    return result.values


def _volume_sma(volume, period=20):
    """Calculate volume SMA for confirmation."""
    result = ta.sma(pd.Series(volume), length=period)
    if result is None:
        return np.full(len(volume), 0)
    return result.values


class GoldenCrossStrategy(StrategyBase):
    """Golden Cross — classic institutional trend-following signal.

    BUY when EMA(50) crosses above SMA(200) with price confirmation.
    EXIT when death cross occurs (EMA50 drops below SMA200).

    The volume filter reduces false signals in low-conviction crossovers.
    """

    # ── Metadata ──
    name = "Golden Cross (50/200)"
    description = (
        "Classic institutional signal: Buy when EMA(50) crosses above SMA(200). "
        "High win size compensates for moderate win rate. Volume filter reduces fakeouts."
    )
    strategy_type = "SWING"
    expected_win_rate = "50-55%"
    source = "Institutional research, classic technical analysis"

    # ── Tunable Parameters ──
    ema_fast = 50
    sma_slow = 200
    volume_filter = 1.0  # Multiplier: volume must be > avg * this

    default_params = {
        "ema_fast": 50,
        "sma_slow": 200,
        "volume_filter": 1.0,
    }

    def init(self):
        """Precompute EMAs and volume average."""
        self.ema50 = self.I(_ema, self.data.Close, self.ema_fast, name="EMA50")
        self.sma200 = self.I(_sma, self.data.Close, self.sma_slow, name="SMA200")
        self.vol_avg = self.I(_volume_sma, self.data.Volume, 20, name="VolAvg")

    def next(self):
        """Execute trading logic on each bar."""
        if len(self.data) < self.sma_slow + 5:
            return

        ema_now = self.ema50[-1]
        ema_prev = self.ema50[-2]
        sma_now = self.sma200[-1]
        sma_prev = self.sma200[-2]
        price = self.data.Close[-1]
        vol = self.data.Volume[-1]
        vol_avg = self.vol_avg[-1]

        # BUY: Golden Cross + price confirmation + volume filter
        if not self.position:
            golden_cross = ema_prev <= sma_prev and ema_now > sma_now
            golden_zone = ema_now > sma_now and price > ema_now
            vol_ok = vol_avg <= 0 or vol >= vol_avg * self.volume_filter

            if (golden_cross or golden_zone) and vol_ok:
                self.buy()

        # EXIT: Death Cross
        elif self.position.is_long:
            death_cross = ema_prev >= sma_prev and ema_now < sma_now
            if death_cross:
                self.position.close()

    @classmethod
    def get_optimization_ranges(cls) -> dict:
        """Parameter ranges for optimizer."""
        return {
            "ema_fast": range(30, 60, 5),
            "sma_slow": range(150, 250, 10),
            "volume_filter": [0.8, 1.0, 1.2, 1.5],
        }
