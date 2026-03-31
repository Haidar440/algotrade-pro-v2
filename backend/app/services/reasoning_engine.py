"""
Module: app/services/reasoning_engine.py
Purpose: Agent 3 — Multi-layer cause-effect chain builder.

Takes output from News Analyzer + Market Analyzer and builds
multi-step impact chains to identify hidden stock opportunities.

Example chain:
  Event: Russia-Ukraine ceasefire talks resume
  → Impact 1: Oil prices may drop (lower geopolitical risk)
    → Impact 2: Indian oil importers benefit (BPCL, IOC, HPCL)
      → Impact 3: Lower fuel costs → Aviation sector rally (IndiGo)
        → Impact 4: Reduced input costs → FMCG margins improve (HUL, ITC)

CONSTRAINT #3: ONE LLM call with full context — not per-chain.
"""

import logging
import time
from dataclasses import dataclass, field
from typing import Optional

from app.services.cache import TTLCache
from app.services.llm_providers import LLMMessage
from app.services.llm_router import TASK_REASONING, get_llm_router

logger = logging.getLogger(__name__)

_reasoning_cache = TTLCache(default_ttl=900)


# ━━━━━━━━━━━━━━━ Data Classes ━━━━━━━━━━━━━━━


@dataclass
class ImpactChain:
    """A multi-layer cause-effect chain from an event to stock opportunity."""
    event: str = ""
    chain: list[str] = field(default_factory=list)
    affected_sectors: list[str] = field(default_factory=list)
    stock_opportunities: list[str] = field(default_factory=list)
    order: int = 1  # 1st, 2nd, or 3rd order effect
    confidence: str = "medium"


@dataclass
class ReasoningResult:
    """Output from the Reasoning Engine agent."""
    impact_chains: list[ImpactChain] = field(default_factory=list)
    hidden_opportunities: list[dict] = field(default_factory=list)
    sector_rotation: dict = field(default_factory=dict)
    llm_provider: str = ""
    latency_ms: int = 0

    def to_dict(self) -> dict:
        return {
            "impact_chains": [
                {
                    "event": c.event,
                    "chain": c.chain,
                    "affected_sectors": c.affected_sectors,
                    "stock_opportunities": c.stock_opportunities,
                    "order": c.order,
                    "confidence": c.confidence,
                }
                for c in self.impact_chains
            ],
            "hidden_opportunities": self.hidden_opportunities,
            "sector_rotation": self.sector_rotation,
            "llm_provider": self.llm_provider,
            "latency_ms": self.latency_ms,
        }


# ━━━━━━━━━━━━━━━ Reasoning Engine ━━━━━━━━━━━━━━━


class ReasoningEngine:
    """Agent 3: Cause-Effect Chain Builder.

    Uses the best reasoning LLM (prefers Gemini Pro) to build
    multi-layer impact chains from news + market data.
    ONE LLM call with all context.
    """

    def __init__(self) -> None:
        self._router = None

    def _get_router(self):
        if self._router is None:
            self._router = get_llm_router()
        return self._router

    async def build_chains(
        self,
        news_data: dict,
        market_data: dict,
        progress_callback=None,
    ) -> ReasoningResult:
        """Build multi-layer cause-effect chains.

        Args:
            news_data: Output from NewsIntelligence.to_dict()
            market_data: Output from MarketIntelligence.to_dict()
        """
        cache_key = f"reasoning_{hash(str(news_data.get('key_events', [])[:3]))}"
        cached = _reasoning_cache.get(cache_key)
        if cached is not None:
            return cached

        start = time.time()

        if progress_callback:
            await progress_callback(82, "building_impact_chains")

        # Build context from news + market
        news_context = self._format_news_context(news_data)
        market_context = self._format_market_context(market_data)

        prompt = f"""You are a hedge fund analyst specializing in multi-order impact analysis for Indian markets (NSE).

CURRENT NEWS INTELLIGENCE:
{news_context}

CURRENT MARKET STATE:
{market_context}

Build MULTI-LAYER cause-effect chains. Think like a hedge fund:
- 1st order: Direct, obvious impact (everyone sees this)
- 2nd order: Secondary effect (smart money sees this)
- 3rd order: Hidden effect (only quant funds see this)

Respond in STRICT JSON:
{{
    "impact_chains": [
        {{
            "event": "The triggering event",
            "chain": ["1st order effect", "2nd order effect", "3rd order hidden effect"],
            "affected_sectors": ["Banking", "IT"],
            "stock_opportunities": ["RELIANCE", "HDFCBANK"],
            "order": 3,
            "confidence": "high"
        }}
    ],
    "hidden_opportunities": [
        {{"stock": "SYMBOL", "reason": "3rd order effect that market hasn't priced in", "sector": "Energy"}}
    ],
    "sector_rotation": {{
        "money_flowing_into": ["Banking", "Energy"],
        "money_flowing_out": ["IT", "Pharma"]
    }}
}}

Rules:
- Focus on NSE stocks only
- Include AT LEAST 3 impact chains with 2nd/3rd order effects
- Hidden opportunities = stocks benefiting from non-obvious effects
- Be specific about stock symbols (e.g., RELIANCE, TCS, HDFCBANK)"""

        try:
            router = self._get_router()
            response = await router.chat(
                task=TASK_REASONING,
                messages=[
                    LLMMessage(role="system", content="You are a multi-order impact analysis expert for Indian stock markets. Respond ONLY in valid JSON."),
                    LLMMessage(role="user", content=prompt),
                ],
                temperature=0.3,
                max_tokens=4096,
            )

            parsed = self._parse_json(response.content)

            chains = []
            for c in parsed.get("impact_chains", []):
                chains.append(ImpactChain(
                    event=c.get("event", ""),
                    chain=c.get("chain", []),
                    affected_sectors=c.get("affected_sectors", []),
                    stock_opportunities=c.get("stock_opportunities", []),
                    order=c.get("order", 1),
                    confidence=c.get("confidence", "medium"),
                ))

            result = ReasoningResult(
                impact_chains=chains,
                hidden_opportunities=parsed.get("hidden_opportunities", []),
                sector_rotation=parsed.get("sector_rotation", {}),
                llm_provider=response.provider,
                latency_ms=int((time.time() - start) * 1000),
            )

            if progress_callback:
                await progress_callback(88, "reasoning_complete")

            _reasoning_cache.set(cache_key, result)

            logger.info(
                "[reasoning] Built %d impact chains, %d hidden opportunities (%dms)",
                len(chains), len(result.hidden_opportunities), result.latency_ms,
            )

            return result

        except Exception as e:
            logger.error("[reasoning] Chain building failed: %s", str(e)[:200])
            return ReasoningResult(latency_ms=int((time.time() - start) * 1000))

    def _format_news_context(self, news: dict) -> str:
        events = news.get("key_events", [])
        if not events:
            return "No significant news events detected."

        lines = []
        for e in events[:8]:
            impact = e.get("impact", "MEDIUM")
            sectors = ", ".join(e.get("sectors_affected", []))
            lines.append(f"- [{impact}] {e.get('event', '')} (Sectors: {sectors})")

        return "\n".join(lines)

    def _format_market_context(self, market: dict) -> str:
        lines = []
        for idx in market.get("indices", []):
            lines.append(
                f"- {idx.get('name', 'Unknown')}: {idx.get('value', 0)} "
                f"({idx.get('change_pct', 0):+.2f}%) | "
                f"Last hour: {idx.get('last_hour_trend', 'sideways')}"
            )

        sentiment = market.get("overall_sentiment", "NEUTRAL")
        lines.append(f"- Overall sentiment: {sentiment}")

        return "\n".join(lines) if lines else "No market data available."

    def _parse_json(self, text: str) -> dict:
        import json
        import re

        text = re.sub(r"```json\s*", "", text)
        text = re.sub(r"```\s*", "", text)
        text = text.strip()

        try:
            return json.loads(text)
        except json.JSONDecodeError:
            match = re.search(r"\{[\s\S]*\}", text)
            if match:
                try:
                    return json.loads(match.group())
                except json.JSONDecodeError:
                    pass
            return {}
