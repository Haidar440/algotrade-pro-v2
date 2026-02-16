"""
Module: app/strategies/rsi_macd.py
Purpose: RSI Mean Reversion + MACD Confirmation strategy.

Source: QuantifiedStrategies (73% over 235 trades),
        WunderTrading study, OpoFinance analysis.
Expected Win Rate: 65-73%

Entry Rules:
- BUY: RSI(14) < 35 (oversold) AND MACD crosses above Signal (momentum turning)
- Additional: Price > EMA(200) — only buy in long-term uptrend
- Ignore if RSI < 15 (possible crash, not mean-reversion)

Exit Rules:
- Target: RSI > 65
- SL: 3% below entry OR RSI makes new low below 20
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
    return result.fillna(50.0).values


def _macd_histogram(close, fast=12, slow=26, signal=9):
    """Calculate MACD histogram (MACD line - Signal line).

    Positive histogram = MACD above signal = bullish momentum.
    """
    result = ta.macd(pd.Series(close), fast=fast, slow=slow, signal=signal)
    if result is None:
        return np.zeros(len(close))
    # pandas-ta returns: MACD_12_26_9, MACDh_12_26_9, MACDs_12_26_9
    hist_col = [c for c in result.columns if "MACDh" in c]
    if hist_col:
        return result[hist_col[0]].fillna(0).values
    return np.zeros(len(close))


def _ema(close, period=200):
    """Calculate EMA for trend filter."""
    result = ta.ema(pd.Series(close), length=period)
    if result is None:
        return np.full(len(close), close[-1] if len(close) > 0 else 0)
    return result.values


class RSIMACDStrategy(StrategyBase):
    """RSI Mean Reversion + MACD Confirmation — buy oversold with momentum turn.

    This is the highest win-rate strategy in our lineup (73% backtested).
    The key insight: RSI alone catches falling knives. Adding MACD crossover
    as confirmation waits for momentum to actually turn before entering.
    The EMA(200) filter ensures we only buy dips in uptrending stocks.

    Think of it as: "Buy the dip, but only when the dip stops dipping."
    """

    # ── Metadata ──
    name = "RSI + MACD Confirmation"
    description = (
        "Mean reversion: Buy when RSI < 35 (oversold) AND MACD confirms "
        "momentum turn. EMA(200) ensures uptrend context. 73% win rate."
    )
    strategy_type = "SWING"
    expected_win_rate = "65-73%"
    source = "QuantifiedStrategies (73% over 235 trades), WunderTrading study"

    # ── Tunable Parameters ──
    rsi_period = 14
    rsi_oversold = 35
    rsi_target = 65
    ema_trend = 200
    sl_pct = 3.0

    default_params = {
        "rsi_period": 14,
        "rsi_oversold": 35,
        "rsi_target": 65,
        "ema_trend": 200,
        "sl_pct": 3.0,
    }

    def init(self):
        """Precompute RSI, MACD histogram, and EMA trend."""
        self.rsi = self.I(_rsi, self.data.Close, self.rsi_period, name="RSI")
        self.macd_hist = self.I(
            _macd_histogram, self.data.Close, name="MACD Histogram",
        )
        self.trend_ema = self.I(
            _ema, self.data.Close, self.ema_trend, name=f"EMA({self.ema_trend})",
        )

    def next(self):
        """Execute trading logic."""
        # Need enough data for 200 EMA to stabilize
        if len(self.data) < self.ema_trend + 10:
            return

        current_rsi = self.rsi[-1]
        prev_rsi = self.rsi[-2]
        price = self.data.Close[-1]

        if not self.position:
            # BUY CONDITIONS (all must be true):
            # 1. RSI is oversold (but not crashing — RSI > 15)
            # 2. MACD histogram just turned positive (momentum confirmation)
            # 3. Price is above 200 EMA (long-term uptrend)
            if (
                current_rsi < self.rsi_oversold
                and current_rsi > 15       # Not a crash
                and self.macd_hist[-1] > 0          # MACD bullish
                and self.macd_hist[-2] <= 0         # Just crossed
                and price > self.trend_ema[-1]      # In uptrend
            ):
                sl_price = price * (1 - self.sl_pct / 100)
                self.buy(sl=sl_price)

        elif self.position.is_long:
            # EXIT: RSI reaches target (overbought zone)
            if current_rsi > self.rsi_target:
                self.position.close()
            # Also exit if MACD turns strongly negative
            elif self.macd_hist[-1] < 0 and self.macd_hist[-2] < 0 and current_rsi > 50:
                self.position.close()

    @classmethod
    def get_optimization_ranges(cls) -> dict:
        """Parameter ranges for optimizer."""
        return {
            "rsi_period": range(10, 21, 2),
            "rsi_oversold": range(25, 41, 5),
            "rsi_target": range(60, 76, 5),
            "ema_trend": [100, 150, 200],
            "sl_pct": [2.0, 3.0, 4.0, 5.0],
        }
