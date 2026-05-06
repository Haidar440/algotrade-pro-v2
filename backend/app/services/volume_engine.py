"""
Module: app/services/volume_engine.py
Purpose: Volume profile analysis — ratio, trend, breakout confirmation.

Answers the trader's question: "Is volume confirming the move?"
"""

import logging
from dataclasses import dataclass

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

MIN_CANDLES = 10


@dataclass
class VolumeAnalysis:
    """Volume profile for a stock."""

    current_volume: int = 0
    avg_volume_20d: int = 0
    volume_ratio: float = 1.0           # current / avg
    volume_trend: str = "NEUTRAL"       # ACCUMULATION | DISTRIBUTION | NEUTRAL
    breakout_volume_required: int = 0   # estimated min volume for valid breakout
    is_volume_confirming: bool = False  # does volume support the signal?
    up_day_avg_volume: int = 0          # avg volume on green candles
    down_day_avg_volume: int = 0        # avg volume on red candles


class VolumeEngine:
    """Analyzes volume patterns from OHLCV data.

    Methods:
        analyze(df, signal) -> VolumeAnalysis
    """

    def analyze(
        self, df: pd.DataFrame, signal: str = "BUY"
    ) -> VolumeAnalysis:
        """Run volume analysis.

        Args:
            df: OHLCV DataFrame (open, high, low, close, volume).
            signal: Current trading signal ("BUY", "SELL", "NO-TRADE").

        Returns:
            VolumeAnalysis with ratio, trend, and confirmation.
        """
        if df is None or len(df) < MIN_CANDLES:
            return VolumeAnalysis()

        try:
            volume = df["volume"]
            close = df["close"]
            open_ = df["open"]

            current_vol = int(volume.iloc[-1])

            # 20-day average volume (or available length)
            lookback = min(20, len(volume))
            avg_vol = float(volume.iloc[-lookback:].mean())
            avg_vol = max(avg_vol, 1)  # Avoid division by zero

            ratio = current_vol / avg_vol

            # Volume trend: compare avg volume on up-days vs down-days
            up_days = close > open_
            down_days = close <= open_

            recent = df.iloc[-lookback:]
            up_mask = recent["close"] > recent["open"]
            down_mask = ~up_mask

            up_vol = float(recent.loc[up_mask, "volume"].mean()) if up_mask.any() else 0
            down_vol = float(recent.loc[down_mask, "volume"].mean()) if down_mask.any() else 0

            # Determine trend
            if up_vol > 0 and down_vol > 0:
                if up_vol > down_vol * 1.3:
                    trend = "ACCUMULATION"
                elif down_vol > up_vol * 1.3:
                    trend = "DISTRIBUTION"
                else:
                    trend = "NEUTRAL"
            else:
                trend = "NEUTRAL"

            # Breakout volume = 1.5x average (industry standard)
            breakout_vol = int(avg_vol * 1.5)

            # Volume confirmation
            is_confirming = False
            if signal == "BUY" and ratio > 1.0:
                is_confirming = True
            elif signal == "SELL" and ratio > 1.0:
                is_confirming = True
            elif signal == "BUY" and trend == "ACCUMULATION":
                is_confirming = True

            return VolumeAnalysis(
                current_volume=current_vol,
                avg_volume_20d=int(avg_vol),
                volume_ratio=round(self._safe(ratio), 2),
                volume_trend=trend,
                breakout_volume_required=breakout_vol,
                is_volume_confirming=is_confirming,
                up_day_avg_volume=int(self._safe(up_vol)),
                down_day_avg_volume=int(self._safe(down_vol)),
            )

        except Exception as e:
            logger.error("Volume analysis failed: %s", e, exc_info=True)
            return VolumeAnalysis()

    @staticmethod
    def _safe(val: float) -> float:
        """Replace NaN/Inf with 0."""
        if np.isnan(val) or np.isinf(val):
            return 0.0
        return val
