"""
Tavily News Service for Indian Stock Market
Uses Tavily Search API with search_depth="advanced" for best results.

Docs: https://docs.tavily.com/sdk/python/reference
"""

import logging
import asyncio
from dataclasses import dataclass, field
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class NewsArticle:
    title: str = ""
    url: str = ""
    content: str = ""
    score: float = 0.0
    published_date: Optional[str] = None
    source: str = ""


@dataclass
class NewsResult:
    symbol: str = ""
    query: str = ""
    articles: list[NewsArticle] = field(default_factory=list)
    article_count: int = 0
    sentiment: str = "NEUTRAL"
    sentiment_score: float = 0.0
    summary: str = ""
    key_drivers: list[str] = field(default_factory=list)
    risk_factors: list[str] = field(default_factory=list)
    answer: str = ""
    response_time: float = 0.0


# ── Keyword Sentiment Fallback ──

_BULL = {"growth", "surge", "rally", "gain", "profit", "upgrade", "positive",
         "strong", "outperform", "beat", "recovery", "breakout", "record",
         "buy", "optimistic", "dividend", "expansion", "target raised"}

_BEAR = {"decline", "fall", "loss", "downgrade", "negative", "weak",
         "crash", "sell", "concern", "risk", "pressure", "debt", "slump",
         "correction", "plunge", "underperform", "target cut", "headwinds"}


def _keyword_sentiment(text: str) -> dict:
    words = set(text.lower().split())
    bull = len(words & _BULL)
    bear = len(words & _BEAR)
    if bull > bear:
        return {"sentiment": "POSITIVE", "sentiment_score": min((bull - bear) * 15, 80)}
    elif bear > bull:
        return {"sentiment": "NEGATIVE", "sentiment_score": max(-(bear - bull) * 15, -80)}
    return {"sentiment": "NEUTRAL", "sentiment_score": 0.0}


# ── Gemini Sentiment (Optional) ──

async def _gemini_analyze(text: str) -> Optional[dict]:
    try:
        if not settings.GEMINI_API_KEY:
            return None
        from google import genai
        from google.genai import types
        import json

        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        prompt = (
            "Analyze this Indian stock news. Return ONLY JSON:\n"
            '{"sentiment":"POSITIVE/NEUTRAL/NEGATIVE",'
            '"sentiment_score":<-100 to 100>,'
            '"summary":"2 sentences",'
            '"key_drivers":["driver1","driver2"],'
            '"risk_factors":["risk1","risk2"]}\n\n'
            f"{text[:3000]}"
        )
        response = await asyncio.to_thread(
            client.models.generate_content,
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(temperature=0.1, max_output_tokens=1024),
        )
        raw = response.text or ""
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(raw[start:end])
    except Exception as e:
        logger.warning("Gemini sentiment skipped: %s", e)
    return None


# ── NSE Symbol → Company Name (static map for top stocks) ──
# The instruments DB stores name="TCS" not "Tata Consultancy Services",
# so we need this map for building good search queries.

_NSE_NAMES = {
    "TCS": "Tata Consultancy Services", "INFY": "Infosys", "RELIANCE": "Reliance Industries",
    "HDFCBANK": "HDFC Bank", "ICICIBANK": "ICICI Bank", "SBIN": "State Bank of India",
    "BHARTIARTL": "Bharti Airtel", "ITC": "ITC", "HINDUNILVR": "Hindustan Unilever",
    "KOTAKBANK": "Kotak Mahindra Bank", "LT": "Larsen Toubro", "HCLTECH": "HCL Technologies",
    "AXISBANK": "Axis Bank", "WIPRO": "Wipro", "BAJFINANCE": "Bajaj Finance",
    "MARUTI": "Maruti Suzuki", "TATAMOTORS": "Tata Motors", "SUNPHARMA": "Sun Pharma",
    "TITAN": "Titan Company", "NTPC": "NTPC", "POWERGRID": "Power Grid",
    "ONGC": "ONGC", "TATASTEEL": "Tata Steel", "TECHM": "Tech Mahindra",
    "ADANIENT": "Adani Enterprises", "ADANIPORTS": "Adani Ports", "ADANIPOWER": "Adani Power",
    "ADANIGREEN": "Adani Green Energy", "NESTLEIND": "Nestle India", "JSWSTEEL": "JSW Steel",
    "COALINDIA": "Coal India", "ULTRACEMCO": "UltraTech Cement",
    "BPCL": "Bharat Petroleum", "IOC": "Indian Oil", "GAIL": "GAIL India",
    "DRREDDY": "Dr Reddys", "CIPLA": "Cipla", "DIVISLAB": "Divi's Labs",
    "BAJAJ-AUTO": "Bajaj Auto", "HEROMOTOCO": "Hero MotoCorp", "EICHERMOT": "Eicher Motors",
    "M&M": "Mahindra Mahindra", "ASIANPAINT": "Asian Paints", "BRITANNIA": "Britannia",
    "HDFCLIFE": "HDFC Life", "SBILIFE": "SBI Life", "INDUSINDBK": "IndusInd Bank",
    "IDEA": "Vodafone Idea", "RPOWER": "Reliance Power", "YESBANK": "Yes Bank",
    "PNB": "Punjab National Bank", "BANKBARODA": "Bank of Baroda",
    "IRCTC": "IRCTC", "IRFC": "IRFC", "ZOMATO": "Zomato", "PAYTM": "Paytm",
    "SUZLON": "Suzlon Energy", "TATAPOWER": "Tata Power", "NHPC": "NHPC",
    "HAL": "Hindustan Aeronautics", "BEL": "Bharat Electronics", "BHEL": "BHEL",
    "SAIL": "SAIL", "VEDL": "Vedanta", "HINDALCO": "Hindalco",
    "TATAELXSI": "Tata Elxsi", "PERSISTENT": "Persistent Systems", "COFORGE": "Coforge",
    "LTIM": "LTIMindtree", "JIOFIN": "Jio Financial", "JKTYRE": "JK Tyre",
    "BAJAJFINSV": "Bajaj Finserv", "BIOCON": "Biocon",
    "APOLLOHOSP": "Apollo Hospitals", "DLF": "DLF", "ZEEL": "Zee Entertainment",
    "TRENT": "Trent", "DMART": "DMart Avenue Supermarts",
}


def _build_query(user_input: str) -> str:
    """Build a precise Tavily search query for Indian stock news.

    The key insight: Tavily needs descriptive company names, not just symbols.
    'TCS share price' → bad results (TCS is ambiguous)
    'Tata Consultancy Services TCS share price news' → great results
    """
    clean = user_input.strip()

    # Multi-word input (e.g. "tata power") — already descriptive
    if " " in clean:
        return f"{clean} share price news India"

    # Single word — resolve symbol to company name
    symbol = clean.upper().replace("-EQ", "").replace("-BE", "")

    # Use static map (reliable, covers top 100+ stocks)
    company = _NSE_NAMES.get(symbol)
    if company:
        return f"{company} {symbol} share price news"

    # Unknown symbol — use as-is with context
    return f"{symbol} share price news India NSE"


def _extract_domain(url: str) -> str:
    """Extract clean domain name from URL."""
    try:
        if url:
            return url.split("/")[2].replace("www.", "")
    except Exception:
        pass
    return ""


class TavilyNewsService:

    def __init__(self):
        self._client = None
        self._enabled = bool(settings.TAVILY_API_KEY)

        if self._enabled:
            try:
                from tavily import TavilyClient
                self._client = TavilyClient(api_key=settings.TAVILY_API_KEY)
                logger.info("TavilyNewsService ready")
            except ImportError:
                logger.error("tavily-python not installed: pip install tavily-python")
                self._enabled = False
            except Exception as e:
                logger.error("Tavily init failed: %s", e)
                self._enabled = False

    @property
    def is_enabled(self) -> bool:
        return self._enabled

    async def search_news(
        self,
        query: str,
        max_articles: int = 8,
        time_range: str = "week",
        use_gemini: bool = True,
    ) -> NewsResult:
        if not self._enabled or not self._client:
            return self._empty(query, "Tavily not configured")

        try:
            search_query = _build_query(query)
            logger.info("Tavily search: '%s' (input: '%s')", search_query, query)

            # Tavily Search with advanced depth for better relevance
            # Docs: https://docs.tavily.com/sdk/python/reference
            response = await asyncio.to_thread(
                self._client.search,
                query=search_query,
                search_depth="advanced",      # Better relevance (uses 2 credits)
                topic="news",                 # News-specific results
                time_range=time_range,        # "day" / "week" / "month"
                max_results=max_articles,
                include_answer="advanced",    # AI-generated summary
            )

            num_results = len(response.get("results", []))
            logger.info("Tavily got %d results", num_results)

            # Build article list
            articles = []
            for r in response.get("results", []):
                articles.append(NewsArticle(
                    title=r.get("title", ""),
                    url=r.get("url", ""),
                    content=r.get("content", "")[:500],
                    score=float(r.get("score", 0)),
                    published_date=r.get("published_date"),
                    source=_extract_domain(r.get("url", "")),
                ))

            answer = response.get("answer", "")
            resp_time = response.get("response_time", 0)

            # Sentiment analysis: Gemini → keyword fallback
            combined = "\n".join(f"{a.title}. {a.content}" for a in articles)
            analysis = None
            if use_gemini and combined:
                analysis = await _gemini_analyze(combined[:4000])

            if not analysis:
                analysis = _keyword_sentiment(combined or answer)

            summary = analysis.get("summary", "") or answer[:500] or f"{len(articles)} articles found."

            result = NewsResult(
                symbol=query.split()[0].upper(),
                query=query,
                articles=articles,
                article_count=len(articles),
                sentiment=analysis.get("sentiment", "NEUTRAL"),
                sentiment_score=float(analysis.get("sentiment_score", 0)),
                summary=summary,
                key_drivers=analysis.get("key_drivers", []),
                risk_factors=analysis.get("risk_factors", []),
                answer=answer,
                response_time=resp_time,
            )

            logger.info("Tavily done [%s]: %d articles, %s (%.0f)",
                        query, len(articles), result.sentiment, result.sentiment_score)
            return result

        except Exception as e:
            logger.error("Tavily failed [%s]: %s", query, e)
            return self._empty(query, f"Search failed: {str(e)[:100]}")

    async def extract_article(self, url: str) -> Optional[str]:
        if not self._client:
            return None
        try:
            resp = await asyncio.to_thread(self._client.extract, urls=[url])
            results = resp.get("results", [])
            return results[0].get("raw_content", "") if results else None
        except Exception as e:
            logger.error("Extract failed: %s", e)
            return None

    def _empty(self, query: str, msg: str) -> NewsResult:
        return NewsResult(
            symbol=query.split()[0].upper() if query else "",
            query=query, summary=msg,
        )


tavily_news = TavilyNewsService()
