"""
Module: app/services/instrument_service.py
Purpose: DB-backed instrument lookup — replaces live Angel One API for symbol search.

Uses the `instruments` table (populated by scripts/seed_instruments.py) for:
  - Symbol search (ILIKE query — instant, no API call, no rate limits)
  - Token resolution (symbol → broker token for historical data)
  - NSE equity universe (for stock picker)

In-memory cache: loads all instruments on startup (~5000 equity records ≈ 2MB RAM),
refreshed every 24h or on-demand via `refresh()`.
"""

import logging
import time
from typing import Optional

from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models.instrument import Instrument
from app.services.cache import instrument_cache

logger = logging.getLogger(__name__)


class InstrumentService:
    """DB-backed instrument lookup and search.

    Provides instant symbol search without hitting Angel One API.
    Uses the instruments table populated by seed_instruments.py.
    """

    def __init__(self) -> None:
        self._loaded = False
        self._instruments: list[dict] = []  # In-memory cache of all instruments
        self._token_map: dict[str, str] = {}  # "NSE:RELIANCE-EQ" → "2885"
        self._symbol_map: dict[str, dict] = {}  # "NSE:RELIANCE-EQ" → full dict
        self._last_load: float = 0.0

    async def load_cache(self) -> int:
        """Load all instruments from DB into memory.

        Called on startup and every 24h. Returns count loaded.
        """
        try:
            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(Instrument).where(
                        Instrument.exch_seg.in_(["NSE", "BSE"])
                    )
                )
                rows = result.scalars().all()

            instruments = []
            token_map = {}
            symbol_map = {}

            for row in rows:
                item = {
                    "token": row.token,
                    "symbol": row.symbol,
                    "name": row.name or "",
                    "exch_seg": row.exch_seg,
                    "instrumenttype": row.instrumenttype or "",
                    "tick_size": str(row.tick_size) if row.tick_size else "0.05",
                }
                instruments.append(item)

                key = f"{row.exch_seg}:{row.symbol}"
                token_map[key] = row.token
                symbol_map[key] = item

                # Also index without suffix for convenience
                # "RELIANCE-EQ" → "RELIANCE"
                clean = row.symbol.split("-")[0] if "-" in row.symbol else row.symbol
                clean_key = f"{row.exch_seg}:{clean}"
                if clean_key not in token_map:
                    token_map[clean_key] = row.token
                    symbol_map[clean_key] = item

            self._instruments = instruments
            self._token_map = token_map
            self._symbol_map = symbol_map
            self._loaded = True
            self._last_load = time.time()

            logger.info(
                "InstrumentService: loaded %d instruments into memory cache",
                len(instruments),
            )
            return len(instruments)

        except Exception as e:
            logger.error("InstrumentService: failed to load cache: %s", e)
            return 0

    async def ensure_loaded(self) -> None:
        """Ensure cache is loaded, loading from DB if needed."""
        if not self._loaded or (time.time() - self._last_load > 86400):
            await self.load_cache()

    async def search(
        self,
        query: str,
        exchange: str = "NSE",
        limit: int = 20,
    ) -> list[dict]:
        """Search instruments by symbol or name.

        Uses in-memory cache for instant results. No API call.

        Args:
            query: Search string (e.g., "RELI", "Reliance").
            exchange: Exchange segment filter ("NSE", "BSE", or "ALL").
            limit: Max results to return.

        Returns:
            List of matching instrument dicts.
        """
        await self.ensure_loaded()

        if not query or not query.strip():
            return []

        q = query.strip().upper()
        results = []

        for item in self._instruments:
            if exchange != "ALL" and item["exch_seg"] != exchange:
                continue

            # Match against symbol or name
            symbol_upper = item["symbol"].upper()
            name_upper = item["name"].upper()

            if q in symbol_upper or q in name_upper:
                results.append(item)
                if len(results) >= limit:
                    break

        # Sort: exact prefix matches first, then by symbol length (shorter = more relevant)
        results.sort(
            key=lambda x: (
                0 if x["symbol"].upper().startswith(q) else 1,
                len(x["symbol"]),
            )
        )

        return results[:limit]

    async def search_db(
        self,
        query: str,
        exchange: str = "NSE",
        limit: int = 20,
    ) -> list[dict]:
        """Fallback: search directly from DB using SQL ILIKE.

        Used when in-memory cache is not loaded or empty.

        Args:
            query: Search string.
            exchange: Exchange segment.
            limit: Max results.

        Returns:
            List of matching instrument dicts.
        """
        if not query or not query.strip():
            return []

        try:
            async with AsyncSessionLocal() as session:
                q = f"%{query.strip()}%"
                stmt = (
                    select(Instrument)
                    .where(
                        Instrument.exch_seg == exchange,
                        or_(
                            Instrument.symbol.ilike(q),
                            Instrument.name.ilike(q),
                        ),
                    )
                    .limit(limit)
                )
                result = await session.execute(stmt)
                rows = result.scalars().all()

            return [
                {
                    "token": r.token,
                    "symbol": r.symbol,
                    "name": r.name or "",
                    "exch_seg": r.exch_seg,
                    "instrumenttype": r.instrumenttype or "",
                    "tick_size": str(r.tick_size) if r.tick_size else "0.05",
                }
                for r in rows
            ]
        except Exception as e:
            logger.error("InstrumentService: DB search failed: %s", e)
            return []

    def get_token(self, symbol: str, exchange: str = "NSE") -> Optional[str]:
        """Resolve symbol → broker token from cache.

        Tries multiple formats:
          1. Exact: "NSE:RELIANCE-EQ"
          2. Clean: "NSE:RELIANCE"

        Args:
            symbol: Trading symbol (e.g., "RELIANCE", "RELIANCE-EQ").
            exchange: Exchange segment.

        Returns:
            Broker token string, or None if not found.
        """
        if not self._loaded:
            return None

        # Try exact match
        key = f"{exchange}:{symbol}"
        token = self._token_map.get(key)
        if token:
            return token

        # Try with -EQ suffix
        eq_key = f"{exchange}:{symbol}-EQ"
        token = self._token_map.get(eq_key)
        if token:
            return token

        # Try without suffix
        clean = symbol.split("-")[0] if "-" in symbol else symbol
        clean_key = f"{exchange}:{clean}"
        return self._token_map.get(clean_key)

    def get_instrument(self, symbol: str, exchange: str = "NSE") -> Optional[dict]:
        """Get full instrument details from cache.

        Args:
            symbol: Trading symbol.
            exchange: Exchange segment.

        Returns:
            Instrument dict or None.
        """
        if not self._loaded:
            return None

        key = f"{exchange}:{symbol}"
        item = self._symbol_map.get(key)
        if item:
            return item

        # Try with -EQ suffix
        eq_key = f"{exchange}:{symbol}-EQ"
        item = self._symbol_map.get(eq_key)
        if item:
            return item

        # Try without suffix
        clean = symbol.split("-")[0] if "-" in symbol else symbol
        clean_key = f"{exchange}:{clean}"
        return self._symbol_map.get(clean_key)

    def get_nse_equity_symbols(self, limit: int = 0) -> list[str]:
        """Get all NSE equity symbol names (without -EQ suffix).

        Used by stock picker for building the universe of scannable stocks.

        Args:
            limit: Max symbols to return (0 = all).

        Returns:
            List of clean symbol names (e.g., ["RELIANCE", "TCS", ...]).
        """
        symbols = []
        seen = set()
        for item in self._instruments:
            if item["exch_seg"] != "NSE":
                continue
            # Strip -EQ suffix for clean symbol
            clean = item["symbol"].split("-")[0] if "-" in item["symbol"] else item["symbol"]
            if clean not in seen:
                seen.add(clean)
                symbols.append(clean)
                if limit and len(symbols) >= limit:
                    break
        return symbols

    async def get_count(self) -> dict:
        """Get instrument count by exchange segment."""
        try:
            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(
                        Instrument.exch_seg,
                        func.count(Instrument.id),
                    ).group_by(Instrument.exch_seg)
                )
                counts = {row[0]: row[1] for row in result.fetchall()}
            return {
                "total": sum(counts.values()),
                "by_exchange": counts,
                "cache_loaded": self._loaded,
                "cache_size": len(self._instruments),
                "cache_age_seconds": int(time.time() - self._last_load) if self._loaded else None,
            }
        except Exception as e:
            logger.error("InstrumentService: count query failed: %s", e)
            return {
                "total": 0,
                "by_exchange": {},
                "cache_loaded": self._loaded,
                "cache_size": len(self._instruments),
                "error": str(e),
            }

    async def refresh(self) -> int:
        """Force refresh the instrument cache from DB."""
        self._loaded = False
        return await self.load_cache()


# ━━━━━━━━━━━━━━━ Global Singleton ━━━━━━━━━━━━━━━

instrument_service = InstrumentService()
