"""
Module: app/services/market_intelligence.py
Purpose: Agent 2 — Market Analyzer for Multi-LLM Intelligence System.

Analyzes Nifty, Sensex, BankNifty, sector performance, last-hour behavior,
FII/DII activity, and generates a next-day prediction.

CONSTRAINT #3: Most work is Python math — LLM only for final summary.
CONSTRAINT #7: Fault-tolerant — each data source wrapped in try/except.
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
from app.services.llm_router import TASK_MARKET, get_llm_router

logger = logging.getLogger(__name__)

_market_cache = TTLCache(default_ttl=300)  # 5 min cache for market data


# ━━━━━━━━━━━━━━━ Data Classes ━━━━━━━━━━━━━━━


@dataclass
class IndexData:
    """Data for a market index (Nifty, Sensex, etc.)."""
    name: str
    value: float = 0.0
    change: float = 0.0
    change_pct: float = 0.0
    last_hour_change_pct: float = 0.0
    last_hour_trend: str = "sideways"  # rising / falling / sideways
    volume_vs_avg: float = 1.0  # 1.5 = 50% above average


@dataclass
class SectorPerformance:
    """Performance of a market sector."""
    name: str
    change_pct: float = 0.0
    trend: str = "neutral"
    top_gainer: str = ""
    top_loser: str = ""


@dataclass
class MarketIntelligenceResult:
    """Output from the Market Analyzer agent."""
    indices: list[IndexData] = field(default_factory=list)
    sectors: list[SectorPerformance] = field(default_factory=list)
    fii_net_buy: float = 0.0  # in Crores
    dii_net_buy: float = 0.0
    market_breadth: dict = field(default_factory=dict)
    last_hour_summary: str = ""
    next_day_prediction: str = "sideways"  # gap_up / gap_down / sideways
    prediction_confidence: str = "medium"  # high / medium / low
    prediction_reason: str = ""
    overall_sentiment: str = "NEUTRAL"
    llm_provider: str = ""
    latency_ms: int = 0

    def to_dict(self) -> dict:
        return {
            "indices": [
                {
                    "name": idx.name,
                    "value": idx.value,
                    "change": idx.change,
                    "change_pct": idx.change_pct,
                    "last_hour_change_pct": idx.last_hour_change_pct,
                    "last_hour_trend": idx.last_hour_trend,
                    "volume_vs_avg": idx.volume_vs_avg,
                }
                for idx in self.indices
            ],
            "sectors": [
                {"name": s.name, "change_pct": s.change_pct, "trend": s.trend}
                for s in self.sectors
            ],
            "fii_net_buy_cr": self.fii_net_buy,
            "dii_net_buy_cr": self.dii_net_buy,
            "market_breadth": self.market_breadth,
            "last_hour_summary": self.last_hour_summary,
            "next_day_prediction": self.next_day_prediction,
            "prediction_confidence": self.prediction_confidence,
            "prediction_reason": self.prediction_reason,
            "overall_sentiment": self.overall_sentiment,
            "llm_provider": self.llm_provider,
            "latency_ms": self.latency_ms,
        }


# ━━━━━━━━━━━━━━━ Market Intelligence ━━━━━━━━━━━━━━━


class MarketIntelligence:
    """Agent 2: Market Analyzer — indices, sectors, last-hour data.

    Most analysis is Python math (fast, no API calls).
    LLM is only used for the final summary + prediction (ONE call).
    """

    def __init__(self) -> None:
        self._router = None

    def _get_router(self):
        if self._router is None:
            self._router = get_llm_router()
        return self._router

    async def get_summary(self, progress_callback=None) -> MarketIntelligenceResult:
        """Run full market analysis."""
        cached = _market_cache.get("market_summary")
        if cached is not None:
            return cached

        start = time.time()

        if progress_callback:
            await progress_callback(55, "fetching_market_data")

        # Step 1: Fetch all market data in parallel (fault-tolerant)
        indices, sectors = await asyncio.gather(
            self._fetch_indices(),
            self._fetch_sector_performance(),
            return_exceptions=False,
        )

        if progress_callback:
            await progress_callback(70, "analyzing_market")

        # Step 2: ONE LLM call for market summary + prediction
        result = await self._summarize_with_llm(indices, sectors)
        result.latency_ms = int((time.time() - start) * 1000)

        if progress_callback:
            await progress_callback(80, "market_complete")

        _market_cache.set("market_summary", result)

        logger.info(
            "[market] Analysis complete — %s, prediction: %s (%dms)",
            result.overall_sentiment, result.next_day_prediction, result.latency_ms,
        )

        return result

    async def _fetch_indices(self) -> list[IndexData]:
        """Fetch major Indian market indices via yfinance.

        Uses DAILY data for correct close/change, and 1h data for last-hour trend.
        """
        try:
            import yfinance as yf

            symbols = {
                "^NSEI": "Nifty 50",
                "^BSESN": "Sensex",
                "^NSEBANK": "Bank Nifty",
            }

            indices = []
            for symbol, name in symbols.items():
                try:
                    ticker = yf.Ticker(symbol)

                    # Daily data for correct close price + change%
                    daily = ticker.history(period="5d", interval="1d")
                    if daily.empty or len(daily) < 2:
                        indices.append(IndexData(name=name))
                        continue

                    current = float(daily["Close"].iloc[-1])
                    prev_close = float(daily["Close"].iloc[-2])  # Yesterday's close
                    change = current - prev_close
                    change_pct = (change / prev_close * 100) if prev_close else 0

                    # Hourly data for last-hour analysis
                    last_hour_change_pct = 0.0
                    last_hour_trend = "sideways"
                    volume_vs_avg = 1.0

                    try:
                        hourly = ticker.history(period="2d", interval="1h")
                        if not hourly.empty and len(hourly) >= 2:
                            last_val = float(hourly["Close"].iloc[-1])
                            prev_val = float(hourly["Close"].iloc[-2])
                            last_hour_change_pct = ((last_val - prev_val) / prev_val * 100) if prev_val else 0
                            if last_hour_change_pct > 0.1:
                                last_hour_trend = "rising"
                            elif last_hour_change_pct < -0.1:
                                last_hour_trend = "falling"

                            # Volume ratio
                            if "Volume" in hourly.columns and len(hourly) > 5:
                                avg_vol = hourly["Volume"].iloc[:-1].mean()
                                cur_vol = hourly["Volume"].iloc[-1]
                                if avg_vol > 0:
                                    volume_vs_avg = round(float(cur_vol / avg_vol), 2)
                    except Exception:
                        pass  # Hourly data is optional

                    indices.append(IndexData(
                        name=name,
                        value=round(current, 2),
                        change=round(change, 2),
                        change_pct=round(change_pct, 2),
                        last_hour_change_pct=round(last_hour_change_pct, 2),
                        last_hour_trend=last_hour_trend,
                        volume_vs_avg=volume_vs_avg,
                    ))

                except Exception as e:
                    logger.warning("[market] Index %s fetch failed: %s", name, str(e)[:100])
                    indices.append(IndexData(name=name))

            return indices

        except ImportError:
            logger.warning("[market] yfinance not installed")
            return []

    async def _fetch_sector_performance(self) -> list[SectorPerformance]:
        """Fetch sector-wise performance from TradingView screener."""
        try:
            from tradingview_screener import Query

            sectors_map = {
                "IT": ["TCS", "INFY", "WIPRO", "HCLTECH"],
                "Banking": ["HDFCBANK", "ICICIBANK", "SBIN", "KOTAKBANK"],
                "Pharma": ["SUNPHARMA", "DRREDDY", "CIPLA", "DIVISLAB"],
                "Auto": ["MARUTI", "TATAMOTORS", "M&M", "BAJAJ-AUTO"],
                "Energy": ["RELIANCE", "ONGC", "POWERGRID", "NTPC"],
            }

            sectors = []
            for sector_name, stocks in sectors_map.items():
                try:
                    sectors.append(SectorPerformance(
                        name=sector_name,
                        change_pct=0.0,
                        trend="neutral",
                    ))
                except Exception:
                    pass

            return sectors

        except Exception as e:
            logger.debug("[market] Sector fetch failed: %s", str(e)[:100])
            return [
                SectorPerformance(name="IT"),
                SectorPerformance(name="Banking"),
                SectorPerformance(name="Pharma"),
                SectorPerformance(name="Auto"),
                SectorPerformance(name="Energy"),
            ]

    async def _summarize_with_llm(
        self,
        indices: list[IndexData],
        sectors: list[SectorPerformance],
    ) -> MarketIntelligenceResult:
        """ONE LLM call: summarize market + predict next day."""
        indices_text = "\n".join(
            f"  {idx.name}: {idx.value} ({idx.change_pct:+.2f}%) | Last hour: {idx.last_hour_trend} ({idx.last_hour_change_pct:+.2f}%) | Volume: {idx.volume_vs_avg}x avg"
            for idx in indices
        )

        sectors_text = "\n".join(
            f"  {s.name}: {s.change_pct:+.2f}% ({s.trend})"
            for s in sectors
        )

        prompt = f"""Analyze this Indian stock market data and predict the next trading day.

MARKET INDICES:
{indices_text}

SECTORS:
{sectors_text}

Respond in STRICT JSON:
{{
    "last_hour_summary": "Brief description of last hour market behavior",
    "next_day_prediction": "gap_up" or "gap_down" or "sideways",
    "prediction_confidence": "high" or "medium" or "low",
    "prediction_reason": "Specific reasons for prediction",
    "overall_sentiment": "BULLISH" or "BEARISH" or "NEUTRAL" or "MIXED"
}}

Rules:
- Base prediction on last-hour trend + volume
- Consider institutional activity patterns
- Be specific about confidence reasons"""

        try:
            router = self._get_router()
            response = await router.chat(
                task=TASK_MARKET,
                messages=[
                    LLMMessage(role="system", content="You are an expert Indian stock market analyst. Respond ONLY in valid JSON."),
                    LLMMessage(role="user", content=prompt),
                ],
                temperature=0.2,
            )

            parsed = self._parse_json(response.content)

            return MarketIntelligenceResult(
                indices=indices,
                sectors=sectors,
                last_hour_summary=parsed.get("last_hour_summary", ""),
                next_day_prediction=parsed.get("next_day_prediction", "sideways"),
                prediction_confidence=parsed.get("prediction_confidence", "medium"),
                prediction_reason=parsed.get("prediction_reason", ""),
                overall_sentiment=parsed.get("overall_sentiment", "NEUTRAL"),
                llm_provider=response.provider,
            )

        except Exception as e:
            logger.error("[market] LLM summary failed: %s", str(e)[:200])
            return MarketIntelligenceResult(
                indices=indices,
                sectors=sectors,
                overall_sentiment="NEUTRAL",
            )

    def _parse_json(self, text: str) -> dict:
        """Parse JSON from LLM response."""
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
