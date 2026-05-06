"""
Module: app/services/analysis_engine.py
Purpose: Orchestrator — runs the full analysis pipeline and returns a
         single structured result that the frontend renders directly.

This is the SINGLE SOURCE OF TRUTH for all trading logic.
Frontend makes ONE API call and gets everything pre-computed.

Pipeline:
    fetch data → indicators → S/R → entry → targets → classify → volume
    → evaluate strategies → build response
"""

import logging
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import pandas as pd

from app.services.entry_engine import EntryEngine, EntryResult
from app.services.sr_engine import SREngine, SRLevels
from app.services.target_engine import SingleTarget, TargetEngine, TargetResult
from app.services.technical import TechnicalAnalysisResult, TechnicalAnalyzer
from app.services.trade_classifier import TradeClassification, TradeClassifier
from app.services.volume_engine import VolumeAnalysis, VolumeEngine

logger = logging.getLogger(__name__)

MIN_CANDLES = 20


# ━━━━━━━━━━━━━━━ Result Data Classes ━━━━━━━━━━━━━━━


@dataclass
class CandleData:
    """Single candle for chart rendering."""

    date: str
    open: float
    high: float
    low: float
    close: float
    volume: int


@dataclass
class StrategyEvaluation:
    """Result of evaluating a single trading strategy."""

    strategy_name: str
    is_valid: bool
    signal: str  # BUY | SELL | NO-TRADE
    confidence: float
    risk_reward: float
    notes: str
    entry_range: list[float] = field(default_factory=list)
    stop_loss: float = 0.0
    target_prices: list[float] = field(default_factory=list)
    trade_type: str = "SWING"


@dataclass
class FullAnalysisResult:
    """Complete analysis result — everything the frontend needs."""

    # Identity
    symbol: str = ""
    current_price: float = 0.0
    previous_close: float = 0.0
    market_condition: str = "RANGE-BOUND"
    data_timestamp: str = ""
    timeframe: str = "Daily"

    # Trade Classification
    trade_type: str = "SWING"
    trade_type_reason: str = ""
    expected_holding: str = "3-7 days"

    # Smart Entry
    exact_entry: float = 0.0
    entry_range: list[float] = field(default_factory=list)
    entry_logic: str = ""
    stop_loss: float = 0.0
    stop_loss_reason: str = ""
    risk_percent: float = 0.0

    # Targets
    targets: list[SingleTarget] = field(default_factory=list)
    risk_reward_ratio: float = 0.0

    # Volume
    volume: Optional[VolumeAnalysis] = None

    # S/R Levels
    sr_levels: Optional[SRLevels] = None

    # Technicals (raw indicators for panels)
    technicals: Optional[dict] = None

    # Strategy Matrix
    strategies: list[StrategyEvaluation] = field(default_factory=list)
    primary_strategy: str = "No Trade Setup"
    confidence: float = 0.0
    signal: str = "NO-TRADE"
    reason: str = ""

    # Chart candles
    candles: list[CandleData] = field(default_factory=list)

    disclaimer: str = "Algorithmic analysis. Not financial advice. Verify before trading."


# ━━━━━━━━━━━━━━━ Analysis Engine ━━━━━━━━━━━━━━━


class AnalysisEngine:
    """Central orchestrator — runs the full analysis pipeline.

    All sub-engines are stateless and safe for concurrent use.

    Methods:
        analyze(symbol, df) -> FullAnalysisResult
    """

    def __init__(self):
        self.technical = TechnicalAnalyzer()
        self.sr = SREngine()
        self.entry = EntryEngine()
        self.target = TargetEngine()
        self.volume = VolumeEngine()
        self.classifier = TradeClassifier()

    def analyze(self, symbol: str, df: pd.DataFrame) -> FullAnalysisResult:
        """Run the complete analysis pipeline.

        Args:
            symbol: Stock symbol (e.g., "RELIANCE").
            df: OHLCV DataFrame with columns: open, high, low, close, volume.

        Returns:
            FullAnalysisResult with everything the frontend needs.
        """
        if df is None or len(df) < MIN_CANDLES:
            logger.warning(
                "Insufficient data for %s (%d candles)",
                symbol,
                len(df) if df is not None else 0,
            )
            return FullAnalysisResult(
                symbol=symbol,
                reason=f"Insufficient data ({len(df) if df is not None else 0} candles, need {MIN_CANDLES}+)",
            )

        try:
            # Step 1: Calculate technical indicators
            ta_result = self.technical.analyze(df)
            iv = ta_result.indicators

            # Step 2: Support / Resistance
            sr_levels = self.sr.calculate(df)

            # Step 3: Smart entry + stop loss
            entry_result = self.entry.calculate(df, ta_result, sr_levels)

            # Step 4: S/R-based targets
            target_result = self.target.calculate(
                df=df,
                sr_levels=sr_levels,
                entry_price=entry_result.exact_entry or iv.current_price,
                stop_loss=entry_result.stop_loss,
                atr=iv.atr,
            )

            # Step 5: Trade type classification
            classification = self.classifier.classify(ta_result)

            # Step 6: Volume analysis (needs signal to check confirmation)
            preliminary_signal = ta_result.overall_signal.value
            vol_analysis = self.volume.analyze(df, signal=preliminary_signal)

            # Step 7: Evaluate strategies
            strategies = self._evaluate_strategies(
                df, ta_result, sr_levels, entry_result, target_result, vol_analysis
            )

            # Step 8: Pick best strategy and build final signal
            active = [s for s in strategies if s.signal in ("BUY", "SELL")]
            if active:
                best = max(active, key=lambda s: s.confidence)
                signal = best.signal
                primary_name = best.strategy_name
                confidence = best.confidence
                reason = f"{signal} Signal: {best.strategy_name}. {best.notes}"
            else:
                signal = "NO-TRADE"
                primary_name = "No Trade Setup"
                confidence = 0.0
                reason = "No high-probability setup detected."

            # Step 9: Extract candles for chart
            candles = self._extract_candles(df, last_n=60)

            # Step 10: Build technicals dict for panel rendering
            technicals = self._build_technicals_dict(ta_result, sr_levels, vol_analysis)

            return FullAnalysisResult(
                symbol=symbol,
                current_price=_s(iv.current_price),
                previous_close=_s(iv.prev_close),
                market_condition=ta_result.market_condition.value,
                data_timestamp=self._get_timestamp(df),
                timeframe="Daily",
                # Trade classification
                trade_type=classification.trade_type,
                trade_type_reason=classification.reason,
                expected_holding=classification.expected_holding,
                # Entry
                exact_entry=_s(entry_result.exact_entry),
                entry_range=[_s(entry_result.entry_range_low), _s(entry_result.entry_range_high)],
                entry_logic=entry_result.entry_logic,
                stop_loss=_s(entry_result.stop_loss),
                stop_loss_reason=entry_result.stop_loss_reason,
                risk_percent=_s(entry_result.risk_percent),
                # Targets
                targets=target_result.targets,
                risk_reward_ratio=_s(target_result.risk_reward_ratio),
                # Volume
                volume=vol_analysis,
                # S/R
                sr_levels=sr_levels,
                # Technicals
                technicals=technicals,
                # Strategies
                strategies=strategies,
                primary_strategy=primary_name,
                confidence=_s(confidence),
                signal=signal,
                reason=reason,
                # Chart
                candles=candles,
            )

        except Exception as e:
            logger.error("Analysis pipeline failed for %s: %s", symbol, e, exc_info=True)
            return FullAnalysisResult(
                symbol=symbol,
                reason=f"Analysis error: {str(e)[:100]}",
            )

    # ━━━━━━━━━━━━━━━ Strategy Evaluation ━━━━━━━━━━━━━━━

    def _evaluate_strategies(
        self,
        df: pd.DataFrame,
        ta: TechnicalAnalysisResult,
        sr: SRLevels,
        entry: EntryResult,
        targets: TargetResult,
        volume: VolumeAnalysis,
    ) -> list[StrategyEvaluation]:
        """Evaluate all trading strategies.

        Moved from frontend technicalAnalysis.ts / gemini.ts into backend.
        """
        iv = ta.indicators
        sig = ta.signals
        price = iv.current_price
        atr = iv.atr if iv.atr > 0 else price * 0.02
        condition = ta.market_condition.value

        # Common target/sl for all strategies
        t_prices = [t.price for t in targets.targets] if targets.targets else [price * 1.05]
        sl = entry.stop_loss if entry.stop_loss > 0 else price * 0.97
        e_range = [entry.entry_range_low or price, entry.entry_range_high or price * 1.01]

        strategies: list[StrategyEvaluation] = []

        def add(name, valid, conf, rr, notes, sig_type="BUY"):
            if not valid:
                sig_type = "NO-TRADE"
                conf = 0.0
            strategies.append(StrategyEvaluation(
                strategy_name=name,
                is_valid=valid,
                signal=sig_type,
                confidence=round(conf, 2),
                risk_reward=round(rr, 1),
                notes=notes,
                entry_range=e_range,
                stop_loss=_s(sl),
                target_prices=[_s(t) for t in t_prices],
            ))

        # ── 1. VWAP Reversion ──
        vwap = self._calc_vwap(df)
        is_vwap = (
            vwap > 0
            and abs(price - vwap) / price < 0.015
            and condition in ("UPTREND", "RANGE-BOUND")
        )
        add("VWAP Reversion", is_vwap, 0.88, 2.5,
            f"Near VWAP ₹{vwap:.2f}" if is_vwap else "No VWAP interaction")

        # ── 2. Trend Following (ADX) ──
        is_trend = price > iv.ema_50 and iv.adx > 20 and iv.ema_21 > iv.ema_50
        add("Trend Following (ADX)", is_trend, 0.85, 2.5,
            f"Strong trend ADX {iv.adx:.0f}" if is_trend else f"Weak trend ADX {iv.adx:.0f}")

        # ── 3. Golden Cross ──
        is_golden = iv.ema_50 > iv.ema_200 > 0 and price > iv.ema_21
        add("Golden Cross", is_golden, 0.80, 3.0,
            "Golden Cross Zone" if is_golden else "No Golden Cross")

        # ── 4. RSI Divergence ──
        is_div = 25 <= iv.rsi < 45 and sig.macd_signal == "BULLISH"
        add("RSI Divergence", is_div, 0.85, 3.0,
            "Bullish RSI + MACD alignment" if is_div else "No divergence")

        # ── 5. 50 EMA Pullback ──
        dist_50 = abs(price - iv.ema_50) / price if iv.ema_50 > 0 else 1
        is_pullback = condition == "UPTREND" and dist_50 < 0.03 and price >= iv.ema_50
        add("50 EMA Pullback", is_pullback, 0.90, 3.0,
            f"Pullback to EMA50 ₹{iv.ema_50:.2f}" if is_pullback else "Not near EMA50")

        # ── 6. Bollinger Squeeze ──
        bb_width = iv.bb_width if hasattr(iv, "bb_width") else 0
        is_squeeze = bb_width < 15 and price > iv.bb_upper
        add("Bollinger Squeeze", is_squeeze, 0.95, 2.5,
            "Breakout from squeeze!" if is_squeeze else "No squeeze" if bb_width >= 15 else "Squeezing")

        # ── 7. MACD Histogram Reversal ──
        is_macd = sig.macd_signal == "BULLISH" and iv.rsi > 40
        add("MACD Histogram Reversal", is_macd, 0.84, 2.8,
            "MACD bullish crossover" if is_macd else "MACD bearish")

        # ── 8. RSI Oversold Bounce ──
        is_rsi_os = iv.rsi < 35
        rsi_conf = 0.90 if iv.rsi < 25 else 0.82 if iv.rsi < 30 else 0.75
        add("RSI Oversold Bounce", is_rsi_os, rsi_conf, 2.5,
            f"RSI {iv.rsi:.1f} oversold" if is_rsi_os else f"RSI {iv.rsi:.1f} not oversold")

        # ── 9. Stochastic Oversold ──
        stoch_k = getattr(iv, "stoch_k", 50)
        is_stoch = stoch_k < 25 and sig.macd_signal == "BULLISH"
        add("Stochastic Oversold Bounce", is_stoch, 0.80, 2.5,
            f"Stoch K {stoch_k:.0f} oversold" if is_stoch else "Not oversold")

        # ── 10. EMA Stack Alignment ──
        ema_stack = (
            iv.ema_9 > iv.ema_21 > iv.ema_50
            and (iv.ema_200 <= 0 or iv.ema_50 > iv.ema_200)
        )
        add("EMA Stack Alignment", ema_stack, 0.90, 3.0,
            "Perfect EMA stack — institutional trend" if ema_stack
            else "EMAs not aligned")

        # ── 11. Supertrend Signal ──
        is_st = sig.supertrend_signal == "BULLISH" and iv.adx > 20
        add("Supertrend Signal", is_st, 0.82, 2.5,
            "Supertrend bullish" if is_st else "Supertrend bearish")

        # ── 12. Volume Accumulation ──
        is_accum = volume.volume_ratio > 1.3 and price > iv.ema_21 and sig.macd_signal == "BULLISH"
        add("Volume Accumulation", is_accum, 0.85, 2.0,
            f"Volume {volume.volume_ratio:.1f}x — institutional buying" if is_accum
            else "Normal volume")

        # ── 13. BB Lower Band Bounce ──
        near_bb_lower = iv.bb_lower > 0 and price <= iv.bb_lower * 1.02
        add("BB Lower Band Bounce", near_bb_lower, 0.85 if near_bb_lower and price > iv.bb_lower else 0.72, 2.8,
            f"Near BB lower ₹{iv.bb_lower:.2f}" if near_bb_lower else "Within bands")

        # ── 14. MFI Oversold ──
        is_mfi = iv.mfi < 30
        add("MFI Oversold Signal", is_mfi, 0.82, 2.5,
            f"MFI {iv.mfi:.0f} — money flow reversal" if is_mfi else f"MFI {iv.mfi:.0f} normal")

        # ── 15. RSI Swing Re-entry ──
        is_rsi_swing = 40 < iv.rsi < 60 and condition == "UPTREND" and iv.ema_21 > iv.ema_50
        add("RSI Swing Re-entry", is_rsi_swing, 0.80, 2.4,
            "RSI mid-zone pullback" if is_rsi_swing else "RSI out of zone")

        # ── 16. Double Bottom ──
        is_double = self._check_double_bottom(df, price, iv.ema_21)
        add("Double Bottom", is_double, 0.88, 3.5,
            "W-pattern near support — reversal forming" if is_double else "No double bottom")

        # ── 17. Bearish Breakdown (SELL) ──
        is_bear = condition == "DOWNTREND" and price < iv.ema_21 and iv.adx > 25 and iv.rsi > 35
        add("Bearish Breakdown", is_bear, 0.85 if is_bear else 0.75, 2.5,
            f"Downtrend ADX {iv.adx:.0f}" if is_bear else "No bearish breakdown",
            sig_type="SELL" if is_bear else "NO-TRADE")

        return strategies

    # ━━━━━━━━━━━━━━━ Helpers ━━━━━━━━━━━━━━━

    def _calc_vwap(self, df: pd.DataFrame, period: int = 20) -> float:
        try:
            recent = df.iloc[-period:]
            tp = (recent["high"] + recent["low"] + recent["close"]) / 3
            pv = (tp * recent["volume"]).sum()
            v = recent["volume"].sum()
            return float(pv / v) if v > 0 else 0
        except Exception:
            return 0

    def _check_double_bottom(self, df: pd.DataFrame, price: float, ema20: float) -> bool:
        if len(df) < 30:
            return False
        try:
            lows = df["low"]
            recent_low = float(lows.iloc[-10:].min())
            older_low = float(lows.iloc[-30:-10].min())
            pct_diff = abs(recent_low - older_low) / older_low if older_low > 0 else 1
            return pct_diff < 0.02 and price > ema20 and price > recent_low * 1.02
        except Exception:
            return False

    def _extract_candles(self, df: pd.DataFrame, last_n: int = 60) -> list[CandleData]:
        """Extract last N candles for frontend chart rendering."""
        recent = df.iloc[-last_n:] if len(df) >= last_n else df
        candles = []
        for idx, row in recent.iterrows():
            # Convert index to ISO-8601 string
            if hasattr(idx, "isoformat"):
                date_str = idx.isoformat()
            else:
                date_str = str(idx)

            candles.append(CandleData(
                date=date_str,
                open=_s(row["open"]),
                high=_s(row["high"]),
                low=_s(row["low"]),
                close=_s(row["close"]),
                volume=int(row.get("volume", 0)),
            ))
        return candles

    def _build_technicals_dict(
        self,
        ta: TechnicalAnalysisResult,
        sr: SRLevels,
        vol: VolumeAnalysis,
    ) -> dict:
        """Build technicals dict for the frontend TechnicalPanel."""
        iv = ta.indicators
        return {
            "rsi": _s(iv.rsi),
            "adx": _s(iv.adx),
            "macd": ta.signals.macd_signal,
            "ema_20": _s(iv.ema_21),
            "ema_50": _s(iv.ema_50),
            "ema_200": _s(iv.ema_200),
            "support": _s(sr.support),
            "resistance": _s(sr.resistance),
            "volume_status": "HIGH" if vol.volume_ratio > 1.5 else "AVERAGE",
            "atr14": _s(iv.atr),
            "vwap": 0,  # VWAP is session-specific; computed by entry_engine
            "volume_ratio": _s(vol.volume_ratio),
            "bb_upper": _s(iv.bb_upper),
            "bb_middle": _s(iv.bb_middle),
            "bb_lower": _s(iv.bb_lower),
            "mfi": _s(iv.mfi),
        }

    def _get_timestamp(self, df: pd.DataFrame) -> str:
        """Get the latest timestamp from the DataFrame."""
        try:
            last_idx = df.index[-1]
            if hasattr(last_idx, "isoformat"):
                return last_idx.isoformat()
            return str(last_idx)
        except Exception:
            return ""


# ── Module-level safe float ──

def _s(val) -> float:
    """Safe float: NaN/Inf → 0, rounded to 2 decimal places."""
    if val is None:
        return 0.0
    try:
        f = float(val)
        if np.isnan(f) or np.isinf(f):
            return 0.0
        return round(f, 2)
    except (TypeError, ValueError):
        return 0.0
