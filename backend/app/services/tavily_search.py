"""
Module: app/services/tavily_search.py
Purpose: Real-time market intelligence via Tavily Search API.

Searches the web for latest news about stocks, sectors, and market events.
Results are fed to the AI engine for sentiment analysis.

API key comes from settings.TAVILY_API_KEY — never hardcoded.
"""

import logging
from dataclasses import dataclass, field
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)


# ━━━━━━━━━━━━━━━ Data Classes ━━━━━━━━━━━━━━━


@dataclass
class NewsArticle:
    """A single news search result."""

    title: str = ""
    url: str = ""
    content: str = ""
    score: float = 0.0  # Relevance score from Tavily


@dataclass
class MarketNewsResult:
    """Collection of news articles for a stock/topic."""

    query: str = ""
    symbol: str = ""
    articles: list[NewsArticle] = field(default_factory=list)
    combined_text: str = ""
    article_count: int = 0


# ━━━━━━━━━━━━━━━ Tavily Search Service ━━━━━━━━━━━━━━━


class TavilySearchService:
    """Real-time market intelligence powered by Tavily Search.

    Searches the web for stock-specific news, sector updates,
    and market events. Results can be fed to the AI engine for
    sentiment analysis.

    Example:
        searcher = TavilySearchService()
        news = await searcher.search_stock_news("RELIANCE")
        print(news.combined_text)
    """

    def __init__(self) -> None:
        """Initialize Tavily search client.

        API key sourced from settings — disabled gracefully if not set.
        """
        self._client = None
        self._enabled = bool(settings.TAVILY_API_KEY)

        if self._enabled:
            try:
                from tavily import TavilyClient
                self._client = TavilyClient(api_key=settings.TAVILY_API_KEY)
                logger.info("TavilySearchService initialized")
            except Exception as e:
                logger.warning("Tavily init failed: %s", e)
                self._enabled = False
        else:
            logger.info("TavilySearchService disabled — TAVILY_API_KEY not set")

    @property
    def is_enabled(self) -> bool:
        """Check if Tavily search is available."""
        return self._enabled

    async def search_stock_news(
        self,
        symbol: str,
        max_results: int = 5,
    ) -> MarketNewsResult:
        """Search for latest news about a specific stock.

        Args:
            symbol: Stock symbol (e.g., "RELIANCE", "TCS").
            max_results: Maximum number of articles to return.

        Returns:
            MarketNewsResult with articles and combined text.
        """
        query = f"{symbol} NSE India stock news latest"
        return await self._search(query, symbol, max_results)

    async def search_sector_news(
        self,
        sector: str,
        max_results: int = 5,
    ) -> MarketNewsResult:
        """Search for sector-specific market news.

        Args:
            sector: Sector name (e.g., "IT", "Banking", "Pharma").
            max_results: Maximum number of articles to return.

        Returns:
            MarketNewsResult with articles.
        """
        query = f"India {sector} sector stock market news today"
        return await self._search(query, sector, max_results)

    async def search_market_overview(
        self,
        max_results: int = 5,
    ) -> MarketNewsResult:
        """Search for overall Indian market news.

        Returns:
            MarketNewsResult with broad market articles.
        """
        query = "NSE Nifty Sensex India stock market news today"
        return await self._search(query, "MARKET", max_results)

    async def search_custom(
        self,
        query: str,
        max_results: int = 5,
    ) -> MarketNewsResult:
        """Run a custom search query.

        Args:
            query: Free-form search query.
            max_results: Maximum number of articles.

        Returns:
            MarketNewsResult with articles.
        """
        return await self._search(query, "CUSTOM", max_results)

    # ━━━━━━━━━━━━ Private ━━━━━━━━━━━━

    async def _search(
        self, query: str, symbol: str, max_results: int
    ) -> MarketNewsResult:
        """Execute a Tavily search and return structured results."""
        if not self._enabled or not self._client:
            logger.debug("Tavily search skipped — service disabled")
            return MarketNewsResult(
                query=query,
                symbol=symbol,
                articles=[],
                combined_text="News search unavailable — TAVILY_API_KEY not configured.",
                article_count=0,
            )

        try:
            # Tavily search is synchronous — run it safely
            response = self._client.search(
                query=query,
                search_depth="advanced",
                max_results=max_results,
                include_answer=True,
            )

            articles = []
            for result in response.get("results", []):
                articles.append(
                    NewsArticle(
                        title=result.get("title", ""),
                        url=result.get("url", ""),
                        content=result.get("content", "")[:500],
                        score=result.get("score", 0.0),
                    )
                )

            # Combine text for AI sentiment analysis
            combined = self._build_combined_text(articles, response)

            logger.info(
                "Tavily search for '%s' returned %d articles",
                symbol,
                len(articles),
            )

            return MarketNewsResult(
                query=query,
                symbol=symbol,
                articles=articles,
                combined_text=combined,
                article_count=len(articles),
            )

        except Exception as e:
            logger.error("Tavily search failed for '%s': %s", query, e)
            return MarketNewsResult(
                query=query,
                symbol=symbol,
                articles=[],
                combined_text=f"News search failed: {str(e)[:100]}",
                article_count=0,
            )

    @staticmethod
    def _build_combined_text(
        articles: list[NewsArticle], response: dict
    ) -> str:
        """Build a combined text block from search results for AI consumption."""
        parts = []

        # Include Tavily's answer if available
        answer = response.get("answer")
        if answer:
            parts.append(f"Summary: {answer}")
            parts.append("")

        for i, article in enumerate(articles, 1):
            parts.append(f"[{i}] {article.title}")
            if article.content:
                parts.append(f"    {article.content[:300]}")
            parts.append("")

        return "\n".join(parts)[:3000]  # Cap total length
