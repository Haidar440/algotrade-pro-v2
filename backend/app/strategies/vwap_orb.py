"""
Module: app/strategies/vwap_orb.py
Purpose: VWAP Opening Range Breakout strategy (Intraday).

Source: Bank Nifty Reddit backtest (76% win rate, Aug 2024),
        DailyBulls ORB study (57-71% win rate).
Expected Win Rate: 60-70%

Entry Rules:
- Capture first N-minute high/low as "opening range"
- BUY: Price breaks above range high AND price > VWAP
- Volume must confirm (> 1.5× average)

Exit Rules:
- Target: 1.5× risk
- SL: Opposite boundary of opening range

Note: This strategy is designed for daily timeframe simulation.
      For real intraday use, 5-min or 15-min candles are needed.
      On daily data, it simulates the concept using daily range breakouts
      above/below the moving average (as a VWAP proxy).
"""

import numpy as np
import pandas as pd
import pandas_ta as ta

from app.strategies.base import StrategyBase


def _ema(close, period=20):
    """EMA as VWAP proxy for daily data."""
    result = ta.ema(pd.Series(close), length=period)
    if result is None:
        return np.full(len(close), close[-1] if len(close) > 0 else 0)
    return result.values


def _volume_ratio(volume, lookback=20):
    """Calculate volume relative to N-day average."""
    vol_series = pd.Series(volume)
    avg = vol_series.rolling(lookback).mean()
    ratio = vol_series / avg
    return ratio.fillna(1.0).values


def _highest(high, lookback=5):
    """Rolling highest high."""
    result = pd.Series(high).rolling(lookback).max()
    return result.fillna(high[0] if len(high) > 0 else 0).values


def _lowest(low, lookback=5):
    """Rolling lowest low."""
    result = pd.Series(low).rolling(lookback).min()
    return result.fillna(low[0] if len(low) > 0 else 0).values


class VWAPOrbStrategy(StrategyBase):
    """VWAP Opening Range Breakout — momentum breakout with volume confirmation.

    On daily data, this simulates ORB by:
    - Using EMA as VWAP proxy
    - Detecting breakouts above recent range high with volume confirmation
    - Exiting on mean reversion or opposite breakout

    For real intraday trading, use 5-min or 15-min data.
    """

    # ── Metadata ──
    name = "VWAP Opening Range Breakout"
    description = (
        "Breakout strategy: Buy on range high break with VWAP alignment "
        "and volume confirmation. 76% win rate on Bank Nifty backtest."
    )
    strategy_type = "INTRADAY"
    expected_win_rate = "60-70%"
    source = "Bank Nifty Reddit backtest (Aug 2024), DailyBulls ORB study"

    # ── Tunable Parameters ──
    range_lookback = 5    # Days to define range
    ema_period = 20       # VWAP proxy period
    volume_filter = 1.5   # Volume must be > this × average
    sl_pct = 2.0          # Stop loss %
    target_pct = 3.0      # Target %

    default_params = {
        "range_lookback": 5,
        "ema_period": 20,
        "volume_filter": 1.5,
        "sl_pct": 2.0,
        "target_pct": 3.0,
    }

    def init(self):
        """Precompute indicators."""
        self.ema = self.I(_ema, self.data.Close, self.ema_period, name="EMA (VWAP proxy)")
        self.vol_ratio = self.I(
            _volume_ratio, self.data.Volume, self.range_lookback * 4, name="Vol Ratio",
        )
        self.range_high = self.I(
            _highest, self.data.High, self.range_lookback, name="Range High",
        )
        self.range_low = self.I(
            _lowest, self.data.Low, self.range_lookback, name="Range Low",
        )

    def next(self):
        """Execute trading logic."""
        if len(self.data) < self.ema_period + self.range_lookback + 5:
            return

        price = self.data.Close[-1]
        prev_close = self.data.Close[-2]

        if not self.position:
            # BUY: Price breaks above range high, above EMA, with volume
            if (
                price > self.range_high[-2]        # Breakout above prior range
                and prev_close <= self.range_high[-2]  # Just broke out
                and price > self.ema[-1]           # Above VWAP proxy
                and self.vol_ratio[-1] > self.volume_filter  # Volume confirms
            ):
                sl_price = price * (1 - self.sl_pct / 100)
                tp_price = price * (1 + self.target_pct / 100)
                self.buy(sl=sl_price, tp=tp_price)

        elif self.position.is_long:
            # Exit if price drops below EMA
            if price < self.ema[-1]:
                self.position.close()

    @classmethod
    def get_optimization_ranges(cls) -> dict:
        """Parameter ranges for optimizer."""
        return {
            "range_lookback": range(3, 10),
            "ema_period": range(10, 30, 5),
            "volume_filter": [1.2, 1.5, 1.8, 2.0],
            "sl_pct": [1.5, 2.0, 2.5, 3.0],
            "target_pct": [2.0, 3.0, 4.0, 5.0],
        }
