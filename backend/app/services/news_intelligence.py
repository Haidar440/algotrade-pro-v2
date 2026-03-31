"""
Module: app/services/news_intelligence.py
Purpose: Agent 1 — News Analyzer for Multi-LLM Intelligence System.

Fetches news from multiple free sources and uses LLM to extract
key events, sentiment, and market-moving factors.

Data sources (all free, dynamically enabled based on config):
  - DuckDuckGo Search (no API key — always available)
  - Existing GeminiNewsService (Google Search grounding)
  - RSS feeds (MoneyControl, Economic Times, LiveMint)
  - Alpha Vantage sentiment (if key provided)

CONSTRAINT #3: ONE batch LLM call for all news — not per-article.
CONSTRAINT #7: Fault-tolerant — each source wrapped in try/except.
CONSTRAINT #8: Results cached with TTL.
"""

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Optional

from app.config import settings
from app.services.cache import TTLCache
from app.services.llm_providers import LLMMessage
from app.services.llm_router import TASK_NEWS, get_llm_router

logger = logging.getLogger(__name__)

# Cache for news analysis (15 min TTL)
_news_cache = TTLCache(default_ttl=settings.INTELLIGENCE_CACHE_TTL)


# ━━━━━━━━━━━━━━━ Data Classes ━━━━━━━━━━━━━━━


@dataclass
class NewsItem:
    """A single news article from any source."""
    title: str
    source: str
    url: str = ""
    content: str = ""
    published: str = ""
    sentiment: str = ""  # Filled by LLM


@dataclass
class NewsIntelligenceResult:
    """Output from the News Analyzer agent."""
    key_events: list[dict] = field(default_factory=list)
    india_impacts: list[str] = field(default_factory=list)
    global_sentiment: str = "NEUTRAL"  # BULLISH / BEARISH / NEUTRAL / MIXED
    sentiment_score: float = 0.5  # 0.0 (very bearish) to 1.0 (very bullish)
    sources_used: list[str] = field(default_factory=list)
    article_count: int = 0
    raw_articles: list[NewsItem] = field(default_factory=list)
    llm_provider: str = ""
    latency_ms: int = 0

    def to_dict(self) -> dict:
        return {
            "key_events": self.key_events,
            "india_impacts": self.india_impacts,
            "global_sentiment": self.global_sentiment,
            "sentiment_score": self.sentiment_score,
            "sources_used": self.sources_used,
            "article_count": self.article_count,
            "llm_provider": self.llm_provider,
            "latency_ms": self.latency_ms,
        }


# ━━━━━━━━━━━━━━━ News Intelligence ━━━━━━━━━━━━━━━


class NewsIntelligence:
    """Agent 1: News Analyzer — extracts key events from latest news.

    Aggregates news from multiple free sources, then sends ONE batch
    prompt to the LLM for analysis (Constraint #3).
    """

    def __init__(self) -> None:
        self._router = None  # Lazy init

    def _get_router(self):
        if self._router is None:
            self._router = get_llm_router()
        return self._router

    async def analyze(self, progress_callback=None) -> NewsIntelligenceResult:
        """Run full news analysis pipeline.

        Returns cached result if available, otherwise fetches fresh data.
        """
        cached = _news_cache.get("news_analysis")
        if cached is not None:
            logger.debug("[news] Returning cached analysis")
            return cached

        start = time.time()

        if progress_callback:
            await progress_callback(10, "fetching_news")

        # Step 1: Fetch news from all available sources (parallel, fault-tolerant)
        articles = await self._fetch_all_news()

        if progress_callback:
            await progress_callback(40, "analyzing_news")

        # Step 2: Send ONE batch prompt to LLM
        result = await self._analyze_with_llm(articles)
        result.latency_ms = int((time.time() - start) * 1000)

        if progress_callback:
            await progress_callback(50, "news_complete")

        # Cache result
        _news_cache.set("news_analysis", result)

        logger.info(
            "[news] Analysis complete — %d articles, %d events, %s sentiment (%dms)",
            result.article_count, len(result.key_events),
            result.global_sentiment, result.latency_ms,
        )

        return result

    async def _fetch_all_news(self) -> list[NewsItem]:
        """Fetch news from all available sources in parallel.

        CONSTRAINT #7: Each source wrapped in try/except.
        """
        tasks = [
            self._fetch_duckduckgo(),
            self._fetch_rss_feeds(),
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)
        articles = []

        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.warning("[news] Source %d failed: %s", i, str(result)[:200])
            elif isinstance(result, list):
                articles.extend(result)

        logger.info("[news] Fetched %d articles from all sources", len(articles))
        return articles

    async def _fetch_duckduckgo(self) -> list[NewsItem]:
        """Fetch latest news via DuckDuckGo (free, no API key)."""
        try:
            from duckduckgo_search import DDGS

            articles = []
            queries = [
                "Indian stock market today NSE",
                "global economy geopolitical news today",
                "India Nifty Sensex market news",
            ]

            ddgs = DDGS()
            for query in queries:
                try:
                    results = ddgs.news(query, max_results=5, timelimit="d")
                    for r in results:
                        articles.append(NewsItem(
                            title=r.get("title", ""),
                            source="DuckDuckGo",
                            url=r.get("url", ""),
                            content=r.get("body", "")[:500],
                            published=r.get("date", ""),
                        ))
                except Exception as e:
                    logger.debug("[news] DDG query '%s' failed: %s", query, str(e)[:100])

            return articles[:15]  # Cap at 15

        except ImportError:
            logger.debug("[news] duckduckgo-search not installed — skipping")
            return []

    async def _fetch_rss_feeds(self) -> list[NewsItem]:
        """Fetch news from RSS feeds (MoneyControl, ET, LiveMint)."""
        try:
            import feedparser
        except ImportError:
            logger.debug("[news] feedparser not installed — skipping RSS")
            return []

        feeds = [
            ("https://www.moneycontrol.com/rss/latestnews.xml", "MoneyControl"),
            ("https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms", "Economic Times"),
        ]

        articles = []
        for feed_url, source_name in feeds:
            try:
                feed = feedparser.parse(feed_url)
                for entry in feed.entries[:5]:
                    articles.append(NewsItem(
                        title=entry.get("title", ""),
                        source=source_name,
                        url=entry.get("link", ""),
                        content=entry.get("summary", "")[:500],
                        published=entry.get("published", ""),
                    ))
            except Exception as e:
                logger.debug("[news] RSS '%s' failed: %s", source_name, str(e)[:100])

        return articles

    async def _analyze_with_llm(self, articles: list[NewsItem]) -> NewsIntelligenceResult:
        """Send all articles to LLM in ONE batch call.

        CONSTRAINT #3: Batch prompting — all articles in one request.
        """
        if not articles:
            return NewsIntelligenceResult(
                sources_used=["none"],
                global_sentiment="NEUTRAL",
            )

        # Build batch prompt with all articles
        articles_text = "\n".join(
            f"[{i+1}] [{a.source}] {a.title}\n{a.content[:300]}"
            for i, a in enumerate(articles[:20])  # Cap to fit context
        )

        prompt = f"""Analyze these {len(articles)} recent news articles for Indian stock market impact.

NEWS ARTICLES:
{articles_text}

Respond in STRICT JSON format:
{{
    "key_events": [
        {{"event": "description", "impact": "HIGH/MEDIUM/LOW", "sectors_affected": ["IT", "Banking"]}},
    ],
    "india_impacts": ["impact1", "impact2"],
    "global_sentiment": "BULLISH" or "BEARISH" or "NEUTRAL" or "MIXED",
    "sentiment_score": 0.0 to 1.0
}}

Rules:
- Focus on events that move Indian markets (NSE/BSE)
- Include geopolitical, oil, FII/FPI, RBI, earnings events
- Be specific about which sectors are impacted
- DO NOT include filler — only actionable intelligence"""

        try:
            router = self._get_router()
            response = await router.chat(
                task=TASK_NEWS,
                messages=[
                    LLMMessage(role="system", content="You are a financial news intelligence analyst specializing in Indian markets. Respond ONLY in valid JSON."),
                    LLMMessage(role="user", content=prompt),
                ],
                temperature=0.2,
            )

            parsed = self._parse_llm_response(response.content)
            sources = list(set(a.source for a in articles))

            return NewsIntelligenceResult(
                key_events=parsed.get("key_events", []),
                india_impacts=parsed.get("india_impacts", []),
                global_sentiment=parsed.get("global_sentiment", "NEUTRAL"),
                sentiment_score=parsed.get("sentiment_score", 0.5),
                sources_used=sources,
                article_count=len(articles),
                raw_articles=articles[:10],
                llm_provider=response.provider,
            )

        except Exception as e:
            logger.error("[news] LLM analysis failed: %s", str(e)[:200])
            return NewsIntelligenceResult(
                sources_used=["fallback"],
                article_count=len(articles),
                global_sentiment="NEUTRAL",
            )

    def _parse_llm_response(self, text: str) -> dict:
        """Parse JSON from LLM response, handling markdown code blocks."""
        import json
        import re

        # Remove markdown code blocks
        text = re.sub(r"```json\s*", "", text)
        text = re.sub(r"```\s*", "", text)
        text = text.strip()

        try:
            return json.loads(text)
        except json.JSONDecodeError:
            # Try to find JSON object in text
            match = re.search(r"\{[\s\S]*\}", text)
            if match:
                try:
                    return json.loads(match.group())
                except json.JSONDecodeError:
                    pass
            logger.warning("[news] Failed to parse LLM JSON response")
            return {}
