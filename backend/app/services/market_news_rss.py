"""
Module: app/services/market_news_rss.py
Purpose: Fast, lightweight market news fetcher via free RSS feeds.

Sources (all free, no API key):
    1. Economic Times Markets RSS — fastest, freshest Indian market news
    2. Moneycontrol Market Reports RSS — broad market coverage
    3. LiveMint Markets RSS — business + market news

Architecture:
    - Fetches all 3 RSS feeds in parallel (httpx async)
    - Parses XML directly (no lxml dependency — uses stdlib xml.etree)
    - Deduplicates by title similarity
    - 90-second in-memory cache
    - Returns within ~1-2 seconds
"""

import asyncio
import logging
import re
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ── RSS Feed Sources ──
RSS_FEEDS = [
    {
        "url": "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
        "source": "Economic Times",
        "priority": 1,
    },
    {
        "url": "https://www.moneycontrol.com/rss/marketreports.xml",
        "source": "Moneycontrol",
        "priority": 2,
    },
    {
        "url": "https://www.livemint.com/rss/markets",
        "source": "LiveMint",
        "priority": 3,
    },
]

FETCH_TIMEOUT = 8  # seconds per feed
CACHE_TTL = 90     # seconds


@dataclass
class NewsHeadline:
    """A single news headline."""
    title: str
    description: str = ""
    url: str = ""
    source: str = ""
    published: str = ""
    published_ts: float = 0.0  # unix timestamp for sorting
    sentiment: str = "NEUTRAL"
    image_url: str = ""


# ── Simple sentiment keywords ──
_BULLISH = {"surge", "soar", "rally", "jump", "gain", "rise", "bull", "boom",
            "record", "high", "upgrade", "buy", "outperform", "positive", "strong"}
_BEARISH = {"crash", "fall", "drop", "sink", "plunge", "slump", "bear", "tank",
            "decline", "loss", "weak", "cut", "downgrade", "sell", "negative"}


def _quick_sentiment(text: str) -> str:
    """Fast keyword-based sentiment from title text."""
    words = set(text.lower().split())
    bull = len(words & _BULLISH)
    bear = len(words & _BEARISH)
    if bull > bear:
        return "POSITIVE"
    if bear > bull:
        return "NEGATIVE"
    return "NEUTRAL"


def _parse_pub_date(date_str: str) -> float:
    """Parse RSS pubDate to unix timestamp."""
    if not date_str:
        return 0.0
    try:
        dt = parsedate_to_datetime(date_str)
        return dt.timestamp()
    except Exception:
        return 0.0


def _time_ago(ts: float) -> str:
    """Convert timestamp to human-readable 'X ago' string."""
    if ts <= 0:
        return ""
    diff = time.time() - ts
    if diff < 60:
        return "just now"
    if diff < 3600:
        return f"{int(diff / 60)}m ago"
    if diff < 86400:
        return f"{int(diff / 3600)}h ago"
    return f"{int(diff / 86400)}d ago"


def _extract_image_url(item: ET.Element) -> str:
    """Extract image URL from RSS item (enclosure tag)."""
    enc = item.find("enclosure")
    if enc is not None:
        return enc.get("url", "")
    # Try media:content
    for child in item:
        if "content" in child.tag and child.get("url"):
            return child.get("url", "")
    return ""


def _clean_cdata(text: str) -> str:
    """Strip CDATA wrappers and HTML tags."""
    if not text:
        return ""
    text = text.strip()
    text = re.sub(r"<!\[CDATA\[(.*?)\]\]>", r"\1", text, flags=re.DOTALL)
    text = re.sub(r"<[^>]+>", "", text)
    return text.strip()


async def _fetch_single_feed(client: httpx.AsyncClient, feed: dict) -> list[NewsHeadline]:
    """Fetch and parse a single RSS feed."""
    headlines: list[NewsHeadline] = []
    try:
        resp = await client.get(feed["url"], timeout=FETCH_TIMEOUT)
        resp.raise_for_status()

        root = ET.fromstring(resp.text)
        channel = root.find("channel")
        if channel is None:
            return headlines

        for item in channel.findall("item"):
            title_el = item.find("title")
            title = _clean_cdata(title_el.text or "") if title_el is not None else ""
            if not title:
                continue

            desc_el = item.find("description")
            description = _clean_cdata(desc_el.text or "") if desc_el is not None else ""

            link_el = item.find("link")
            url = (link_el.text or "").strip() if link_el is not None else ""

            pub_el = item.find("pubDate")
            pub_date = (pub_el.text or "").strip() if pub_el is not None else ""
            pub_ts = _parse_pub_date(pub_date)

            image_url = _extract_image_url(item)

            headlines.append(NewsHeadline(
                title=title,
                description=description[:200] if description else "",
                url=url,
                source=feed["source"],
                published=_time_ago(pub_ts),
                published_ts=pub_ts,
                sentiment=_quick_sentiment(title),
                image_url=image_url,
            ))

    except httpx.TimeoutException:
        logger.warning("RSS feed timeout: %s", feed["source"])
    except Exception as exc:
        logger.warning("RSS feed error (%s): %s", feed["source"], exc)

    return headlines


def _deduplicate(headlines: list[NewsHeadline]) -> list[NewsHeadline]:
    """Remove duplicate headlines by title similarity."""
    seen: set[str] = set()
    unique: list[NewsHeadline] = []
    for h in headlines:
        # Normalize title for dedup
        key = re.sub(r"[^a-z0-9]", "", h.title.lower())[:60]
        if key not in seen:
            seen.add(key)
            unique.append(h)
    return unique


# ── In-memory cache ──
_cache: Optional[tuple[float, list[dict]]] = None


async def fetch_market_headlines(max_articles: int = 15) -> list[dict]:
    """Fetch fresh market news from multiple RSS feeds.

    Returns up to max_articles headlines, sorted by recency.
    Results are cached for 90 seconds.
    """
    global _cache

    # Check cache
    if _cache is not None:
        cache_time, cached_data = _cache
        if time.time() - cache_time < CACHE_TTL:
            return cached_data[:max_articles]

    # Fetch all feeds in parallel
    async with httpx.AsyncClient(
        headers={"User-Agent": "AlgoTradePro/1.0"},
        follow_redirects=True,
    ) as client:
        tasks = [_fetch_single_feed(client, feed) for feed in RSS_FEEDS]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    # Combine all headlines
    all_headlines: list[NewsHeadline] = []
    for result in results:
        if isinstance(result, list):
            all_headlines.extend(result)

    # Deduplicate and sort by recency
    all_headlines = _deduplicate(all_headlines)
    all_headlines.sort(key=lambda h: h.published_ts, reverse=True)

    # Convert to dicts
    output = [
        {
            "title": h.title,
            "description": h.description,
            "url": h.url,
            "source": h.source,
            "published": h.published,
            "sentiment": h.sentiment,
            "image_url": h.image_url,
        }
        for h in all_headlines[:max_articles]
    ]

    # Update cache
    _cache = (time.time(), output)

    logger.info("Fetched %d market headlines from %d sources", len(output), len(RSS_FEEDS))
    return output
