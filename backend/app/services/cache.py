"""
Module: app/services/cache.py
Purpose: Simple in-memory TTL cache to avoid hitting external APIs repeatedly.

Used by:
  - InstrumentService: 24h cache for instrument master
  - Market indices: 60s cache
  - Stock analysis: 5min per symbol
  - News: 15min per symbol
"""

import logging
import threading
import time
from typing import Any, Optional

logger = logging.getLogger(__name__)


class TTLCache:
    """Thread-safe in-memory cache with per-key TTL.

    Usage:
        cache = TTLCache(default_ttl=300)
        cache.set("key", value)
        val = cache.get("key")  # None if expired
    """

    def __init__(self, default_ttl: int = 300) -> None:
        """Initialize cache.

        Args:
            default_ttl: Default time-to-live in seconds.
        """
        self._store: dict[str, tuple[Any, float]] = {}
        self._default_ttl = default_ttl
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[Any]:
        """Get value if key exists and hasn't expired."""
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            value, expires_at = entry
            if time.time() > expires_at:
                del self._store[key]
                return None
            return value

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Set a value with optional custom TTL."""
        with self._lock:
            expires_at = time.time() + (ttl if ttl is not None else self._default_ttl)
            self._store[key] = (value, expires_at)

    def delete(self, key: str) -> None:
        """Remove a key from the cache."""
        with self._lock:
            self._store.pop(key, None)

    def clear(self) -> None:
        """Clear all cached entries."""
        with self._lock:
            self._store.clear()

    def cleanup(self) -> int:
        """Remove all expired entries. Returns count of removed items."""
        now = time.time()
        with self._lock:
            expired = [k for k, (_, exp) in self._store.items() if now > exp]
            for k in expired:
                del self._store[k]
            return len(expired)

    @property
    def size(self) -> int:
        """Number of entries (including potentially expired ones)."""
        return len(self._store)

    def stats(self) -> dict:
        """Return cache statistics."""
        now = time.time()
        with self._lock:
            total = len(self._store)
            active = sum(1 for _, exp in self._store.values() if now <= exp)
        return {
            "total_entries": total,
            "active_entries": active,
            "expired_entries": total - active,
            "default_ttl": self._default_ttl,
        }


# ━━━━━━━━━━━━━━━ Global Cache Instances ━━━━━━━━━━━━━━━

# Instrument cache: 24h TTL (refreshed daily)
instrument_cache = TTLCache(default_ttl=86400)

# Market data cache: 60s TTL
market_cache = TTLCache(default_ttl=60)

# Analysis cache: 5min TTL
analysis_cache = TTLCache(default_ttl=300)

# News cache: 15min TTL
news_cache = TTLCache(default_ttl=900)
