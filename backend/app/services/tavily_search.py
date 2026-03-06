"""
Module: app/services/tavily_search.py

Purpose: Production-grade real-time market intelligence via Tavily Search API.

Searches the web for latest news about stocks, sectors, and market events.
Results are fed to the AI engine for sentiment analysis and trading decisions.

KEY FEATURES (from Tavily API docs -- best practices applied):
- AsyncTavilyClient for non-blocking searches in async FastAPI
- topic="news" for breaking news (includes published_date metadata)
- topic="general" for financial analysis (can use country param)
- search_depth="advanced" + chunks_per_source=3 for highest relevance
- include_answer="advanced" for detailed LLM-generated summaries
- exclude_domains to block known garbage/irrelevant sites
- Sub-query pattern: break complex requests into focused searches
- Post-processing: score-based filtering + title/content relevance check
- Query optimization: under 400 chars, company name prominent

API key comes from settings.TAVILY_API_KEY -- never hardcoded.
"""

import asyncio
import logging
import re
from dataclasses import dataclass, field
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)


# Trusted Indian finance domains -- used ONLY for market_overview searches
INDIAN_FINANCE_DOMAINS = [
    "moneycontrol.com",
    "economictimes.indiatimes.com",
    "livemint.com",
    "ndtv.com",
    "business-standard.com",
    "financialexpress.com",
    "screener.in",
    "trendlyne.com",
    "tickertape.in",
    "nseindia.com",
    "bseindia.com",
    "reuters.com",
    "bloomberg.com",
    "cnbctv18.com",
]

# Domains that frequently return irrelevant/spammy results for stock queries
# Per Tavily best practices: "exclude_domains" to filter out garbage sources
EXCLUDE_DOMAINS = [
    "marketsmojo.com",       # Returns generic stock lists, not real news
    "chittorgarh.com",       # IPO-focused, pollutes stock-specific searches
    "goodreturns.in",        # Generic listicles, not company-specific news
    "5paisa.com",            # Broker marketing pages, not news
    "angelone.in",           # Broker pages, not news
    "upstox.com",            # Broker pages
    "samco.in",              # Broker pages
    "motilaloswalmf.com",    # MF marketing
    "indiainfoline.com",     # Often outdated, low-quality content
    "stockedge.com",         # Stock screener, not news
    "topstockresearch.com",  # Spammy stock tips
    "equitymaster.com",      # Paywall/promotional content
    "advisorkhoj.com",       # MF marketing
    "paisabazaar.com",       # Loan/credit card marketing
    "bankbazaar.com",        # Loan/credit card marketing
    "scanx.trade",           # Returns unrelated stock results (Naksh etc)
    "indiaherald.com",       # Returns unrelated content (fighter pilot etc)
]

# Minimum Tavily relevance score to include an article
# Per Tavily docs: "score indicates relevance between query and content"
# Higher threshold = fewer but more relevant results
MIN_RELEVANCE_SCORE = 0.40


# ---- Data Classes ----

@dataclass
class NewsArticle:
    """A single news search result with full metadata."""

    title: str = ""
    url: str = ""
    content: str = ""
    score: float = 0.0
    published_date: Optional[str] = None
    raw_content: Optional[str] = None


@dataclass
class MarketNewsResult:
    """Collection of news articles for a stock/topic."""

    query: str = ""
    symbol: str = ""
    articles: list[NewsArticle] = field(default_factory=list)
    combined_text: str = ""
    article_count: int = 0
    tavily_answer: Optional[str] = None
    search_topic: str = "finance"


# Common NSE symbol → full company name mapping for better search results
# Without this, generic tickers like "IDEA" or "YES" return irrelevant results
SYMBOL_TO_COMPANY: dict[str, str] = {
    "RELIANCE": "Reliance Industries",
    "TCS": "Tata Consultancy Services TCS",
    "INFY": "Infosys",
    "HDFCBANK": "HDFC Bank",
    "ICICIBANK": "ICICI Bank",
    "HINDUNILVR": "Hindustan Unilever",
    "ITC": "ITC Limited",
    "SBIN": "State Bank of India SBI",
    "BHARTIARTL": "Bharti Airtel",
    "KOTAKBANK": "Kotak Mahindra Bank",
    "LT": "Larsen and Toubro",
    "HCLTECH": "HCL Technologies",
    "AXISBANK": "Axis Bank",
    "ASIANPAINT": "Asian Paints",
    "MARUTI": "Maruti Suzuki",
    "TITAN": "Titan Company",
    "SUNPHARMA": "Sun Pharma",
    "BAJFINANCE": "Bajaj Finance",
    "WIPRO": "Wipro",
    "ULTRACEMCO": "UltraTech Cement",
    "TATAMOTORS": "Tata Motors",
    "TATASTEEL": "Tata Steel",
    "POWERGRID": "Power Grid Corporation",
    "NTPC": "NTPC Limited",
    "M&M": "Mahindra and Mahindra",
    "NESTLEIND": "Nestle India",
    "JSWSTEEL": "JSW Steel",
    "ADANIENT": "Adani Enterprises",
    "ADANIPORTS": "Adani Ports",
    "ADANIPOWER": "Adani Power",
    "ONGC": "Oil and Natural Gas Corporation ONGC",
    "COALINDIA": "Coal India",
    "BPCL": "Bharat Petroleum BPCL",
    "IOC": "Indian Oil Corporation",
    "GRASIM": "Grasim Industries",
    "TECHM": "Tech Mahindra",
    "DRREDDY": "Dr Reddys Laboratories",
    "CIPLA": "Cipla",
    "DIVISLAB": "Divis Laboratories",
    "APOLLOHOSP": "Apollo Hospitals",
    "EICHERMOT": "Eicher Motors Royal Enfield",
    "HEROMOTOCO": "Hero MotoCorp",
    "BAJAJ-AUTO": "Bajaj Auto",
    "BAJAJFINSV": "Bajaj Finserv",
    "INDUSINDBK": "IndusInd Bank",
    "BANKBARODA": "Bank of Baroda",
    "PNB": "Punjab National Bank PNB",
    "IDEA": "Vodafone Idea Vi telecom",
    "YESBANK": "Yes Bank",
    "ZOMATO": "Zomato",
    "PAYTM": "Paytm One97 Communications",
    "NYKAA": "Nykaa FSN E-Commerce",
    "POLICYBZR": "PB Fintech PolicyBazaar",
    "DELHIVERY": "Delhivery",
    "IRCTC": "IRCTC Indian Railway Catering",
    "TATAPOWER": "Tata Power",
    "TATAELXSI": "Tata Elxsi",
    "LTIM": "LTIMindtree",
    "HAL": "Hindustan Aeronautics HAL",
    "BEL": "Bharat Electronics BEL",
    "BHEL": "Bharat Heavy Electricals BHEL",
    "VEDL": "Vedanta",
    "HINDALCO": "Hindalco Industries",
    "SAIL": "Steel Authority of India SAIL",
    "RECLTD": "REC Limited",
    "PFC": "Power Finance Corporation",
    "NHPC": "NHPC Limited",
    "IRFC": "Indian Railway Finance Corporation",
    "SBILIFE": "SBI Life Insurance",
    "HDFCLIFE": "HDFC Life Insurance",
    "ICICIGI": "ICICI Lombard General Insurance",
    "ISFT": "Intrasoft Technologies",
}


# ---- Tavily Search Service ----

class TavilySearchService:
    """Production-grade market intelligence powered by Tavily Search.

    Uses Tavily specialized finance and news agents to search
    Indian financial websites for stock-specific news, sector updates,
    corporate actions, and market events.

    Results are structured for:
    1. Direct display in News Intelligence dashboard
    2. AI sentiment analysis via Gemini
    3. Enriching AI predictions with real-time context

    Example:
        searcher = TavilySearchService()
        news = await searcher.search_stock_news("RELIANCE")
        print(news.tavily_answer)
        print(news.articles[0].published_date)
    """

    def __init__(self) -> None:
        """Initialize Tavily search client (async preferred, sync fallback).

        API key sourced from settings -- disabled gracefully if not set.
        """
        self._client = None
        self._enabled = bool(settings.TAVILY_API_KEY)
        self._is_sync = False

        if self._enabled:
            try:
                from tavily import AsyncTavilyClient

                self._client = AsyncTavilyClient(api_key=settings.TAVILY_API_KEY)
                self._is_sync = False
                logger.info("TavilySearchService initialized (async client)")
            except ImportError:
                try:
                    from tavily import TavilyClient

                    self._client = TavilyClient(api_key=settings.TAVILY_API_KEY)
                    self._is_sync = True
                    logger.warning(
                        "TavilySearchService: AsyncTavilyClient not available, "
                        "using sync fallback. Update tavily-python for async."
                    )
                except Exception as e:
                    logger.warning("Tavily init failed: %s", e)
                    self._enabled = False
            except Exception as e:
                logger.warning("Tavily init failed: %s", e)
                self._enabled = False
        else:
            logger.info("TavilySearchService disabled -- TAVILY_API_KEY not set")

    @property
    def is_enabled(self) -> bool:
        """Check if Tavily search is available."""
        return self._enabled

    # ---- Public Search Methods ----

    async def search_stock_news(
        self,
        symbol: str,
        max_results: int = 5,
        time_range: str = "week",
    ) -> MarketNewsResult:
        """Search for latest news about a specific stock.

        Uses Tavily best practice: BREAK COMPLEX QUERIES INTO SUB-QUERIES.
        Runs 2 focused parallel searches and merges results by score:
        1. Company news/developments query
        2. Share price/market analysis query

        Post-processes results to filter out irrelevant articles using:
        - Tavily score threshold (MIN_RELEVANCE_SCORE)
        - Title/content keyword matching against company name + symbol

        Args:
            symbol: Stock symbol (e.g., "RELIANCE", "TCS", "INFY").
            max_results: Maximum number of articles (1-20).
            time_range: Recency filter -- "day", "week", "month".

        Returns:
            MarketNewsResult with highly relevant articles only.
        """
        clean_symbol = symbol.upper().strip()
        company = SYMBOL_TO_COMPANY.get(clean_symbol, clean_symbol)

        # Sub-query 1: Company news and developments
        query_news = f"{company} latest news developments India"
        # Sub-query 2: Share price and market analysis
        query_price = f"{company} share price analysis NSE stock market"

        # Run both sub-queries in parallel (Tavily best practice: async gather)
        results = await asyncio.gather(
            self._search(
                query=query_news,
                symbol=clean_symbol,
                max_results=max_results,
                topic="news",
                time_range=time_range,
            ),
            self._search(
                query=query_price,
                symbol=clean_symbol,
                max_results=max_results,
                topic="news",
                time_range=time_range,
            ),
            return_exceptions=True,
        )

        # Merge results from both sub-queries, deduplicate by URL
        all_articles: list[NewsArticle] = []
        seen_urls: set[str] = set()
        best_answer: Optional[str] = None

        for r in results:
            if isinstance(r, (Exception, BaseException)):
                logger.warning("Sub-query failed: %s", r)
                continue
            result: MarketNewsResult = r  # type: ignore[assignment]
            if result.tavily_answer and (not best_answer or len(result.tavily_answer) > len(best_answer)):
                best_answer = result.tavily_answer
            for article in result.articles:
                if article.url not in seen_urls:
                    seen_urls.add(article.url)
                    all_articles.append(article)

        # Post-process: filter by relevance (score + keyword match)
        filtered = self._filter_relevant_articles(all_articles, clean_symbol, company)

        # Sort by score descending, take top N
        filtered.sort(key=lambda a: a.score, reverse=True)
        filtered = filtered[:max_results]

        combined = self._build_combined_text(filtered, best_answer)

        logger.info(
            "Stock news [%s]: %d raw -> %d filtered, answer=%s",
            clean_symbol,
            len(all_articles),
            len(filtered),
            "yes" if best_answer else "no",
        )

        return MarketNewsResult(
            query=f"{company} stock news",
            symbol=clean_symbol,
            articles=filtered,
            combined_text=combined,
            article_count=len(filtered),
            tavily_answer=best_answer,
            search_topic="news",
        )

    async def search_stock_fundamentals(
        self,
        symbol: str,
        max_results: int = 5,
    ) -> MarketNewsResult:
        """Search for fundamental analysis -- earnings, quarterly results, revenue.

        Args:
            symbol: Stock symbol.
            max_results: Maximum articles.

        Returns:
            MarketNewsResult with fundamental analysis articles.
        """
        clean_symbol = symbol.upper().strip()
        company = SYMBOL_TO_COMPANY.get(clean_symbol, clean_symbol)
        query = f"{company} quarterly results earnings revenue profit"
        result = await self._search(
            query=query,
            symbol=clean_symbol,
            max_results=max_results,
            topic="news",
            time_range="month",
        )
        # Post-filter for relevance
        result.articles = self._filter_relevant_articles(
            result.articles, clean_symbol, company
        )
        result.article_count = len(result.articles)
        result.combined_text = self._build_combined_text(
            result.articles, result.tavily_answer
        )
        return result

    async def search_sector_news(
        self,
        sector: str,
        max_results: int = 5,
    ) -> MarketNewsResult:
        """Search for sector-specific market news and outlook.

        Args:
            sector: Sector name (e.g., "IT", "Banking", "Pharma", "Auto").
            max_results: Maximum articles.

        Returns:
            MarketNewsResult with sector news and trends.
        """
        query = f"India {sector} sector stock market news outlook"
        return await self._search(
            query=query,
            symbol=sector.upper(),
            max_results=max_results,
            topic="news",
            time_range="week",
        )

    async def search_market_overview(
        self,
        max_results: int = 5,
    ) -> MarketNewsResult:
        """Search for overall Indian stock market news and analysis.

        Gets broad market sentiment, FII/DII flows, RBI decisions.
        Uses include_domains for market overview (broad, not stock-specific).

        Returns:
            MarketNewsResult with market-wide articles and summary.
        """
        query = "Nifty Sensex Indian stock market today FII DII flows"
        return await self._search(
            query=query,
            symbol="MARKET",
            max_results=max_results,
            topic="news",
            time_range="day",
            include_domains=INDIAN_FINANCE_DOMAINS,
        )

    async def search_corporate_action(
        self,
        symbol: str,
        max_results: int = 3,
    ) -> MarketNewsResult:
        """Search for corporate actions -- dividends, splits, bonuses, buybacks.

        Args:
            symbol: Stock symbol.
            max_results: Maximum articles.

        Returns:
            MarketNewsResult with corporate action details.
        """
        clean_symbol = symbol.upper().strip()
        company = SYMBOL_TO_COMPANY.get(clean_symbol, clean_symbol)
        query = f"{company} dividend bonus split buyback corporate action"
        result = await self._search(
            query=query,
            symbol=clean_symbol,
            max_results=max_results,
            topic="news",
            time_range="month",
        )
        result.articles = self._filter_relevant_articles(
            result.articles, clean_symbol, company
        )
        result.article_count = len(result.articles)
        return result

    async def search_custom(
        self,
        query: str,
        max_results: int = 5,
        topic: str = "news",
        time_range: str = "week",
    ) -> MarketNewsResult:
        """Run a custom search query with full parameter control.

        Args:
            query: Free-form search query (keep under 400 chars).
            max_results: Maximum articles (1-20).
            topic: "general" or "news".
            time_range: "day", "week", "month", "year".

        Returns:
            MarketNewsResult with articles.
        """
        return await self._search(
            query=query[:400],  # Tavily best practice: under 400 chars
            symbol="CUSTOM",
            max_results=max_results,
            topic=topic,
            time_range=time_range,
        )

    # ---- Private ----

    async def _search(
        self,
        query: str,
        symbol: str,
        max_results: int,
        topic: str = "news",
        time_range: str = "week",
        include_domains: Optional[list[str]] = None,
    ) -> MarketNewsResult:
        """Execute a Tavily search with production-grade best practices.

        Applied best practices from Tavily docs:
        - include_answer="advanced" for detailed LLM summary
        - search_depth="advanced" + chunks_per_source=3 for highest relevance
        - exclude_domains to block known garbage sites
        - Score-based post-filtering
        - Query length capped at 400 chars

        Args:
            query: Search query string (capped to 400 chars).
            symbol: Stock/topic identifier for logging.
            max_results: Maximum results (1-20).
            topic: Tavily agent -- "general" or "news".
            time_range: Recency filter -- "day", "week", "month", "year".
            include_domains: Optional domain whitelist (used for market overview).

        Returns:
            MarketNewsResult with structured articles and metadata.
        """
        if not self._enabled or not self._client:
            logger.debug("Tavily search skipped -- service disabled")
            return MarketNewsResult(
                query=query,
                symbol=symbol,
                articles=[],
                combined_text="News search unavailable -- TAVILY_API_KEY not configured.",
                article_count=0,
                search_topic=topic,
            )

        try:
            # Build search params with Tavily best practices
            search_params: dict = {
                "query": query[:400],  # Best practice: under 400 chars
                "search_depth": "advanced",  # Highest relevance
                "max_results": min(max_results, 20),
                "include_answer": "advanced",  # Detailed LLM summary (not just True)
                "include_raw_content": False,
                "topic": topic,
                "time_range": time_range,
                "chunks_per_source": 3,  # More content snippets per source
                "exclude_domains": EXCLUDE_DOMAINS,  # Block garbage sites
            }

            # Only use include_domains for broad market searches
            if include_domains:
                search_params["include_domains"] = include_domains

            if self._is_sync:
                response = await asyncio.to_thread(
                    self._client.search, **search_params
                )
            else:
                response = await self._client.search(**search_params)  # type: ignore[misc]

            articles = []
            raw_results: list = response.get("results", [])  # type: ignore[union-attr]
            for result in raw_results:
                score = result.get("score", 0.0)
                articles.append(
                    NewsArticle(
                        title=result.get("title", ""),
                        url=result.get("url", ""),
                        content=result.get("content", "")[:500],
                        score=score,
                        published_date=result.get("published_date"),
                        raw_content=None,
                    )
                )

            tavily_answer = response.get("answer")  # type: ignore[union-attr]
            combined = self._build_combined_text(articles, tavily_answer)

            logger.info(
                "Tavily [%s/%s] '%s': %d articles (scores: %s), answer=%s",
                topic,
                time_range,
                symbol,
                len(articles),
                [f"{a.score:.2f}" for a in articles[:5]],
                "yes" if tavily_answer else "no",
            )

            return MarketNewsResult(
                query=query,
                symbol=symbol,
                articles=articles,
                combined_text=combined,
                article_count=len(articles),
                tavily_answer=tavily_answer,
                search_topic=topic,
            )

        except Exception as e:
            logger.error("Tavily search failed for '%s': %s", query, e)
            return MarketNewsResult(
                query=query,
                symbol=symbol,
                articles=[],
                combined_text=f"News search failed: {str(e)[:100]}",
                article_count=0,
                search_topic=topic,
            )

    def _filter_relevant_articles(
        self,
        articles: list[NewsArticle],
        symbol: str,
        company: str,
    ) -> list[NewsArticle]:
        """Post-process articles to remove irrelevant results.

        Tavily best practice: use score + keyword filtering.
        Two-pass filter:
        1. Score threshold: drop articles below MIN_RELEVANCE_SCORE
        2. Keyword match: check title+content for company/symbol mentions

        If both passes would eliminate ALL articles, relax to score-only filter
        to avoid returning empty results.

        Args:
            articles: Raw articles from Tavily search.
            symbol: Stock symbol (e.g., "RELIANCE").
            company: Company name (e.g., "Reliance Industries").

        Returns:
            Filtered list of relevant articles.
        """
        if not articles:
            return articles

        # Build keyword set for relevance matching
        # For "Reliance Industries" -> keywords: ["reliance"], phrases: ["reliance industries"]
        # For symbol "YESBANK" -> keywords: ["yesbank"], phrases: ["yes bank"]
        keywords: set[str] = set()
        phrases: list[str] = []

        keywords.add(symbol.lower())
        # Add the full company name as a phrase match (handles "Yes Bank", etc.)
        phrases.append(company.lower())

        for word in company.lower().split():
            # Skip very short/common words that would match everything
            if len(word) >= 4 and word not in {
                "and", "the", "for", "ltd", "limited", "india", "stock",
                "bank", "power", "steel", "life", "general", "finance",
                "insurance", "corporation", "industries", "technologies",
                "telecom", "communications",
            }:
                keywords.add(word)

        # Also add some variations
        # e.g., for "TCS" also check "tata consultancy"
        # This is already handled by SYMBOL_TO_COMPANY having both

        # Pass 1: Score-based filter
        scored = [a for a in articles if a.score >= MIN_RELEVANCE_SCORE]
        if not scored:
            # All articles below threshold -- no relevant results found
            # Don't return garbage; the tavily_answer still has useful info
            logger.warning(
                "All %d articles below score threshold %.2f for %s (max=%.3f), "
                "returning empty -- tavily_answer may still be useful",
                len(articles),
                MIN_RELEVANCE_SCORE,
                symbol,
                max((a.score for a in articles), default=0),
            )
            return []

        # Pass 2: Keyword/phrase relevance filter
        relevant = []
        for article in scored:
            text = f"{article.title} {article.content}".lower()
            # Check if full company phrase OR any keyword appears
            phrase_match = any(p in text for p in phrases)
            keyword_match = any(kw in text for kw in keywords)
            if phrase_match or keyword_match:
                relevant.append(article)

        # If keyword filter removed everything, fall back to score-only
        if not relevant:
            logger.warning(
                "Keyword filter removed all articles for %s (keywords=%s), "
                "falling back to score-filtered results",
                symbol,
                keywords,
            )
            return scored

        return relevant

    @staticmethod
    def _build_combined_text(
        articles: list[NewsArticle],
        tavily_answer: Optional[str] = None,
    ) -> str:
        """Build combined text block from search results for AI consumption.

        Format optimized for LLM sentiment analysis:
        1. Tavily answer summary first (already LLM-generated -- very valuable)
        2. Numbered article headlines with content snippets
        3. Published dates for temporal context
        4. Capped at 3000 chars to stay within prompt limits.
        """
        parts = []

        if tavily_answer:
            parts.append(f"MARKET INTELLIGENCE SUMMARY:\n{tavily_answer}")
            parts.append("")

        for i, article in enumerate(articles, 1):
            date_str = ""
            if article.published_date:
                date_str = f" ({article.published_date})"
            parts.append(f"[{i}] {article.title}{date_str}")
            if article.content:
                parts.append(f"    {article.content[:300]}")
            parts.append("")

        return "\n".join(parts)[:3000]
