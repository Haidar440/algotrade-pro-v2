"""
Module: app/strategies/bollinger_squeeze.py
Purpose: Bollinger Band Squeeze Breakout strategy.

Source: John Bollinger's original Squeeze concept. Low bandwidth periods
        precede high-volatility moves. Combined with volume confirmation.
Expected Win Rate: 52-58%

Entry Rules:
- BUY: Bandwidth < threshold (squeeze) AND price breaks above upper band
- Volume must confirm the breakout (above average)

Exit Rules:
- SL: Bollinger middle band (20-SMA)
- Target: 2× ATR from entry OR price falls below middle band
"""

import numpy as np
import pandas as pd
import pandas_ta as ta

from app.strategies.base import StrategyBase


def _bbands(close, period=20, std=2.0):
    """Calculate Bollinger Bands — returns (upper, middle, lower, bandwidth)."""
    bb = ta.bbands(pd.Series(close), length=period, std=std)
    if bb is None or bb.empty:
        mid = np.full(len(close), close[-1] if len(close) > 0 else 0)
        return mid, mid, mid, np.zeros(len(close))

    cols = bb.columns.tolist()
    upper = bb[cols[0]].values  # BBU
    middle = bb[cols[1]].values  # BBM
    lower = bb[cols[2]].values  # BBL
    bandwidth = bb[cols[3]].values if len(cols) > 3 else (upper - lower) / np.where(middle > 0, middle, 1)
    return upper, middle, lower, bandwidth


def _volume_sma(volume, period=20):
    """Calculate volume SMA."""
    result = ta.sma(pd.Series(volume), length=period)
    if result is None:
        return np.full(len(volume), 0)
    return result.values


class BollingerSqueezeStrategy(StrategyBase):
    """Bollinger Band Squeeze Breakout — volatility compression play.

    BUY when Bollinger Bands squeeze (low bandwidth) and price breaks
    above the upper band with volume confirmation.
    EXIT when price drops below the middle band.
    """

    # ── Metadata ──
    name = "Bollinger Squeeze Breakout"
    description = (
        "Volatility compression: Enter when bands squeeze tight and price "
        "breaks above the upper band. Volume confirms the breakout."
    )
    strategy_type = "BOTH"
    expected_win_rate = "52-58%"
    source = "John Bollinger's Squeeze concept, TradingView backtests"

    # ── Tunable Parameters ──
    bb_period = 20
    bb_std = 2.0
    squeeze_threshold = 0.10  # Bandwidth < this = squeeze
    volume_filter = 1.2

    default_params = {
        "bb_period": 20,
        "bb_std": 2.0,
        "squeeze_threshold": 0.10,
        "volume_filter": 1.2,
    }

    def init(self):
        """Precompute Bollinger Bands and volume average."""
        bb_data = self.I(
            _bbands, self.data.Close, self.bb_period, self.bb_std,
            name="BBands", plot=False,
        )
        # bbands returns a tuple, self.I wraps each element
        self.bb_upper = bb_data[0] if isinstance(bb_data, (list, tuple)) else bb_data
        self.bb_middle = bb_data[1] if isinstance(bb_data, (list, tuple)) else bb_data
        self.bb_lower = bb_data[2] if isinstance(bb_data, (list, tuple)) else bb_data
        self.bb_bandwidth = bb_data[3] if isinstance(bb_data, (list, tuple)) else bb_data
        self.vol_avg = self.I(_volume_sma, self.data.Volume, 20, name="VolAvg")

    def next(self):
        """Execute trading logic on each bar."""
        if len(self.data) < self.bb_period + 5:
            return

        price = self.data.Close[-1]
        upper = self.bb_upper[-1]
        middle = self.bb_middle[-1]
        bandwidth = self.bb_bandwidth[-1]
        vol = self.data.Volume[-1]
        vol_avg = self.vol_avg[-1]

        is_squeeze = bandwidth < self.squeeze_threshold
        vol_ok = vol_avg <= 0 or vol >= vol_avg * self.volume_filter

        # BUY: Squeeze + breakout above upper band + volume
        if not self.position:
            if is_squeeze and price > upper and vol_ok:
                self.buy()

        # EXIT: Price drops below middle band
        elif self.position.is_long:
            if price < middle:
                self.position.close()

    @classmethod
    def get_optimization_ranges(cls) -> dict:
        """Parameter ranges for optimizer."""
        return {
            "bb_period": range(15, 30, 5),
            "bb_std": [1.5, 2.0, 2.5, 3.0],
            "squeeze_threshold": [0.06, 0.08, 0.10, 0.12, 0.15],
            "volume_filter": [1.0, 1.2, 1.5, 2.0],
        }
