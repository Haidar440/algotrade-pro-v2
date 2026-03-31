"""
Module: app/services/intelligence_pipeline.py
Purpose: Orchestrates all 4 intelligence agents into one pipeline.

CONSTRAINT #1: Designed to run in background worker (TaskManager).
CONSTRAINT #3: Rule-based filter FIRST (300→20), then LLM.
CONSTRAINT #7: Fault-tolerant — each agent can fail independently.
CONSTRAINT #8: Results cached with TTL.

System Flow:
  1. Rule-based filter (stock_picker → top 20 candidates)
  2. Parallel: News Intelligence + Market Intelligence
  3. Reasoning Engine (builds impact chains from news + market)
  4. Smart Selector (scores candidates using all data)
  5. Cache result + broadcast via WebSocket
"""

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Optional

from app.config import settings
from app.services.cache import TTLCache
from app.services.news_intelligence import NewsIntelligence
from app.services.market_intelligence import MarketIntelligence
from app.services.reasoning_engine import ReasoningEngine
from app.services.smart_selector import SmartSelector

logger = logging.getLogger(__name__)

_pipeline_cache = TTLCache(default_ttl=settings.INTELLIGENCE_CACHE_TTL)


# ━━━━━━━━━━━━━━━ Data Classes ━━━━━━━━━━━━━━━


@dataclass
class IntelligenceReport:
    """Full output from the intelligence pipeline."""
    news: dict = field(default_factory=dict)
    market: dict = field(default_factory=dict)
    reasoning: dict = field(default_factory=dict)
    selections: dict = field(default_factory=dict)
    summary: str = ""
    generated_at: float = field(default_factory=time.time)
    total_latency_ms: int = 0
    providers_used: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "news": self.news,
            "market": self.market,
            "reasoning": self.reasoning,
            "selections": self.selections,
            "summary": self.summary,
            "generated_at": self.generated_at,
            "total_latency_ms": self.total_latency_ms,
            "providers_used": self.providers_used,
        }


# ━━━━━━━━━━━━━━━ Pipeline ━━━━━━━━━━━━━━━


class IntelligencePipeline:
    """Orchestrates all 4 agents into a single pipeline.

    Designed to be called ONLY from the background TaskManager.
    Never blocks the FastAPI event loop.
    """

    def __init__(self) -> None:
        self._news = NewsIntelligence()
        self._market = MarketIntelligence()
        self._reasoning = ReasoningEngine()
        self._selector = SmartSelector()

    async def run_full_scan(self, task_info=None, progress_callback=None) -> dict:
        """Run the complete 4-agent intelligence pipeline.

        This is the main handler registered with TaskManager.

        Args:
            task_info: TaskInfo object from worker.
            progress_callback: async callback(progress, stage).

        Returns:
            IntelligenceReport.to_dict() — full scan result.
        """
        cached = _pipeline_cache.get("full_report")
        if cached is not None:
            logger.info("[pipeline] Returning cached report")
            return cached

        start = time.time()
        providers_used = set()

        logger.info("[pipeline] Starting full intelligence scan")

        # ── Step 1: Rule-based filter (300→20 candidates) ──
        if progress_callback:
            await progress_callback(5, "filtering_stocks")

        candidates = await self._get_filtered_candidates()
        logger.info("[pipeline] Rule-based filter: %d candidates", len(candidates))

        # ── Step 2: Parallel — News + Market analysis ──
        if progress_callback:
            await progress_callback(10, "parallel_analysis")

        news_result, market_result = await asyncio.gather(
            self._safe_run(self._news.analyze, progress_callback),
            self._safe_run(self._market.get_summary, progress_callback),
        )

        news_data = news_result.to_dict() if news_result else {}
        market_data = market_result.to_dict() if market_result else {}

        if news_result and news_result.llm_provider:
            providers_used.add(news_result.llm_provider)
        if market_result and market_result.llm_provider:
            providers_used.add(market_result.llm_provider)

        # ── Step 3: Reasoning Engine (cause-effect chains) ──
        reasoning_result = await self._safe_run(
            self._reasoning.build_chains,
            news_data, market_data, progress_callback,
        )
        reasoning_data = reasoning_result.to_dict() if reasoning_result else {}

        if reasoning_result and reasoning_result.llm_provider:
            providers_used.add(reasoning_result.llm_provider)

        # ── Step 4: Smart Selector (score candidates) ──
        selection_result = await self._safe_run(
            self._selector.score_stocks,
            candidates, reasoning_data, news_data, market_data, progress_callback,
        )
        selection_data = selection_result.to_dict() if selection_result else {}

        if selection_result and selection_result.llm_provider:
            providers_used.add(selection_result.llm_provider)

        # ── Step 5: Build final report ──
        total_latency = int((time.time() - start) * 1000)

        report = IntelligenceReport(
            news=news_data,
            market=market_data,
            reasoning=reasoning_data,
            selections=selection_data,
            summary=self._build_summary(news_data, market_data, selection_data),
            total_latency_ms=total_latency,
            providers_used=list(providers_used),
        )

        result = report.to_dict()

        # Cache the report
        _pipeline_cache.set("full_report", result)

        logger.info(
            "[pipeline] Full scan complete — %d picks, %d chains, %dms, providers: %s",
            len(selection_data.get("top_picks", [])),
            len(reasoning_data.get("impact_chains", [])),
            total_latency,
            list(providers_used),
        )

        return result

    async def _get_filtered_candidates(self) -> list[dict]:
        """Get pre-filtered stock candidates using rule-based logic.

        CONSTRAINT #3: Filter 300 stocks down to top 20 BEFORE LLM.
        Uses existing stock_picker / swing_screener if available.
        Falls back to a basic screener with yfinance.
        """
        try:
            # Try to use existing swing screener
            from app.services.swing_screener import SwingScreener
            screener = SwingScreener()
            candidates = await screener.scan()

            # Convert to simple dicts
            filtered = []
            for c in candidates[:settings.INTELLIGENCE_MAX_STOCKS]:
                filtered.append({
                    "symbol": getattr(c, "symbol", str(c)),
                    "price": getattr(c, "price", 0.0),
                    "rsi": getattr(c, "rsi", 50.0),
                    "signal": getattr(c, "signal", "NEUTRAL"),
                    "volume_ratio": getattr(c, "volume_ratio", 1.0),
                })
            return filtered

        except Exception as e:
            logger.warning("[pipeline] Swing screener unavailable: %s. Using fallback.", str(e)[:100])

        # Fallback: Use a small set of Nifty 50 stocks
        return self._fallback_candidates()

    def _fallback_candidates(self) -> list[dict]:
        """Fallback candidates — top Nifty 50 stocks with live prices from yfinance."""
        nifty_stocks = [
            "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK",
            "HINDUNILVR", "SBIN", "BHARTIARTL", "KOTAKBANK", "ITC",
            "LT", "AXISBANK", "ASIANPAINT", "MARUTI", "SUNPHARMA",
            "WIPRO", "TATAMOTORS", "ULTRACEMCO", "BAJFINANCE", "TITAN",
        ]
        candidates = []
        try:
            import yfinance as yf

            # Batch download for speed — yfinance supports multi-ticker
            nse_symbols = [f"{s}.NS" for s in nifty_stocks]
            data = yf.download(nse_symbols, period="5d", interval="1d", progress=False, threads=True)

            for i, symbol in enumerate(nifty_stocks):
                nse_sym = f"{symbol}.NS"
                try:
                    if isinstance(data.columns, __import__('pandas').MultiIndex):
                        close_col = data["Close"][nse_sym]
                    else:
                        close_col = data["Close"]
                    price = float(close_col.dropna().iloc[-1])
                    candidates.append({
                        "symbol": symbol, "price": round(price, 2),
                        "rsi": 50.0, "signal": "NEUTRAL", "volume_ratio": 1.0,
                    })
                except Exception:
                    candidates.append({
                        "symbol": symbol, "price": 0.0,
                        "rsi": 50.0, "signal": "NEUTRAL", "volume_ratio": 1.0,
                    })

        except Exception as e:
            logger.warning("[pipeline] yfinance fallback price fetch failed: %s", str(e)[:100])
            candidates = [
                {"symbol": s, "price": 0.0, "rsi": 50.0, "signal": "NEUTRAL", "volume_ratio": 1.0}
                for s in nifty_stocks
            ]

        return candidates

    async def _safe_run(self, func, *args, **kwargs):
        """Run a function with fault tolerance.

        CONSTRAINT #7: If an agent fails, log and continue.
        """
        try:
            return await func(*args, **kwargs)
        except Exception as e:
            logger.error(
                "[pipeline] Agent '%s' failed: %s",
                func.__qualname__, str(e)[:200],
            )
            return None

    def _build_summary(self, news: dict, market: dict, selections: dict) -> str:
        """Build a brief human-readable summary."""
        parts = []

        sentiment = news.get("global_sentiment", "NEUTRAL")
        parts.append(f"Market sentiment: {sentiment}")

        prediction = market.get("next_day_prediction", "sideways")
        confidence = market.get("prediction_confidence", "medium")
        parts.append(f"Next day: {prediction} (confidence: {confidence})")

        picks = selections.get("top_picks", [])
        if picks:
            top3 = ", ".join(p.get("stock", "?") for p in picks[:3])
            parts.append(f"Top picks: {top3}")

        hidden = selections.get("hidden_gems", [])
        if hidden:
            gems = ", ".join(h.get("stock", "?") for h in hidden[:2])
            parts.append(f"Hidden gems: {gems}")

        return " | ".join(parts)


# ━━━━━━━━━━━━━━━ Singleton ━━━━━━━━━━━━━━━

_pipeline_instance: Optional[IntelligencePipeline] = None


def get_pipeline() -> IntelligencePipeline:
    """Get or create the global pipeline singleton."""
    global _pipeline_instance
    if _pipeline_instance is None:
        _pipeline_instance = IntelligencePipeline()
    return _pipeline_instance
