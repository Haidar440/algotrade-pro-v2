"""
Module: app/strategies/vcp_breakout.py
Purpose: Volatility Contraction Pattern (VCP) Breakout strategy.

Source: Mark Minervini (US Investing Champion, 334% return in 2021),
        TraderLion analysis (60-70% success rate).
Expected Win Rate: 55-65%

Entry Rules:
- Detect Bollinger Band width contraction (volatility squeeze)
- BUY on breakout: Price > upper BB AND volume > 1.5× average
- Minervini filters: Price > 150-day SMA, Price > 200-day SMA

Exit Rules:
- SL: 5-8% below breakout price
- Target: 3:1 risk/reward
"""

import numpy as np
import pandas as pd
import pandas_ta as ta

from app.strategies.base import StrategyBase


def _bbands_width(close, period=20, std=2.0):
    """Calculate Bollinger Bands width (normalized).

    Width = (Upper - Lower) / Middle. Lower width = tighter bands = VCP.
    """
    result = ta.bbands(pd.Series(close), length=period, std=std)
    if result is None:
        return np.full(len(close), 0.1)
    # Columns: BBL, BBM, BBU, BBB, BBP
    bbb_col = [c for c in result.columns if "BBB" in c]
    if bbb_col:
        return result[bbb_col[0]].fillna(0.1).values
    return np.full(len(close), 0.1)


def _bb_upper(close, period=20, std=2.0):
    """Upper Bollinger Band."""
    result = ta.bbands(pd.Series(close), length=period, std=std)
    if result is None:
        return np.full(len(close), close[-1] if len(close) > 0 else 0)
    bbu_col = [c for c in result.columns if "BBU" in c]
    if bbu_col:
        return result[bbu_col[0]].fillna(close[-1] if len(close) > 0 else 0).values
    return np.full(len(close), close[-1] if len(close) > 0 else 0)


def _sma(close, period):
    """Simple Moving Average."""
    result = ta.sma(pd.Series(close), length=period)
    if result is None:
        return np.full(len(close), close[-1] if len(close) > 0 else 0)
    return result.bfill().values


def _volume_ratio(volume, lookback=20):
    """Volume relative to average."""
    vol_series = pd.Series(volume)
    avg = vol_series.rolling(lookback).mean()
    ratio = vol_series / avg
    return ratio.fillna(1.0).values


class VCPBreakoutStrategy(StrategyBase):
    """VCP Breakout (Minervini Method) — volatility squeeze then explosive breakout.

    The concept: Stocks consolidate in tighter and tighter ranges (VCP)
    before breaking out explosively. Bollinger Band width contraction
    detects this squeeze. Volume spike on breakout confirms institutional buying.

    Minervini's Trend Template ensures we only trade stocks in confirmed uptrends:
    - Price > 150-day SMA
    - Price > 200-day SMA (strong structure)
    """

    # ── Metadata ──
    name = "VCP Breakout (Minervini)"
    description = (
        "Volatility Contraction Pattern: Buy on BB squeeze breakout with "
        "volume spike. Minervini Trend Template filters. 3:1 R:R."
    )
    strategy_type = "SWING"
    expected_win_rate = "55-65%"
    source = "Mark Minervini (US Investing Champion), TraderLion analysis"

    # ── Tunable Parameters ──
    bb_period = 20
    bb_std = 2.0
    contraction_periods = 3
    volume_spike = 1.5
    sl_pct = 6.0
    rr_target = 3.0  # Risk:Reward ratio

    default_params = {
        "bb_period": 20,
        "bb_std": 2.0,
        "contraction_periods": 3,
        "volume_spike": 1.5,
        "sl_pct": 6.0,
        "rr_target": 3.0,
    }

    def init(self):
        """Precompute Bollinger Bands, SMAs, and volume ratio."""
        self.bb_width = self.I(
            _bbands_width, self.data.Close, self.bb_period, self.bb_std,
            name="BB Width",
        )
        self.bb_upper = self.I(
            _bb_upper, self.data.Close, self.bb_period, self.bb_std,
            name="BB Upper",
        )
        self.sma_150 = self.I(_sma, self.data.Close, 150, name="SMA(150)")
        self.sma_200 = self.I(_sma, self.data.Close, 200, name="SMA(200)")
        self.vol_ratio = self.I(
            _volume_ratio, self.data.Volume, self.bb_period, name="Vol Ratio",
        )

    def next(self):
        """Execute trading logic."""
        if len(self.data) < 210:  # Need 200 SMA + buffer
            return

        price = self.data.Close[-1]

        if not self.position:
            # Check Minervini Trend Template
            trend_ok = (
                price > self.sma_150[-1]
                and price > self.sma_200[-1]
                and self.sma_150[-1] > self.sma_200[-1]
            )

            if not trend_ok:
                return

            # Check VCP: BB width contracting over N periods
            width_contracting = True
            for i in range(1, min(self.contraction_periods + 1, len(self.data) - 1)):
                if self.bb_width[-i] >= self.bb_width[-i - 1]:
                    width_contracting = False
                    break

            # Breakout: Price above upper BB with volume spike
            breakout = (
                price > self.bb_upper[-1]
                and self.data.Close[-2] <= self.bb_upper[-2]  # Just broke out
                and self.vol_ratio[-1] > self.volume_spike      # Volume confirms
            )

            if width_contracting and breakout:
                sl_price = price * (1 - self.sl_pct / 100)
                risk = price - sl_price
                tp_price = price + risk * self.rr_target  # 3:1 R:R
                self.buy(sl=sl_price, tp=tp_price)

        elif self.position.is_long:
            # Trail stop: close if price drops below 150 SMA
            if price < self.sma_150[-1]:
                self.position.close()

    @classmethod
    def get_optimization_ranges(cls) -> dict:
        """Parameter ranges for optimizer."""
        return {
            "bb_period": range(15, 26, 5),
            "contraction_periods": range(2, 6),
            "volume_spike": [1.3, 1.5, 1.8, 2.0],
            "sl_pct": [5.0, 6.0, 7.0, 8.0],
            "rr_target": [2.5, 3.0, 3.5, 4.0],
        }
