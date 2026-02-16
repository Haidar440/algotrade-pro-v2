"""
Module: app/services/ai_engine.py
Purpose: AI analysis engine powered by LangChain + Google Gemini.

Builds an analysis chain that takes stock data + technical indicators
and produces a BUY/SELL/HOLD recommendation with reasoning and confidence.

All API keys come from app.config.settings — zero hardcoding.
AI output is sanitized before returning to clients.
"""

import json
import logging
from dataclasses import dataclass, field
from typing import Optional

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.output_parsers import JsonOutputParser
from langchain_google_genai import ChatGoogleGenerativeAI

from app.config import settings
from app.constants import Signal

logger = logging.getLogger(__name__)


# ━━━━━━━━━━━━━━━ Data Classes ━━━━━━━━━━━━━━━


@dataclass
class AIAnalysisResult:
    """Structured AI analysis output."""

    symbol: str = ""
    signal: Signal = Signal.NO_TRADE
    confidence: float = 0.0  # 0-100
    predicted_direction: str = ""  # "UP" / "DOWN" / "SIDEWAYS"
    target_price: float = 0.0
    stop_loss: float = 0.0
    time_horizon: str = "5-10 days"
    reasoning: str = ""
    key_factors: list[str] = field(default_factory=list)
    risk_level: str = "MEDIUM"  # LOW / MEDIUM / HIGH
    news_sentiment: str = "NEUTRAL"  # POSITIVE / NEUTRAL / NEGATIVE


@dataclass
class StockAnalysisInput:
    """Input data packaged for AI analysis."""

    symbol: str
    current_price: float
    day_change_pct: float
    rsi: float
    macd_signal: str
    ema_signal: str
    adx: float
    adx_signal: str
    supertrend_signal: str
    volume_ratio: float
    support: float
    resistance: float
    market_condition: str
    technical_signal: str
    signal_strength: float
    news_summary: Optional[str] = None
    price_history: Optional[str] = None


# ━━━━━━━━━━━━━━━ System Prompt ━━━━━━━━━━━━━━━

SYSTEM_PROMPT = """You are an expert algorithmic trader specializing in Indian stock markets (NSE/BSE).
You analyze stocks using technical indicators and market data to provide trading recommendations.

IMPORTANT RULES:
1. Always provide a clear BUY, SELL, or HOLD signal
2. Confidence must be between 0 and 100
3. Always specify a stop loss and target price
4. Be conservative — never recommend more than MEDIUM risk for swing trades
5. Consider the overall market condition in your analysis
6. Your response must be valid JSON with NO markdown formatting

You must respond with ONLY a JSON object in this exact format:
{
    "signal": "BUY" or "SELL" or "HOLD",
    "confidence": <number 0-100>,
    "predicted_direction": "UP" or "DOWN" or "SIDEWAYS",
    "target_price": <number>,
    "stop_loss": <number>,
    "time_horizon": "5-10 days",
    "reasoning": "<2-3 sentence explanation>",
    "key_factors": ["factor1", "factor2", "factor3"],
    "risk_level": "LOW" or "MEDIUM" or "HIGH"
}"""


# ━━━━━━━━━━━━━━━ AI Engine ━━━━━━━━━━━━━━━


class AIEngine:
    """LangChain + Gemini AI analysis engine.

    Processes stock data through Gemini for intelligent analysis.
    All API keys are sourced from the app settings — never hardcoded.

    Example:
        engine = AIEngine()
        result = await engine.analyze_stock(input_data)
        print(result.signal, result.confidence)
    """

    def __init__(self) -> None:
        """Initialize the AI engine with Gemini LLM.

        Uses gemini-2.0-flash for fast, cost-effective analysis.
        API key comes from settings.GEMINI_API_KEY.
        """
        self._llm = ChatGoogleGenerativeAI(
            model="gemini-2.0-flash",
            google_api_key=settings.GEMINI_API_KEY,
            temperature=0.3,  # Low temp for consistent analysis
            max_output_tokens=1024,
        )
        self._parser = JsonOutputParser()
        logger.info("AIEngine initialized with gemini-2.0-flash")

    async def analyze_stock(
        self, input_data: StockAnalysisInput
    ) -> AIAnalysisResult:
        """Analyze a stock using AI and return a structured recommendation.

        Args:
            input_data: Technical indicators + market context for the stock.

        Returns:
            AIAnalysisResult with signal, confidence, target, SL, and reasoning.
        """
        try:
            prompt = self._build_prompt(input_data)
            messages = [
                SystemMessage(content=SYSTEM_PROMPT),
                HumanMessage(content=prompt),
            ]

            response = await self._llm.ainvoke(messages)
            result = self._parse_response(response.content, input_data)
            logger.info(
                "AI analysis for %s: %s (confidence: %.0f%%)",
                input_data.symbol,
                result.signal.value,
                result.confidence,
            )
            return result

        except Exception as e:
            logger.error("AI analysis failed for %s: %s", input_data.symbol, e)
            return self._fallback_analysis(input_data)

    async def get_sentiment_analysis(
        self, symbol: str, news_text: str
    ) -> dict:
        """Analyze news sentiment for a stock using Gemini.

        Args:
            symbol: Stock symbol (e.g., "RELIANCE").
            news_text: Concatenated news articles text.

        Returns:
            Dict with sentiment (POSITIVE/NEUTRAL/NEGATIVE), score, and summary.
        """
        try:
            prompt = (
                f"Analyze the sentiment of the following news about {symbol} "
                f"for Indian stock market trading. Return ONLY a JSON object:\n"
                f'{{"sentiment": "POSITIVE" or "NEUTRAL" or "NEGATIVE", '
                f'"score": <-100 to 100>, '
                f'"summary": "<1 sentence>", '
                f'"impact": "HIGH" or "MEDIUM" or "LOW"}}\n\n'
                f"News:\n{news_text[:3000]}"  # Truncate to avoid token limits
            )

            messages = [HumanMessage(content=prompt)]
            response = await self._llm.ainvoke(messages)
            parsed = self._safe_json_parse(response.content)

            return {
                "sentiment": parsed.get("sentiment", "NEUTRAL"),
                "score": max(-100, min(100, parsed.get("score", 0))),
                "summary": self._sanitize_text(parsed.get("summary", "")),
                "impact": parsed.get("impact", "MEDIUM"),
            }

        except Exception as e:
            logger.error("Sentiment analysis failed for %s: %s", symbol, e)
            return {
                "sentiment": "NEUTRAL",
                "score": 0,
                "summary": "Sentiment analysis unavailable",
                "impact": "LOW",
            }

    # ━━━━━━━━━━━━ Private Methods ━━━━━━━━━━━━

    def _build_prompt(self, data: StockAnalysisInput) -> str:
        """Build the analysis prompt from stock data."""
        parts = [
            f"Analyze {data.symbol} on NSE for a swing trade opportunity:",
            f"",
            f"PRICE DATA:",
            f"  Current Price: {data.current_price:.2f}",
            f"  Day Change: {data.day_change_pct:+.2f}%",
            f"  Support: {data.support:.2f}",
            f"  Resistance: {data.resistance:.2f}",
            f"",
            f"TECHNICAL INDICATORS:",
            f"  RSI(14): {data.rsi:.1f}",
            f"  MACD: {data.macd_signal}",
            f"  EMA Alignment: {data.ema_signal}",
            f"  ADX: {data.adx:.1f} ({data.adx_signal})",
            f"  Supertrend: {data.supertrend_signal}",
            f"  Volume Ratio: {data.volume_ratio:.1f}x average",
            f"",
            f"MARKET CONTEXT:",
            f"  Market Condition: {data.market_condition}",
            f"  Technical Signal: {data.technical_signal} (Strength: {data.signal_strength}/100)",
        ]

        if data.news_summary:
            parts.extend([
                f"",
                f"RECENT NEWS:",
                f"  {data.news_summary[:500]}",
            ])

        if data.price_history:
            parts.extend([
                f"",
                f"PRICE HISTORY (last 10 sessions):",
                f"  {data.price_history[:500]}",
            ])

        return "\n".join(parts)

    def _parse_response(
        self, content: str, input_data: StockAnalysisInput
    ) -> AIAnalysisResult:
        """Parse LLM response into structured AIAnalysisResult."""
        parsed = self._safe_json_parse(content)

        # Map signal string to enum
        signal_map = {
            "BUY": Signal.BUY,
            "STRONG_BUY": Signal.STRONG_BUY,
            "SELL": Signal.SELL,
            "HOLD": Signal.NO_TRADE,
        }
        signal_str = parsed.get("signal", "HOLD").upper()
        signal = signal_map.get(signal_str, Signal.NO_TRADE)

        return AIAnalysisResult(
            symbol=input_data.symbol,
            signal=signal,
            confidence=max(0, min(100, parsed.get("confidence", 50))),
            predicted_direction=parsed.get("predicted_direction", "SIDEWAYS"),
            target_price=parsed.get("target_price", 0.0),
            stop_loss=parsed.get("stop_loss", 0.0),
            time_horizon=parsed.get("time_horizon", "5-10 days"),
            reasoning=self._sanitize_text(parsed.get("reasoning", "")),
            key_factors=[
                self._sanitize_text(f) for f in parsed.get("key_factors", [])
            ],
            risk_level=parsed.get("risk_level", "MEDIUM"),
        )

    def _fallback_analysis(self, data: StockAnalysisInput) -> AIAnalysisResult:
        """Generate a conservative fallback when AI fails.

        Uses pure technical signal — no AI reasoning.
        """
        # Map technical signal to AI result
        signal_map = {
            "BUY": Signal.BUY,
            "STRONG_BUY": Signal.STRONG_BUY,
            "SELL": Signal.SELL,
        }
        signal = signal_map.get(data.technical_signal, Signal.NO_TRADE)

        return AIAnalysisResult(
            symbol=data.symbol,
            signal=signal,
            confidence=data.signal_strength * 0.5,  # Lower confidence for fallback
            predicted_direction="SIDEWAYS",
            target_price=data.resistance,
            stop_loss=data.support,
            time_horizon="5-10 days",
            reasoning=(
                "AI analysis unavailable. Using technical indicators only. "
                f"Technical signal: {data.technical_signal} "
                f"(strength: {data.signal_strength}/100)."
            ),
            key_factors=["Technical analysis only — AI unavailable"],
            risk_level="HIGH",
        )

    @staticmethod
    def _safe_json_parse(content: str) -> dict:
        """Parse JSON from LLM response, handling markdown code blocks."""
        # Strip markdown code blocks if present
        text = content.strip()
        if text.startswith("```json"):
            text = text[7:]
        elif text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

        try:
            return json.loads(text)
        except json.JSONDecodeError:
            logger.warning("Failed to parse AI response as JSON: %s", text[:200])
            return {}

    @staticmethod
    def _sanitize_text(text: str) -> str:
        """Sanitize AI-generated text for safe client display.

        Removes potential injection, excessive length, and control characters.
        """
        if not isinstance(text, str):
            return ""
        # Remove control characters
        cleaned = "".join(c for c in text if c.isprintable() or c in "\n\t")
        # Truncate
        return cleaned[:500]
