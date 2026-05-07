"""
Module: app/services/smart_selector.py
Purpose: Agent 4 — Multi-signal stock scorer with hybrid AI+ML+NLP scoring.

CONSTRAINT #3: Receives only pre-filtered stocks (20, not 300).
Scores each stock using multiple signals:
  - Technical indicators (25 pts) — from existing technical.py
  - Fundamentals (20 pts) — ROE, debt, earnings via yfinance
  - LLM reasoning alignment (20 pts) — matches impact chains
  - Sentiment score (15 pts) — from news context
  - Last-hour activity (10 pts) — volume spike + price action
  - ML prediction (10 pts) — LightGBM UP/DOWN (future)

Output: Strict JSON with entry, stop_loss, target per stock.
"""

import logging
import time
from dataclasses import dataclass, field
from typing import Optional

from app.config import settings
from app.services.cache import TTLCache
from app.services.llm_providers import LLMMessage
from app.services.llm_router import TASK_SELECTOR, get_llm_router

logger = logging.getLogger(__name__)

_selector_cache = TTLCache(default_ttl=settings.INTELLIGENCE_CACHE_TTL)


# ━━━━━━━━━━━━━━━ Data Classes ━━━━━━━━━━━━━━━


@dataclass
class ScoredStock:
    """A stock with multi-signal scoring."""
    stock: str = ""
    signal: str = "HOLD"  # BUY / SELL / HOLD
    confidence: int = 0  # 0-100
    reason: str = ""
    entry: float = 0.0
    stop_loss: float = 0.0
    target: float = 0.0
    sector: str = ""
    impact_chain: str = ""
    sentiment: str = "NEUTRAL"
    risk_level: str = "MEDIUM"
    last_hour_activity: str = ""

    # Score breakdown
    technical_score: float = 0.0
    fundamental_score: float = 0.0
    chain_score: float = 0.0
    sentiment_score: float = 0.0
    last_hour_score: float = 0.0
    ml_score: float = 0.0
    total_score: float = 0.0

    def to_dict(self) -> dict:
        return {
            "stock": self.stock,
            "signal": self.signal,
            "confidence": self.confidence,
            "reason": self.reason,
            "entry": self.entry,
            "stop_loss": self.stop_loss,
            "target": self.target,
            "sector": self.sector,
            "impact_chain": self.impact_chain,
            "sentiment": self.sentiment,
            "risk_level": self.risk_level,
            "last_hour_activity": self.last_hour_activity,
            "score_breakdown": {
                "technical": self.technical_score,
                "fundamental": self.fundamental_score,
                "chain_alignment": self.chain_score,
                "sentiment": self.sentiment_score,
                "last_hour": self.last_hour_score,
                "ml_prediction": self.ml_score,
                "total": self.total_score,
            },
        }


@dataclass
class SelectionResult:
    """Output from the Stock Selector agent."""
    top_picks: list[ScoredStock] = field(default_factory=list)
    hidden_gems: list[ScoredStock] = field(default_factory=list)
    breakout_candidates: list[dict] = field(default_factory=list)
    sector_focus: list[dict] = field(default_factory=list)
    risk_warnings: list[dict] = field(default_factory=list)
    total_analyzed: int = 0
    llm_provider: str = ""
    latency_ms: int = 0

    def to_dict(self) -> dict:
        return {
            "top_picks": [s.to_dict() for s in self.top_picks],
            "hidden_gems": [s.to_dict() for s in self.hidden_gems],
            "breakout_candidates": self.breakout_candidates,
            "sector_focus": self.sector_focus,
            "risk_warnings": self.risk_warnings,
            "total_analyzed": self.total_analyzed,
            "llm_provider": self.llm_provider,
            "latency_ms": self.latency_ms,
        }


# ━━━━━━━━━━━━━━━ Smart Selector ━━━━━━━━━━━━━━━


class SmartSelector:
    """Agent 4: Multi-signal stock scorer.

    Takes pre-filtered candidates (max 20) and scores them using
    hybrid AI + technical + fundamental signals.
    ONE batch LLM call for all stocks.
    """

    def __init__(self) -> None:
        self._router = None

    def _get_router(self):
        if self._router is None:
            self._router = get_llm_router()
        return self._router

    async def score_stocks(
        self,
        candidates: list[dict],
        impact_chains: dict,
        news_data: dict,
        market_data: dict,
        progress_callback=None,
    ) -> SelectionResult:
        """Score and rank pre-filtered stock candidates.

        Args:
            candidates: List of stock dicts from rule-based filter
                        (max INTELLIGENCE_MAX_STOCKS).
            impact_chains: Output from ReasoningEngine.to_dict().
            news_data: Output from NewsIntelligence.to_dict().
            market_data: Output from MarketIntelligence.to_dict().
        """
        if not candidates:
            return SelectionResult()

        start = time.time()

        if progress_callback:
            await progress_callback(90, "scoring_stocks")

        # Cap candidates to configured max
        candidates = candidates[:settings.INTELLIGENCE_MAX_STOCKS]

        # ONE batch LLM call for all stocks
        result = await self._batch_score_with_llm(
            candidates, impact_chains, news_data, market_data
        )
        result.total_analyzed = len(candidates)
        result.latency_ms = int((time.time() - start) * 1000)

        if progress_callback:
            await progress_callback(95, "scoring_complete")

        logger.info(
            "[selector] Scored %d stocks, %d top picks, %d hidden gems (%dms)",
            len(candidates), len(result.top_picks),
            len(result.hidden_gems), result.latency_ms,
        )

        return result

    async def _batch_score_with_llm(
        self,
        candidates: list[dict],
        chains: dict,
        news: dict,
        market: dict,
    ) -> SelectionResult:
        """ONE batch LLM call to score all stocks.

        CONSTRAINT #3: All stocks in one prompt, not per-stock.
        """
        # Build candidate list text
        stocks_text = "\n".join(
            f"  {i+1}. {c.get('symbol', 'UNKNOWN')} — "
            f"Price: ₹{c.get('price', 0):.2f}, "
            f"RSI: {c.get('rsi', 50):.1f}, "
            f"Signal: {c.get('signal', 'NEUTRAL')}, "
            f"Volume Ratio: {c.get('volume_ratio', 1):.1f}x"
            for i, c in enumerate(candidates)
        )

        # Build impact chain context
        chains_text = ""
        for chain in chains.get("impact_chains", [])[:5]:
            stocks = ", ".join(chain.get("stock_opportunities", []))
            chains_text += f"  - {chain.get('event', '')} → {stocks}\n"

        # News sentiment
        sentiment = news.get("global_sentiment", "NEUTRAL")
        prediction = market.get("next_day_prediction", "sideways")

        prompt = f"""You are a stock selection AI for Indian markets (NSE).

CANDIDATE STOCKS (pre-filtered by technical analysis):
{stocks_text}

IMPACT CHAINS (from news analysis):
{chains_text}

MARKET CONTEXT:
  Sentiment: {sentiment}
  Next day prediction: {prediction}

For EACH stock, evaluate and respond in STRICT JSON:
{{
    "picks": [
        {{
            "stock": "RELIANCE",
            "signal": "BUY",
            "confidence": 85,
            "reason": "Volume breakout + support + uptrend + benefits from oil price drop",
            "entry": 2450.0,
            "stop_loss": 2380.0,
            "target": 2600.0,
            "sector": "Energy",
            "impact_chain": "Oil price drop → Lower input costs → Margin expansion",
            "sentiment": "POSITIVE",
            "risk_level": "LOW",
            "last_hour_activity": "Strong institutional buying",
            "scores": {{
                "technical": 22,
                "fundamental": 18,
                "chain_alignment": 17,
                "sentiment": 13,
                "last_hour": 8,
                "total": 78
            }}
        }}
    ],
    "hidden_gems": [
        {{
            "stock": "SYMBOL",
            "reason": "Non-obvious 3rd order effect",
            "confidence": 65,
            "entry": 100.0,
            "stop_loss": 95.0,
            "target": 115.0
        }}
    ],
    "breakout_candidates": [
        {{
            "stock": "TATAMOTORS",
            "current_price": 950.0,
            "resistance": 980.0,
            "support": 920.0,
            "distance_pct": 3.1,
            "volume_signal": "Accumulation detected",
            "breakout_type": "RESISTANCE",
            "probability": "HIGH"
        }}
    ],
    "sector_focus": [
        {{
            "sector": "Banking",
            "stance": "BULLISH",
            "reason": "RBI policy support + credit growth",
            "top_stock": "HDFCBANK",
            "momentum": 78
        }}
    ],
    "risk_warnings": [
        {{
            "event": "US Fed rate decision tomorrow",
            "impact": "HIGH",
            "affected_sectors": ["IT", "Banking"],
            "action": "Reduce overnight positions in IT"
        }}
    ]
}}

SCORING RULES (max 100):
- Technical (0-25): RSI < 60 bullish, MACD crossover, near support, volume breakout
- Fundamental (0-20): Strong ROE, low debt, earnings growth
- Chain Alignment (0-20): Benefits from identified impact chains
- Sentiment (0-15): Positive news coverage
- Last Hour (0-10): Volume spike, institutional accumulation
- ML Prediction (0-10): Historical pattern match

Rules:
- Only select stocks with total score > 60
- Signal: BUY (score > 70), HOLD (60-70), skip below 60
- Stop loss: 2-3% below entry
- Target: 3-8% above entry (short-term 1-3 days)
- Include at least 1 hidden gem from 2nd/3rd order effects
- MUST include entry, stop_loss, target for every pick
- breakout_candidates: 3-5 stocks closest to key resistance/support levels (within 5%)
- sector_focus: top 3-4 sectors ranked by momentum and catalyst alignment
- risk_warnings: 2-3 major risks for today/tomorrow that traders MUST know"""

        try:
            router = self._get_router()
            response = await router.chat(
                task=TASK_SELECTOR,
                messages=[
                    LLMMessage(role="system", content="You are an expert stock selector for Indian markets. Return ONLY valid JSON. Be specific about entry, stop_loss, and target prices."),
                    LLMMessage(role="user", content=prompt),
                ],
                temperature=0.2,
                max_tokens=4096,
            )

            parsed = self._parse_json(response.content)

            # Build ScoredStock objects
            top_picks = []
            for p in parsed.get("picks", []):
                scores = p.get("scores", {})
                stock = ScoredStock(
                    stock=p.get("stock", ""),
                    signal=p.get("signal", "HOLD"),
                    confidence=p.get("confidence", 0),
                    reason=p.get("reason", ""),
                    entry=p.get("entry", 0.0),
                    stop_loss=p.get("stop_loss", 0.0),
                    target=p.get("target", 0.0),
                    sector=p.get("sector", ""),
                    impact_chain=p.get("impact_chain", ""),
                    sentiment=p.get("sentiment", "NEUTRAL"),
                    risk_level=p.get("risk_level", "MEDIUM"),
                    last_hour_activity=p.get("last_hour_activity", ""),
                    technical_score=scores.get("technical", 0),
                    fundamental_score=scores.get("fundamental", 0),
                    chain_score=scores.get("chain_alignment", 0),
                    sentiment_score=scores.get("sentiment", 0),
                    last_hour_score=scores.get("last_hour", 0),
                    total_score=scores.get("total", 0),
                )
                top_picks.append(stock)

            # Sort by total score descending
            top_picks.sort(key=lambda s: s.total_score, reverse=True)

            hidden_gems = []
            for h in parsed.get("hidden_gems", []):
                hidden_gems.append(ScoredStock(
                    stock=h.get("stock", ""),
                    signal="BUY",
                    confidence=h.get("confidence", 50),
                    reason=h.get("reason", ""),
                    entry=h.get("entry", 0.0),
                    stop_loss=h.get("stop_loss", 0.0),
                    target=h.get("target", 0.0),
                ))

            return SelectionResult(
                top_picks=top_picks[:10],
                hidden_gems=hidden_gems[:3],
                breakout_candidates=parsed.get("breakout_candidates", []),
                sector_focus=parsed.get("sector_focus", []),
                risk_warnings=parsed.get("risk_warnings", []),
                llm_provider=response.provider,
            )

        except Exception as e:
            logger.error("[selector] LLM scoring failed: %s", str(e)[:200])
            return SelectionResult()

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
