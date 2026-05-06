"""
Module: app/services/trade_classifier.py
Purpose: Classify trade setups as INTRADAY, BTST, SWING, or POSITIONAL.

Answers the trader's question: "Is this a day trade or should I hold?"
"""

import logging
from dataclasses import dataclass

import numpy as np

from app.services.technical import TechnicalAnalysisResult

logger = logging.getLogger(__name__)


@dataclass
class TradeClassification:
    """Trade type classification result."""

    trade_type: str = "SWING"                   # INTRADAY | BTST | SWING | POSITIONAL
    expected_holding: str = "3-7 days"          # Human-readable hold period
    reason: str = "Default classification"      # Why this type was chosen
    confidence: float = 0.5                     # 0-1 confidence in classification


class TradeClassifier:
    """Classifies trade setups based on indicator profile.

    Methods:
        classify(indicators, ema_200) -> TradeClassification
    """

    def classify(
        self,
        indicators: TechnicalAnalysisResult,
    ) -> TradeClassification:
        """Determine trade type from indicator values.

        Args:
            indicators: Full technical analysis result from TechnicalAnalyzer.

        Returns:
            TradeClassification with type, holding period, and reason.
        """
        try:
            iv = indicators.indicators
            price = iv.current_price
            atr = iv.atr
            adx = iv.adx
            rsi = iv.rsi
            volume_ratio = iv.volume_ratio
            ema_50 = iv.ema_50
            ema_200 = iv.ema_200

            # Avoid division by zero
            if price <= 0:
                return TradeClassification()

            atr_pct = (atr / price) * 100 if atr > 0 else 0
            ema_stack = iv.ema_9 > iv.ema_21 > ema_50 > ema_200 if ema_200 > 0 else False

            # ── Classification Rules (priority order) ──

            # 1. INTRADAY: Tight range, high volume, strong trend
            if atr_pct < 2.0 and volume_ratio > 1.5 and adx > 25:
                return TradeClassification(
                    trade_type="INTRADAY",
                    expected_holding="Same day",
                    reason=f"ATR {atr_pct:.1f}% (tight), volume {volume_ratio:.1f}x spike, ADX {adx:.0f} (strong trend)",
                    confidence=0.75,
                )

            # 2. BTST: Strong momentum, gap potential
            if (
                rsi > 55
                and rsi < 72
                and volume_ratio > 1.3
                and (iv.current_price > iv.prev_close * 1.01)
            ):
                return TradeClassification(
                    trade_type="BTST",
                    expected_holding="1-2 days",
                    reason=f"RSI {rsi:.0f} momentum, {volume_ratio:.1f}x volume, +{iv.day_change_pct:.1f}% today",
                    confidence=0.70,
                )

            # 3. POSITIONAL: Long-term trend, EMA stack, institutional setup
            if ema_200 > 0 and price > ema_200 and ema_stack and adx > 20:
                return TradeClassification(
                    trade_type="POSITIONAL",
                    expected_holding="10-30 days",
                    reason=f"EMA stack aligned, above 200 EMA, ADX {adx:.0f} (established trend)",
                    confidence=0.80,
                )

            # 4. SWING (default): Clear S/R levels, moderate ATR
            if atr_pct >= 2.0 or adx > 18:
                return TradeClassification(
                    trade_type="SWING",
                    expected_holding="3-10 days",
                    reason=f"ATR {atr_pct:.1f}%, ADX {adx:.0f}, suitable swing range",
                    confidence=0.70,
                )

            # 5. Fallback: SWING with low confidence
            return TradeClassification(
                trade_type="SWING",
                expected_holding="3-7 days",
                reason=f"Default — ATR {atr_pct:.1f}%, ADX {adx:.0f}",
                confidence=0.50,
            )

        except Exception as e:
            logger.error("Trade classification failed: %s", e, exc_info=True)
            return TradeClassification()
