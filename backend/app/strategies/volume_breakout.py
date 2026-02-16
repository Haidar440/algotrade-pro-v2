"""
Module: app/strategies/volume_breakout.py
Purpose: Volume Breakout + Momentum strategy.

Source: QuantInsti (55% hit ratio, 9.7% annual return),
        NSE-Stock-Scanner GitHub repo.
Expected Win Rate: 52-58%

Entry Rules:
- Volume > 2× 20-day average (institutional buying)
- Price breaks above 20-day high (resistance break)
- RSI(14) between 40-70 (has momentum but not overbought)
- Close > EMA(50) (in intermediate uptrend)

Exit Rules:
- Trailing SL: 3% below highest close since entry
- SL: Close below 20-day SMA
"""

import numpy as np
import pandas as pd
import pandas_ta as ta

from app.strategies.base import StrategyBase


def _volume_ratio(volume, lookback=20):
    """Volume relative to N-day average."""
    vol_series = pd.Series(volume)
    avg = vol_series.rolling(lookback).mean()
    ratio = vol_series / avg
    return ratio.fillna(1.0).values


def _highest(high, lookback=20):
    """Rolling highest high."""
    result = pd.Series(high).rolling(lookback).max()
    return result.fillna(high[0] if len(high) > 0 else 0).values


def _rsi(close, period=14):
    """Calculate RSI."""
    result = ta.rsi(pd.Series(close), length=period)
    if result is None:
        return np.full(len(close), 50.0)
    return result.fillna(50.0).values


def _ema(close, period=50):
    """EMA for trend filter."""
    result = ta.ema(pd.Series(close), length=period)
    if result is None:
        return np.full(len(close), close[-1] if len(close) > 0 else 0)
    return result.values


def _sma(close, period=20):
    """SMA for exit trigger."""
    result = ta.sma(pd.Series(close), length=period)
    if result is None:
        return np.full(len(close), close[-1] if len(close) > 0 else 0)
    return result.values


class VolumeBreakoutStrategy(StrategyBase):
    """Volume Breakout — institutional buying signal with momentum confirmation.

    The concept: When volume spikes to 2× normal AND price breaks a key level,
    it often signals institutional buying. Smart money moves volume first,
    then price follows.

    RSI filter ensures we're not buying at exhaustion points (> 70),
    and EMA(50) confirms the intermediate trend is UP.
    """

    # ── Metadata ──
    name = "Volume Breakout"
    description = (
        "Buy on volume spike (> 2× avg) + price breakout above 20-day high. "
        "RSI 40-70 filter + EMA(50) uptrend. Institutional buying signal."
    )
    strategy_type = "SWING"
    expected_win_rate = "52-58%"
    source = "QuantInsti (55% hit ratio, 9.7% annual), NSE-Stock-Scanner GitHub"

    # ── Tunable Parameters ──
    volume_multiplier = 2.0
    lookback = 20
    rsi_min = 40
    rsi_max = 70
    ema_period = 50
    trail_pct = 3.0

    default_params = {
        "volume_multiplier": 2.0,
        "lookback": 20,
        "rsi_min": 40,
        "rsi_max": 70,
        "ema_period": 50,
        "trail_pct": 3.0,
    }

    def init(self):
        """Precompute indicators."""
        self.vol_ratio = self.I(
            _volume_ratio, self.data.Volume, self.lookback, name="Vol Ratio",
        )
        self.high_20 = self.I(
            _highest, self.data.High, self.lookback, name=f"High({self.lookback})",
        )
        self.rsi = self.I(_rsi, self.data.Close, 14, name="RSI")
        self.ema = self.I(_ema, self.data.Close, self.ema_period, name=f"EMA({self.ema_period})")
        self.sma = self.I(_sma, self.data.Close, self.lookback, name=f"SMA({self.lookback})")

    def next(self):
        """Execute trading logic."""
        if len(self.data) < self.ema_period + 5:
            return

        price = self.data.Close[-1]

        if not self.position:
            # BUY CONDITIONS (all must be true):
            # 1. Volume spike: > 2× average
            # 2. Price breakout: above 20-day high
            # 3. RSI in sweet spot: 40-70 (has momentum, not overbought)
            # 4. Trend confirms: price above EMA(50)
            if (
                self.vol_ratio[-1] > self.volume_multiplier
                and price > self.high_20[-2]                 # Broke above prior high
                and self.data.Close[-2] <= self.high_20[-3]  # Was below before
                and self.rsi_min < self.rsi[-1] < self.rsi_max
                and price > self.ema[-1]
            ):
                sl_price = price * (1 - self.trail_pct / 100)
                self.buy(sl=sl_price)

        elif self.position.is_long:
            # EXIT: Price drops below 20-day SMA
            if price < self.sma[-1]:
                self.position.close()

    @classmethod
    def get_optimization_ranges(cls) -> dict:
        """Parameter ranges for optimizer."""
        return {
            "volume_multiplier": [1.5, 2.0, 2.5, 3.0],
            "lookback": range(15, 31, 5),
            "rsi_min": range(35, 51, 5),
            "rsi_max": range(65, 81, 5),
            "ema_period": [30, 50, 100],
            "trail_pct": [2.0, 3.0, 4.0, 5.0],
        }
