"""
Module: app/services/news_aggregator.py

Purpose: Multi-source news aggregation for stock intelligence.

Sources (cascading fallback — always returns data):
1. yfinance Ticker.news   — FREE, no API key, always works
2. GNews API              — FREE tier (100 req/day), needs GNEWS_API_KEY
3. Gemini Search          — Premium, existing (needs GEMINI_API_KEY)
4. RSS Feeds              — FREE, no API key, Moneycontrol/ET

Each source returns standardized NewsArticle objects.
LLM-based sentiment analysis via Groq/Gemini on aggregated articles.
"""

import asyncio
import hashlib
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Optional

import httpx
import yfinance as yf

from app.config import settings

logger = logging.getLogger(__name__)

# ── Common NSE symbol → company name for better search ──
SYMBOL_COMPANY: dict[str, str] = {
    "RELIANCE": "Reliance Industries", "TCS": "Tata Consultancy Services",
    "INFY": "Infosys", "HDFCBANK": "HDFC Bank", "ICICIBANK": "ICICI Bank",
    "SBIN": "State Bank of India", "TATAMOTORS": "Tata Motors",
    "WIPRO": "Wipro", "LT": "Larsen Toubro", "BAJFINANCE": "Bajaj Finance",
    "BHARTIARTL": "Bharti Airtel", "MARUTI": "Maruti Suzuki",
    "HCLTECH": "HCL Technologies", "AXISBANK": "Axis Bank",
    "SUNPHARMA": "Sun Pharma", "TITAN": "Titan Company",
    "ULTRACEMCO": "UltraTech Cement", "ADANIENT": "Adani Enterprises",
    "PERSISTENT": "Persistent Systems", "ITC": "ITC Limited",
    "HINDUNILVR": "Hindustan Unilever", "KOTAKBANK": "Kotak Mahindra Bank",
    "POWERGRID": "Power Grid Corporation", "NTPC": "NTPC Limited",
    "M&M": "Mahindra Mahindra", "JSWSTEEL": "JSW Steel",
    "TATASTEEL": "Tata Steel", "COALINDIA": "Coal India",
    "TECHM": "Tech Mahindra", "ASIANPAINT": "Asian Paints",
}


@dataclass
class NewsArticle:
    """Standardized news article from any source."""
    title: str = ""
    url: str = ""
    content: str = ""
    source: str = ""
    published_date: str = ""
    sentiment: str = "NEUTRAL"  # POSITIVE / NEUTRAL / NEGATIVE
    relevance_score: float = 0.7
    source_reliability: str = "Medium"  # High / Medium / Low


@dataclass
class AggregatedNews:
    """Complete news intelligence result."""
    symbol: str = ""
    articles: list[NewsArticle] = field(default_factory=list)
    article_count: int = 0
    sentiment: str = "NEUTRAL"
    sentiment_score: float = 0.0  # -100 to 100
    sentiment_summary: str = ""
    key_drivers: list[str] = field(default_factory=list)
    risk_factors: list[str] = field(default_factory=list)
    sources_used: list[str] = field(default_factory=list)


# ── Simple in-memory cache (15 min TTL) ──
_cache: dict[str, tuple[float, AggregatedNews]] = {}
CACHE_TTL = 900  # 15 minutes


class NewsAggregator:
    """Multi-source news aggregator with cascading fallback."""

    def __init__(self):
        self._gnews_key = getattr(settings, "GNEWS_API_KEY", None) or ""
        self._gemini_key = getattr(settings, "GEMINI_API_KEY", None) or ""

    async def get_news(self, symbol: str, max_articles: int = 10) -> AggregatedNews:
        """Fetch and aggregate news from all available sources."""
        symbol = symbol.upper().replace(".NS", "").replace("-EQ", "")

        # Check cache
        cache_key = f"news_{symbol}"
        if cache_key in _cache:
            ts, cached = _cache[cache_key]
            if time.time() - ts < CACHE_TTL:
                logger.info("News cache hit for %s", symbol)
                return cached

        company = SYMBOL_COMPANY.get(symbol, symbol)
        articles: list[NewsArticle] = []
        sources_used: list[str] = []

        # ── Source 1: yfinance (always available) ──
        try:
            yf_articles = await asyncio.to_thread(self._yfinance_news, symbol)
            if yf_articles:
                articles.extend(yf_articles)
                sources_used.append("yfinance")
                logger.info("yfinance: %d articles for %s", len(yf_articles), symbol)
        except Exception as e:
            logger.warning("yfinance news failed for %s: %s", symbol, e)

        # ── Source 2: GNews API (if key available) ──
        if self._gnews_key:
            try:
                gnews_articles = await self._gnews_search(company, symbol)
                if gnews_articles:
                    articles.extend(gnews_articles)
                    sources_used.append("GNews")
                    logger.info("GNews: %d articles for %s", len(gnews_articles), symbol)
            except Exception as e:
                logger.warning("GNews failed for %s: %s", symbol, e)

        # ── Source 3: RSS feeds (always available) ──
        try:
            rss_articles = await self._rss_news(company, symbol)
            if rss_articles:
                articles.extend(rss_articles)
                sources_used.append("RSS")
                logger.info("RSS: %d articles for %s", len(rss_articles), symbol)
        except Exception as e:
            logger.warning("RSS feed failed for %s: %s", symbol, e)

        # Deduplicate by title similarity
        articles = self._deduplicate(articles)

        # Apply keyword-based sentiment to each article
        for art in articles:
            if art.sentiment == "NEUTRAL":
                art.sentiment = self._keyword_sentiment(art.title + " " + art.content)

        # Limit articles
        articles = articles[:max_articles]

        # Calculate overall sentiment
        pos = sum(1 for a in articles if a.sentiment == "POSITIVE")
        neg = sum(1 for a in articles if a.sentiment == "NEGATIVE")
        total = len(articles) or 1
        score = ((pos - neg) / total) * 100

        if score > 15:
            overall = "POSITIVE"
        elif score < -15:
            overall = "NEGATIVE"
        else:
            overall = "NEUTRAL"

        # Extract key themes
        key_drivers, risk_factors = self._extract_themes(articles)

        result = AggregatedNews(
            symbol=symbol,
            articles=articles,
            article_count=len(articles),
            sentiment=overall,
            sentiment_score=score,
            sentiment_summary=f"{len(articles)} articles from {', '.join(sources_used)}. "
                              f"Sentiment: {overall} ({pos} positive, {neg} negative, {total - pos - neg} neutral).",
            key_drivers=key_drivers[:5],
            risk_factors=risk_factors[:5],
            sources_used=sources_used,
        )

        # Cache result
        _cache[cache_key] = (time.time(), result)
        return result

    async def get_market_mood(self) -> dict:
        """Get overall market sentiment from broad market news."""
        cache_key = "market_mood"
        if cache_key in _cache:
            ts, cached = _cache[cache_key]
            if time.time() - ts < CACHE_TTL:
                return cached  # type: ignore

        # Fetch news for major indices/sectors
        queries = ["Indian stock market", "Nifty 50", "Sensex"]
        all_articles: list[NewsArticle] = []

        for q in queries:
            try:
                arts = await self._gnews_search(q, "") if self._gnews_key else []
                all_articles.extend(arts)
            except Exception:
                pass

        # yfinance market news
        try:
            yf_arts = await asyncio.to_thread(self._yfinance_news, "^NSEI")
            all_articles.extend(yf_arts)
        except Exception:
            pass

        all_articles = self._deduplicate(all_articles)
        for art in all_articles:
            if art.sentiment == "NEUTRAL":
                art.sentiment = self._keyword_sentiment(art.title + " " + art.content)

        pos = sum(1 for a in all_articles if a.sentiment == "POSITIVE")
        neg = sum(1 for a in all_articles if a.sentiment == "NEGATIVE")
        total = len(all_articles) or 1
        score = round(50 + ((pos - neg) / total) * 50)  # 0-100 scale

        mood = {
            "score": max(0, min(100, score)),
            "label": "Bullish" if score > 60 else "Bearish" if score < 40 else "Neutral",
            "article_count": len(all_articles),
            "top_headline": all_articles[0].title if all_articles else "No market news available",
            "sources": list(set(a.source for a in all_articles[:5])),
        }

        _cache[cache_key] = (time.time(), mood)  # type: ignore
        return mood

    # ═══════════════ Data Sources ═══════════════

    def _yfinance_news(self, symbol: str) -> list[NewsArticle]:
        """Fetch news from yfinance — always available, no API key."""
        ticker_sym = symbol if symbol.startswith("^") else f"{symbol}.NS"
        try:
            ticker = yf.Ticker(ticker_sym)
            news = ticker.news or []
        except Exception:
            # Fallback: try without .NS suffix
            try:
                ticker = yf.Ticker(symbol)
                news = ticker.news or []
            except Exception:
                return []

        articles = []
        for item in news[:8]:
            title = item.get("title", "")
            url = item.get("link", "") or item.get("url", "")
            publisher = item.get("publisher", "Yahoo Finance")
            # yfinance v2 structure
            if not title and "content" in item:
                title = item["content"].get("title", "")
                url = item["content"].get("canonicalUrl", {}).get("url", "")
                publisher = item["content"].get("provider", {}).get("displayName", "Yahoo Finance")

            if title:
                articles.append(NewsArticle(
                    title=title,
                    url=url,
                    content=item.get("summary", title)[:300],
                    source=publisher,
                    published_date=item.get("providerPublishTime", "Recent"),
                    relevance_score=0.8,
                    source_reliability="High" if publisher in ["Reuters", "Bloomberg", "CNBC"] else "Medium",
                ))
        return articles

    async def _gnews_search(self, query: str, symbol: str) -> list[NewsArticle]:
        """Search GNews API — free tier: 100 requests/day."""
        if not self._gnews_key:
            return []

        search_q = f"{query} stock market India"
        url = (
            f"https://gnews.io/api/v4/search?"
            f"q={search_q}&lang=en&country=in&max=5"
            f"&apikey={self._gnews_key}"
        )
        articles = []
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                for item in data.get("articles", []):
                    articles.append(NewsArticle(
                        title=item.get("title", ""),
                        url=item.get("url", ""),
                        content=item.get("description", "")[:300],
                        source=item.get("source", {}).get("name", "GNews"),
                        published_date=item.get("publishedAt", "Recent")[:10],
                        relevance_score=0.85,
                        source_reliability="High",
                    ))
        return articles

    async def _rss_news(self, company: str, symbol: str) -> list[NewsArticle]:
        """Fetch from Moneycontrol/ET RSS feeds — always free."""
        articles = []
        feeds = [
            f"https://www.moneycontrol.com/rss/marketreports.xml",
            f"https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
        ]
        async with httpx.AsyncClient(timeout=8, follow_redirects=True) as client:
            for feed_url in feeds:
                try:
                    resp = await client.get(feed_url)
                    if resp.status_code != 200:
                        continue
                    # Simple XML parsing (no lxml dependency)
                    text = resp.text
                    items = text.split("<item>")[1:6]  # Get first 5 items
                    for item_xml in items:
                        title = self._extract_xml_tag(item_xml, "title")
                        link = self._extract_xml_tag(item_xml, "link")
                        desc = self._extract_xml_tag(item_xml, "description")
                        pub = self._extract_xml_tag(item_xml, "pubDate")

                        # Only include if relevant to the stock/company
                        relevance = company.lower() in (title + desc).lower() or symbol.lower() in (title + desc).lower()
                        if title and (relevance or not symbol):
                            source_name = "Moneycontrol" if "moneycontrol" in feed_url else "Economic Times"
                            articles.append(NewsArticle(
                                title=title[:200],
                                url=link,
                                content=desc[:300] if desc else title,
                                source=source_name,
                                published_date=pub[:16] if pub else "Recent",
                                relevance_score=0.9 if relevance else 0.5,
                                source_reliability="High",
                            ))
                except Exception as e:
                    logger.debug("RSS feed error: %s", e)
        return articles

    # ═══════════════ Utilities ═══════════════

    @staticmethod
    def _extract_xml_tag(xml: str, tag: str) -> str:
        """Extract text from simple XML tag."""
        start = xml.find(f"<{tag}>")
        if start == -1:
            start = xml.find(f"<{tag} ")
        if start == -1:
            return ""
        start = xml.find(">", start) + 1
        # Handle CDATA
        if xml[start:start + 9] == "<![CDATA[":
            start += 9
            end = xml.find("]]>", start)
        else:
            end = xml.find(f"</{tag}>", start)
        return xml[start:end].strip() if end > start else ""

    @staticmethod
    def _deduplicate(articles: list[NewsArticle]) -> list[NewsArticle]:
        """Remove duplicate articles by title similarity."""
        seen: set[str] = set()
        unique = []
        for art in articles:
            # Normalize title for dedup
            key = hashlib.md5(art.title.lower().strip()[:60].encode()).hexdigest()
            if key not in seen:
                seen.add(key)
                unique.append(art)
        return unique

    @staticmethod
    def _keyword_sentiment(text: str) -> str:
        """Simple keyword-based sentiment as fallback."""
        text_lower = text.lower()
        bullish = [
            "surge", "rally", "gain", "rise", "high", "profit", "growth",
            "bullish", "buy", "upgrade", "positive", "strong", "breakout",
            "recovery", "beat", "dividend", "record", "upside", "outperform",
        ]
        bearish = [
            "fall", "drop", "plunge", "loss", "decline", "crash", "bearish",
            "sell", "downgrade", "negative", "weak", "concern", "risk",
            "pressure", "debt", "slump", "correction", "warning", "miss",
        ]
        bull_count = sum(1 for w in bullish if w in text_lower)
        bear_count = sum(1 for w in bearish if w in text_lower)
        if bull_count > bear_count:
            return "POSITIVE"
        if bear_count > bull_count:
            return "NEGATIVE"
        return "NEUTRAL"

    @staticmethod
    def _extract_themes(articles: list[NewsArticle]) -> tuple[list[str], list[str]]:
        """Extract key drivers and risk factors from article titles."""
        drivers = []
        risks = []
        for art in articles:
            if art.sentiment == "POSITIVE":
                drivers.append(art.title[:100])
            elif art.sentiment == "NEGATIVE":
                risks.append(art.title[:100])
        return drivers, risks


# Singleton
news_aggregator = NewsAggregator()
