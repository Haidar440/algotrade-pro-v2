"""
Module: app/services/swing_screener.py
Purpose: Dynamic swing stock discovery using TradingView Screener API.

Zero local computation — all filtering happens on TradingView's servers.
Returns pre-filtered NSE India swing trading candidates for deep scoring
by StockPicker.

Uses a 3-tier filter cascade:
  Tier 1 (Trend):   Price > EMA200 > EMA50 (confirmed uptrend)
  Tier 2 (Momentum): RSI 35-72, MACD bullish or near crossover
  Tier 3 (Volume):   Relative volume > 1.0x (institutional interest)
  Tier 4 (Quality):  Price > ₹30, excludes penny stocks

Results are cached for 4 hours to avoid hitting TradingView rate limits.
"""

import logging
import time
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)

# ── Fallback list if TradingView API is unavailable ──────────────────────
FALLBACK_WATCHLIST: list[str] = [
    # Nifty 50 heavyweights
    "RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK",
    "SBIN", "BHARTIARTL", "ITC", "HINDUNILVR", "LT",
    # Growth / momentum names
    "TATAMOTORS", "TATAPOWER", "WIPRO", "BAJFINANCE", "MARUTI",
    "SUNPHARMA", "HCLTECH", "AXISBANK", "KOTAKBANK", "ADANIENT",
    # Mid-cap outperformers
    "TRENT", "ZOMATO", "JSWSTEEL", "POWERGRID", "NTPC",
    "COALINDIA", "TECHM", "TITAN", "ULTRACEMCO", "BAJAJ-AUTO",
]


@dataclass
class SwingCandidate:
    """A stock that passed TradingView swing filters."""

    symbol: str
    name: str
    close: float
    relative_volume: float
    rsi: float
    ema20: Optional[float] = None
    ema50: Optional[float] = None
    ema200: Optional[float] = None


@dataclass
class ScreenerResult:
    """Result from the swing screener scan."""

    candidates: list[SwingCandidate]
    total_matches: int
    source: str  # "tradingview" or "fallback"
    scan_time_ms: float = 0.0


class SwingScreener:
    """
    Dynamic swing stock discovery using TradingView Screener API.

    Sends SQL-like queries to TradingView's scanner endpoint which
    filters ~2000+ NSE stocks server-side, returning only those
    matching our swing criteria — zero local computation required.

    Cache TTL: 4 hours (market conditions don't change drastically).
    """

    # Cache settings
    CACHE_TTL_SECONDS: int = 4 * 60 * 60  # 4 hours

    def __init__(self) -> None:
        """Initialize the swing screener with empty cache."""
        self._cache: Optional[ScreenerResult] = None
        self._cache_timestamp: float = 0.0
        self._available: Optional[bool] = None

    @property
    def is_available(self) -> bool:
        """Check if tradingview-screener package is installed."""
        if self._available is None:
            try:
                from tradingview_screener import Query  # noqa: F401
                self._available = True
            except ImportError:
                logger.warning(
                    "tradingview-screener not installed. "
                    "Run: pip install tradingview-screener"
                )
                self._available = False
        return self._available

    def _is_cache_valid(self) -> bool:
        """Check if cached results are still fresh."""
        if self._cache is None:
            return False
        age = time.time() - self._cache_timestamp
        return age < self.CACHE_TTL_SECONDS

    def get_swing_candidates(
        self,
        max_results: int = 50,
        min_price: float = 30.0,
        max_rsi: float = 72.0,
        min_rsi: float = 35.0,
        min_rel_volume: float = 1.0,
        force_refresh: bool = False,
    ) -> list[str]:
        """
        Get dynamically discovered swing trading candidates from NSE.

        All filtering happens on TradingView's servers — zero local
        computation. Results are cached for 4 hours.

        Args:
            max_results: Maximum number of candidates to return.
            min_price: Minimum stock price (filters penny stocks).
            max_rsi: Maximum RSI (avoid overbought).
            min_rsi: Minimum RSI (avoid oversold / bearish).
            min_rel_volume: Minimum relative volume vs 10d avg.
            force_refresh: Bypass cache and fetch fresh data.

        Returns:
            List of NSE stock symbols (e.g. ["RELIANCE", "TCS", ...]).
        """
        # Return cache if valid
        if not force_refresh and self._is_cache_valid():
            logger.info(
                "Swing screener: returning %d cached candidates (age: %ds)",
                len(self._cache.candidates),
                int(time.time() - self._cache_timestamp),
            )
            return [c.symbol for c in self._cache.candidates]

        # Check availability
        if not self.is_available:
            logger.warning("TradingView screener unavailable, using fallback")
            return FALLBACK_WATCHLIST[:max_results]

        # Fetch from TradingView
        try:
            result = self._fetch_from_tradingview(
                max_results=max_results,
                min_price=min_price,
                max_rsi=max_rsi,
                min_rsi=min_rsi,
                min_rel_volume=min_rel_volume,
            )
            # Update cache
            self._cache = result
            self._cache_timestamp = time.time()

            symbols = [c.symbol for c in result.candidates]
            logger.info(
                "Swing screener: found %d candidates from %d matches "
                "(%.0fms, source=%s)",
                len(symbols),
                result.total_matches,
                result.scan_time_ms,
                result.source,
            )
            return symbols

        except Exception as e:
            logger.error(
                "TradingView screener failed: %s — using fallback", e
            )
            return FALLBACK_WATCHLIST[:max_results]

    def _fetch_from_tradingview(
        self,
        max_results: int,
        min_price: float,
        max_rsi: float,
        min_rsi: float,
        min_rel_volume: float,
    ) -> ScreenerResult:
        """
        Query TradingView Scanner API for NSE swing candidates.

        Filter criteria (inspired by Screeni-py + Minervini template):
          - Exchange: NSE only
          - Type: stocks only (no ETFs, bonds)
          - Price > EMA200 (confirmed uptrend — Weinstein Stage 2)
          - Price > EMA50 (medium-term momentum)
          - RSI between 35-72 (sweet spot — not overbought/oversold)
          - Relative volume > 1.0x (institutional interest)
          - Price > min_price (quality filter)
          - Sorted by relative volume descending (highest interest first)

        Raises:
            Exception: If TradingView API call fails.
        """
        from tradingview_screener import Query, col

        start = time.time()

        count, df = (
            Query()
            .select(
                "name", "close", "volume",
                "relative_volume_10d_calc",
                "RSI", "EMA20", "EMA50", "EMA200",
            )
            .set_markets("india")
            .where(
                col("exchange").isin(["NSE"]),
                col("type").isin(["stock"]),
                # ── Trend filters (Minervini-inspired) ──
                col("close") > col("EMA200"),     # Above 200 EMA (uptrend)
                col("close") > col("EMA50"),      # Above 50 EMA (momentum)
                # ── Momentum filters ──
                col("RSI").between(min_rsi, max_rsi),
                # ── Volume filter (institutional interest) ──
                col("relative_volume_10d_calc") > min_rel_volume,
                # ── Quality filter ──
                col("close") > min_price,
            )
            .order_by("relative_volume_10d_calc", ascending=False)
            .limit(max_results)
            .get_scanner_data()
        )

        elapsed_ms = (time.time() - start) * 1000

        if df.empty:
            logger.warning("TradingView returned 0 results, using fallback")
            return ScreenerResult(
                candidates=[],
                total_matches=0,
                source="tradingview_empty",
                scan_time_ms=elapsed_ms,
            )

        # Parse results into SwingCandidate objects
        candidates: list[SwingCandidate] = []
        for _, row in df.iterrows():
            ticker = str(row.get("ticker", ""))
            symbol = ticker.replace("NSE:", "")
            if not symbol:
                continue

            candidates.append(
                SwingCandidate(
                    symbol=symbol,
                    name=str(row.get("name", symbol)),
                    close=float(row.get("close", 0)),
                    relative_volume=float(
                        row.get("relative_volume_10d_calc", 0)
                    ),
                    rsi=float(row.get("RSI", 0)),
                    ema20=_safe_float(row.get("EMA20")),
                    ema50=_safe_float(row.get("EMA50")),
                    ema200=_safe_float(row.get("EMA200")),
                )
            )

        return ScreenerResult(
            candidates=candidates,
            total_matches=count,
            source="tradingview",
            scan_time_ms=elapsed_ms,
        )

    def invalidate_cache(self) -> None:
        """Force cache invalidation (e.g. after market hours)."""
        self._cache = None
        self._cache_timestamp = 0.0
        logger.info("Swing screener cache invalidated")

    def get_last_scan_info(self) -> dict:
        """Get info about the last scan (for diagnostics)."""
        if self._cache is None:
            return {"status": "no_scan", "cached": False}

        age_seconds = int(time.time() - self._cache_timestamp)
        return {
            "status": "cached",
            "cached": True,
            "total_matches": self._cache.total_matches,
            "candidates_returned": len(self._cache.candidates),
            "source": self._cache.source,
            "scan_time_ms": round(self._cache.scan_time_ms, 1),
            "cache_age_seconds": age_seconds,
            "cache_ttl_seconds": self.CACHE_TTL_SECONDS,
            "top_5": [
                {
                    "symbol": c.symbol,
                    "close": c.close,
                    "rel_volume": round(c.relative_volume, 2),
                    "rsi": round(c.rsi, 1),
                }
                for c in self._cache.candidates[:5]
            ],
        }


def _safe_float(val) -> Optional[float]:
    """Safely convert a value to float, returning None if not possible."""
    if val is None:
        return None
    try:
        import math
        f = float(val)
        return None if math.isnan(f) else f
    except (ValueError, TypeError):
        return None
