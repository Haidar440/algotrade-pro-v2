"""
Module: app/services/gemini_news.py

Purpose: Real-time stock news intelligence powered by Gemini + Google Search grounding.

Replaces Tavily search with Gemini's built-in Google Search tool, which:
- Uses Google Search to find the latest news about a stock
- Synthesizes results into an intelligent analysis
- Returns source citations (URLs + titles) for verification
- Provides sentiment analysis + key drivers + risk factors in ONE call
- No separate search API needed -- Gemini handles everything

Uses google.genai SDK directly (not LangChain) for grounding support.
API key comes from settings.GEMINI_API_KEY -- never hardcoded.
"""

import json
import logging
import time
from dataclasses import dataclass, field
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)


# ---- Circuit Breaker (shared with ai_engine.py) ----
# Import from ai_engine to share the same circuit breaker state

from app.services.ai_engine import _is_gemini_available, _trip_gemini_circuit


# ---- Data Classes ----


@dataclass
class NewsSource:
    """A cited source from Gemini's grounded search."""

    title: str = ""
    url: str = ""
    domain: str = ""


@dataclass
class GeminiNewsArticle:
    """A news item extracted from Gemini's grounded response."""

    title: str = ""
    url: str = ""
    content: str = ""
    score: float = 0.8  # Gemini grounded results are high relevance
    published_date: Optional[str] = None
    source: str = ""


@dataclass
class GeminiNewsResult:
    """Complete news intelligence result from Gemini + Google Search."""

    symbol: str = ""
    query: str = ""
    articles: list[GeminiNewsArticle] = field(default_factory=list)
    article_count: int = 0
    sentiment: str = "NEUTRAL"  # POSITIVE / NEUTRAL / NEGATIVE
    sentiment_score: float = 0.0  # -100 to 100
    summary: str = ""
    key_drivers: list[str] = field(default_factory=list)
    risk_factors: list[str] = field(default_factory=list)
    sources: list[NewsSource] = field(default_factory=list)
    combined_text: str = ""
    raw_response: str = ""


# Common NSE symbol -> full company name mapping
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
    "TRENT": "Trent Limited Westside Zudio",
}


class GeminiNewsService:
    """Real-time stock news intelligence using Gemini + Google Search grounding.

    Instead of a separate search API (Tavily), this uses Gemini's built-in
    Google Search tool to find, analyze, and summarize stock news in one call.

    Benefits over Tavily:
    - Google Search has far better coverage than Tavily
    - Gemini analyzes and synthesizes results intelligently
    - Sentiment + key drivers + risk factors in ONE API call
    - Source citations with URLs for verification
    - No separate API key needed (uses same GEMINI_API_KEY)

    Example:
        service = GeminiNewsService()
        result = await service.get_stock_news("RELIANCE")
        print(result.sentiment, result.summary)
        for article in result.articles:
            print(article.title, article.url)
    """

    def __init__(self) -> None:
        """Initialize Gemini client with Google Search grounding tool.

        Uses google.genai SDK directly for grounding support.
        """
        self._client: object = None  # google.genai.Client (typed as object for Pylance)
        self._enabled = bool(settings.GEMINI_API_KEY)

        if self._enabled:
            try:
                from google import genai

                self._client = genai.Client(api_key=settings.GEMINI_API_KEY)
                logger.info("GeminiNewsService initialized (google.genai + GoogleSearch)")
            except Exception as e:
                logger.error("GeminiNewsService init failed: %s", e)
                self._enabled = False
        else:
            logger.info("GeminiNewsService disabled -- GEMINI_API_KEY not set")

    @property
    def is_enabled(self) -> bool:
        """Check if Gemini news service is available."""
        return self._enabled

    async def get_stock_news(
        self,
        symbol: str,
        max_articles: int = 5,
    ) -> GeminiNewsResult:
        """Get latest news and analysis for a stock using Gemini + Google Search.

        One API call does everything:
        1. Searches Google for latest news about the stock
        2. Analyzes sentiment (POSITIVE/NEUTRAL/NEGATIVE)
        3. Extracts key drivers and risk factors
        4. Provides source citations

        Args:
            symbol: Stock symbol (e.g., "RELIANCE", "IDEA", "TCS").
            max_articles: Maximum news items to extract.

        Returns:
            GeminiNewsResult with articles, sentiment, and analysis.
        """
        clean_symbol = symbol.upper().strip()
        company = SYMBOL_TO_COMPANY.get(clean_symbol, clean_symbol)

        if not self._enabled or not self._client:
            return self._empty_result(clean_symbol, "Gemini service not available")

        if not _is_gemini_available():
            return self._empty_result(
                clean_symbol,
                "AI service temporarily unavailable (rate limited). Please try again in a few minutes.",
            )

        try:
            return await self._search_and_analyze(clean_symbol, company, max_articles)
        except Exception as e:
            error_str = str(e)
            if "RESOURCE_EXHAUSTED" in error_str or "429" in error_str:
                _trip_gemini_circuit()
            logger.error("Gemini news failed for %s: %s", clean_symbol, e)
            return self._empty_result(clean_symbol, f"News search failed: {str(e)[:100]}")

    async def get_market_overview(self) -> GeminiNewsResult:
        """Get overall Indian stock market news and analysis.

        Returns:
            GeminiNewsResult with market-wide sentiment and news.
        """
        if not self._enabled or not self._client:
            return self._empty_result("MARKET", "Gemini service not available")

        if not _is_gemini_available():
            return self._empty_result("MARKET", "AI service temporarily unavailable")

        try:
            prompt = self._build_market_prompt()
            return await self._execute_grounded_search("MARKET", "Indian Stock Market", prompt)
        except Exception as e:
            error_str = str(e)
            if "RESOURCE_EXHAUSTED" in error_str or "429" in error_str:
                _trip_gemini_circuit()
            logger.error("Gemini market overview failed: %s", e)
            return self._empty_result("MARKET", f"Market overview failed: {str(e)[:100]}")

    # ---- Private Methods ----

    async def _search_and_analyze(
        self,
        symbol: str,
        company: str,
        max_articles: int,
    ) -> GeminiNewsResult:
        """Execute Gemini grounded search for stock news.

        Args:
            symbol: Clean stock symbol.
            company: Full company name.
            max_articles: Max news items.

        Returns:
            Structured GeminiNewsResult.
        """
        prompt = self._build_stock_prompt(symbol, company, max_articles)
        return await self._execute_grounded_search(symbol, company, prompt)

    async def _execute_grounded_search(
        self,
        symbol: str,
        company: str,
        prompt: str,
    ) -> GeminiNewsResult:
        """Execute a Gemini API call with Google Search grounding.

        Args:
            symbol: Stock/topic identifier.
            company: Company name for logging.
            prompt: The full prompt to send.

        Returns:
            Parsed GeminiNewsResult.
        """
        from google.genai import types
        import asyncio

        grounding_tool = types.Tool(
            google_search=types.GoogleSearch()
        )

        config = types.GenerateContentConfig(
            tools=[grounding_tool],
            temperature=0.2,  # Low temp for factual accuracy
            max_output_tokens=2048,
        )

        # Use asyncio.to_thread since google.genai may not have native async
        try:
            response = await asyncio.to_thread(
                self._client.models.generate_content,  # type: ignore[union-attr]
                model="gemini-2.5-flash",
                contents=prompt,
                config=config,
            )
        except Exception as e:
            error_str = str(e)
            if "RESOURCE_EXHAUSTED" in error_str or "429" in error_str:
                _trip_gemini_circuit()
            raise

        # Extract text response
        raw_text = response.text or ""

        # Extract grounding sources (citations)
        sources = self._extract_sources(response)
        articles = self._extract_articles_from_sources(sources, raw_text)

        # Parse structured data from the response
        parsed = self._parse_structured_response(raw_text)

        # Clean up summary — strip any leading JSON key artifacts
        summary = parsed.get("summary", raw_text[:500])
        # Remove "summary": prefix if Gemini leaked it into the text
        for prefix in ['"summary": "', '"summary":"', '"summary" : "']:
            if summary.startswith(prefix):
                summary = summary[len(prefix):]
                if summary.endswith('"'):
                    summary = summary[:-1]
                break

        # Clean key_drivers/risk_factors — remove quote artifacts and duplicates
        def clean_list(items: list) -> list[str]:
            cleaned = []
            seen = set()
            for item in items:
                s = str(item).strip().strip('"').strip(',').strip()
                # Remove "summary": leaked prefix
                for p in ['"summary": "', '"summary":"']:
                    if s.startswith(p):
                        s = s[len(p):].rstrip('"')
                # Remove [cite: N] references
                import re
                s = re.sub(r'\s*\[cite:\s*\d+\]\.?', '', s)
                if s and len(s) > 10 and s not in seen:
                    seen.add(s)
                    cleaned.append(s)
            return cleaned

        # Build combined text for any downstream use
        combined_parts = [raw_text[:2000]]
        for src in sources:
            combined_parts.append(f"Source: {src.title} ({src.url})")

        result = GeminiNewsResult(
            symbol=symbol,
            query=f"{company} stock news",
            articles=articles,
            article_count=len(articles),
            sentiment=parsed.get("sentiment", "NEUTRAL"),
            sentiment_score=parsed.get("sentiment_score", 0.0),
            summary=summary,
            key_drivers=clean_list(parsed.get("key_drivers", [])),
            risk_factors=clean_list(parsed.get("risk_factors", [])),
            sources=sources,
            combined_text="\n".join(combined_parts)[:3000],
            raw_response=raw_text,
        )

        logger.info(
            "Gemini news [%s]: %d articles, %d sources, sentiment=%s (%.0f)",
            symbol,
            len(articles),
            len(sources),
            result.sentiment,
            result.sentiment_score,
        )

        return result

    def _extract_sources(self, response) -> list[NewsSource]:
        """Extract grounding sources (citations) from Gemini response.

        Gemini returns groundingMetadata with groundingChunks containing
        web sources with URIs and titles.

        Args:
            response: Gemini API response object.

        Returns:
            List of NewsSource objects with title, url, domain.
        """
        sources = []
        try:
            candidate = response.candidates[0] if response.candidates else None
            if not candidate:
                return sources

            metadata = getattr(candidate, "grounding_metadata", None)
            if not metadata:
                return sources

            chunks = getattr(metadata, "grounding_chunks", []) or []
            for chunk in chunks:
                web = getattr(chunk, "web", None)
                if web:
                    url = getattr(web, "uri", "") or ""
                    title = getattr(web, "title", "") or ""
                    domain = self._extract_domain(url)
                    sources.append(NewsSource(
                        title=title,
                        url=url,
                        domain=domain,
                    ))
        except Exception as e:
            logger.warning("Failed to extract grounding sources: %s", e)

        return sources

    def _extract_articles_from_sources(
        self,
        sources: list[NewsSource],
        raw_text: str,
    ) -> list[GeminiNewsArticle]:
        """Convert grounding sources into news articles.

        Each cited source becomes a news article. We use the Gemini
        response text to derive content snippets for each source.

        Args:
            sources: Grounding sources from Gemini.
            raw_text: Full Gemini response text.

        Returns:
            List of GeminiNewsArticle objects.
        """
        articles = []
        seen_domains = set()

        for source in sources:
            # Deduplicate by domain (Gemini may cite same site multiple times)
            if source.domain in seen_domains:
                continue
            seen_domains.add(source.domain)

            # Extract relevant content snippet from the response text
            content = self._find_relevant_snippet(source.title, raw_text)

            # Clean content — strip leaked JSON keys from Gemini response
            content = self._clean_json_artifacts(content)

            # Generate a proper title:
            # Priority: source.title → first meaningful sentence of content → domain
            title = source.title.strip() if source.title else ""
            if not title or title == source.domain or len(title) < 5:
                # Generate title from content (first sentence, capped at 100 chars)
                if content and len(content) > 10:
                    first_sentence = content.split(".")[0].strip()
                    title = first_sentence[:100] + ("..." if len(first_sentence) > 100 else "")
                else:
                    title = f"{source.domain} — Financial Report"

            articles.append(GeminiNewsArticle(
                title=title,
                url=source.url,
                content=content,
                score=0.9,  # Gemini grounded results are highly relevant
                source=self._prettify_domain(source.domain),
            ))

        return articles

    @staticmethod
    def _clean_json_artifacts(text: str) -> str:
        """Strip leaked JSON key prefixes/suffixes from Gemini text.

        Gemini sometimes includes raw JSON keys like '"summary": "...'
        in its grounded response text.
        """
        if not text:
            return text
        import re
        # Remove leading JSON key patterns: "summary": ", "content": ", etc.
        text = re.sub(r'^"?\w+"?\s*:\s*"?', '', text)
        # Remove trailing unmatched quote
        if text.endswith('"'):
            text = text[:-1]
        # Remove [cite: N] references
        text = re.sub(r'\s*\[cite:\s*\d+\]\.?', '', text)
        return text.strip()

    def _find_relevant_snippet(self, title: str, text: str, max_len: int = 200) -> str:
        """Find a relevant snippet from Gemini's response for an article.

        Looks for sentences that mention keywords from the source title.

        Args:
            title: Source title to match against.
            text: Full Gemini response text.
            max_len: Maximum snippet length.

        Returns:
            Relevant text snippet.
        """
        if not title or not text:
            return ""

        # Extract keywords from title (skip short/common words)
        keywords = [
            w.lower() for w in title.split()
            if len(w) >= 4 and w.lower() not in {
                "the", "and", "for", "with", "from", "this", "that",
                "news", "india", "stock", "market", "share",
            }
        ]

        if not keywords:
            return text[:max_len]

        # Find sentences mentioning any keyword
        sentences = text.replace("\n", ". ").split(". ")
        for sentence in sentences:
            sentence_lower = sentence.lower()
            if any(kw in sentence_lower for kw in keywords):
                return sentence.strip()[:max_len]

        # Fallback: return first meaningful sentence
        for sentence in sentences:
            if len(sentence.strip()) > 30:
                return sentence.strip()[:max_len]

        return text[:max_len]

    def _parse_structured_response(self, text: str) -> dict:
        """Parse Gemini's response to extract sentiment and analysis.

        Tries to find JSON block first, falls back to keyword analysis.

        Args:
            text: Raw Gemini response text.

        Returns:
            Dict with sentiment, sentiment_score, summary, key_drivers, risk_factors.
        """
        # Try to extract JSON from the response
        try:
            # Look for JSON block — handle markdown code fences
            clean_text = text
            # Strip ```json ... ``` wrappers
            if "```json" in clean_text:
                clean_text = clean_text.split("```json", 1)[1]
                if "```" in clean_text:
                    clean_text = clean_text.split("```", 1)[0]
            elif "```" in clean_text:
                parts = clean_text.split("```")
                if len(parts) >= 3:
                    clean_text = parts[1]

            json_start = clean_text.find("{")
            json_end = clean_text.rfind("}") + 1
            if json_start >= 0 and json_end > json_start:
                json_str = clean_text[json_start:json_end]
                parsed = json.loads(json_str)
                if "sentiment" in parsed or "summary" in parsed:
                    # Normalize sentiment to strict POSITIVE/NEUTRAL/NEGATIVE
                    raw_sentiment = str(parsed.get("sentiment", "NEUTRAL")).upper()
                    sentiment = self._normalize_sentiment(raw_sentiment)
                    result = {
                        "sentiment": sentiment,
                        "sentiment_score": float(parsed.get("sentiment_score", 0)),
                        "summary": parsed.get("summary", ""),
                        "key_drivers": parsed.get("key_drivers", []),
                        "risk_factors": parsed.get("risk_factors", []),
                    }
                    # If JSON parsed but key_drivers/risk_factors are empty,
                    # fall back to text extraction for those fields only
                    if not result["key_drivers"] or not result["risk_factors"]:
                        text_derived = self._derive_sentiment_from_text(text)
                        if not result["key_drivers"]:
                            result["key_drivers"] = text_derived.get("key_drivers", [])
                        if not result["risk_factors"]:
                            result["risk_factors"] = text_derived.get("risk_factors", [])
                    return result
        except (json.JSONDecodeError, ValueError):
            pass

        # Fallback: derive from text analysis
        return self._derive_sentiment_from_text(text)

    def _normalize_sentiment(self, raw: str) -> str:
        """Normalize Gemini's sentiment label to strict POSITIVE/NEUTRAL/NEGATIVE.

        Gemini sometimes returns creative labels like 'CAUTIOUSLY POSITIVE',
        'SLIGHTLY NEGATIVE', 'MIXED', etc. This maps them to our 3 standard values.

        Args:
            raw: Raw sentiment string from Gemini (already uppercased).

        Returns:
            One of: 'POSITIVE', 'NEUTRAL', 'NEGATIVE'.
        """
        if "POSITIVE" in raw or "BULLISH" in raw or "OPTIMISTIC" in raw:
            return "POSITIVE"
        if "NEGATIVE" in raw or "BEARISH" in raw or "PESSIMISTIC" in raw:
            return "NEGATIVE"
        return "NEUTRAL"

    def _derive_sentiment_from_text(self, text: str) -> dict:
        """Derive sentiment from text using keyword analysis.

        Args:
            text: Text to analyze.

        Returns:
            Dict with sentiment, sentiment_score, summary, key_drivers, risk_factors.
        """
        text_lower = text.lower()

        bull_words = [
            "growth", "surge", "surges", "rally", "rallies", "bullish",
            "gain", "gains", "profit", "profits", "upgrade", "upgraded",
            "positive", "strong", "stronger", "outperform", "beat", "beats",
            "recovery", "bounce", "breakout", "uptrend", "record high",
            "buy", "accumulate", "optimistic", "dividend", "revenue growth",
            "record", "milestone", "expansion", "target raised",
        ]
        bear_words = [
            "decline", "declines", "fall", "falls", "fell", "bearish",
            "loss", "losses", "downgrade", "downgraded",
            "negative", "weak", "weaker", "weakness", "underperform",
            "crash", "crashed", "sell", "strong sell",
            "concern", "concerns", "risk", "pressure",
            "52-week low", "slump", "headwinds",
            "deteriorating", "distress", "debt", "correction",
            "downward", "plunge", "plunges", "target cut",
        ]

        bull_count = sum(1 for w in bull_words if w in text_lower)
        bear_count = sum(1 for w in bear_words if w in text_lower)

        if bull_count > bear_count:
            diff = bull_count - bear_count
            score = min(diff * 12, 80)
            sentiment = "POSITIVE"
        elif bear_count > bull_count:
            diff = bear_count - bull_count
            score = max(-diff * 12, -80)
            sentiment = "NEGATIVE"
        else:
            score = 0
            sentiment = "NEUTRAL"

        # Extract key sentences as drivers/risks
        sentences = text.replace("\n", ". ").split(". ")
        key_drivers = []
        risk_factors = []

        for s in sentences:
            s = s.strip()
            if len(s) < 20 or len(s) > 200:
                continue
            s_lower = s.lower()
            if any(w in s_lower for w in ["growth", "profit", "surge", "gain", "strong", "positive", "record"]):
                if len(key_drivers) < 3:
                    key_drivers.append(s[:150])
            elif any(w in s_lower for w in ["decline", "loss", "risk", "concern", "weak", "debt", "fall"]):
                if len(risk_factors) < 3:
                    risk_factors.append(s[:150])

        # Use first 2 sentences as summary
        summary_sentences = [s.strip() for s in sentences if len(s.strip()) > 30]
        summary = ". ".join(summary_sentences[:2])[:500]

        return {
            "sentiment": sentiment,
            "sentiment_score": float(score),
            "summary": summary,
            "key_drivers": key_drivers,
            "risk_factors": risk_factors,
        }

    def _build_stock_prompt(self, symbol: str, company: str, max_articles: int) -> str:
        """Build the prompt for stock news search.

        Instructs Gemini to search Google for latest news and return
        structured analysis.

        Args:
            symbol: Stock symbol.
            company: Full company name.
            max_articles: Max news items.

        Returns:
            Prompt string.
        """
        return (
            f"Search for the latest news about {company} ({symbol}) "
            f"on the Indian stock market (NSE/BSE) from the past week.\n\n"
            f"Based on the search results, provide:\n"
            f"1. A brief summary of the most important recent developments\n"
            f"2. Overall sentiment analysis for the stock\n"
            f"3. Key positive drivers (bullish factors)\n"
            f"4. Risk factors or concerns (bearish factors)\n\n"
            f"IMPORTANT: Respond with ONLY a valid JSON object, no markdown, "
            f"no code fences, no explanation text before or after. "
            f"The sentiment MUST be exactly one of: POSITIVE, NEUTRAL, or NEGATIVE.\n\n"
            f'{{\n'
            f'  "summary": "2-3 sentence overview of recent news",\n'
            f'  "sentiment": "POSITIVE" or "NEUTRAL" or "NEGATIVE",\n'
            f'  "sentiment_score": <number from -100 to 100>,\n'
            f'  "key_drivers": ["driver1", "driver2", "driver3"],\n'
            f'  "risk_factors": ["risk1", "risk2", "risk3"]\n'
            f'}}\n\n'
            f"Focus on: share price movement, quarterly results, analyst ratings, "
            f"management commentary, sector trends, and any corporate actions. "
            f"Only include factual information from reliable financial news sources."
        )

    def _build_market_prompt(self) -> str:
        """Build prompt for overall market overview.

        Returns:
            Prompt string for market-wide analysis.
        """
        return (
            "Search for today's Indian stock market news and analysis. "
            "Cover: Nifty 50, Sensex, Bank Nifty performance, "
            "FII/DII flows, top gainers/losers, and key market events.\n\n"
            "IMPORTANT: Respond with ONLY a valid JSON object, no markdown, "
            "no code fences. Sentiment MUST be exactly: POSITIVE, NEUTRAL, or NEGATIVE.\n\n"
            '{\n'
            '  "summary": "2-3 sentence market overview",\n'
            '  "sentiment": "POSITIVE" or "NEUTRAL" or "NEGATIVE",\n'
            '  "sentiment_score": <-100 to 100>,\n'
            '  "key_drivers": ["market driver 1", "market driver 2"],\n'
            '  "risk_factors": ["market risk 1", "market risk 2"]\n'
            '}\n\n'
            "Focus on factual data: index levels, percentage changes, "
            "FII/DII net buy/sell figures, RBI announcements, global cues."
        )

    def _empty_result(self, symbol: str, message: str) -> GeminiNewsResult:
        """Create an empty result with an informative message.

        Args:
            symbol: Stock/topic identifier.
            message: Explanation of why results are empty.

        Returns:
            GeminiNewsResult with zero articles and message as summary.
        """
        return GeminiNewsResult(
            symbol=symbol,
            query=f"{symbol} news",
            articles=[],
            article_count=0,
            sentiment="NEUTRAL",
            sentiment_score=0.0,
            summary=message,
            key_drivers=[],
            risk_factors=[],
            sources=[],
            combined_text=message,
            raw_response="",
        )

    @staticmethod
    def _extract_domain(url: str) -> str:
        """Extract clean domain from URL.

        Args:
            url: Full URL string.

        Returns:
            Domain name (e.g., "moneycontrol.com").
        """
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            domain = parsed.hostname or ""
            return domain.replace("www.", "")
        except Exception:
            return ""

    @staticmethod
    def _prettify_domain(domain: str) -> str:
        """Convert domain to a readable source name.

        Args:
            domain: Domain name (e.g., "economictimes.indiatimes.com").

        Returns:
            Pretty name (e.g., "Economic Times").
        """
        domain_map = {
            "moneycontrol.com": "Moneycontrol",
            "economictimes.indiatimes.com": "Economic Times",
            "livemint.com": "Livemint",
            "reuters.com": "Reuters",
            "bloomberg.com": "Bloomberg",
            "ndtv.com": "NDTV",
            "business-standard.com": "Business Standard",
            "financialexpress.com": "Financial Express",
            "cnbctv18.com": "CNBC TV18",
            "screener.in": "Screener",
            "trendlyne.com": "Trendlyne",
            "tickertape.in": "Tickertape",
            "groww.in": "Groww",
            "nseindia.com": "NSE India",
            "bseindia.com": "BSE India",
            "yahoo.com": "Yahoo Finance",
            "finance.yahoo.com": "Yahoo Finance",
            "vertexaisearch.cloud.google.com": "Google Search",
            "blinkx.in": "Blinkx Finance",
            "investing.com": "Investing.com",
            "tradingview.com": "TradingView",
            "zerodha.com": "Zerodha",
            "5paisa.com": "5Paisa",
            "angelone.in": "Angel One",
            "upstox.com": "Upstox",
        }

        for key, name in domain_map.items():
            if key in domain:
                return name

        # Fallback: capitalize first part
        parts = domain.split(".")
        if parts:
            return parts[0].capitalize()
        return domain
