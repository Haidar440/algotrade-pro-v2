"""
Module: app/services/async_utils.py
Purpose: Async utilities for offloading blocking work from the event loop.

Provides:
    - run_in_thread(): Offload sync functions to thread pool
    - parallel_batch(): Run coroutines in rate-limited batches
    - cached_async(): TTL cache wrapper for async functions

Architecture notes:
    - Uses asyncio.to_thread() (Python 3.9+) for IO-bound + light CPU work
    - Semaphore-controlled concurrency to respect API rate limits
    - GIL note: pandas/numpy release GIL during C-extension calls (BLAS, etc.),
      so to_thread provides real parallelism for IO waits between numpy ops.
      ProcessPoolExecutor would require pickling DataFrames (expensive) and
      adds ~50-100ms overhead per call — not worth it for <3s tasks.
"""

import asyncio
import functools
import hashlib
import logging
from typing import Any, Callable, Coroutine, Optional, TypeVar

from app.services.cache import TTLCache

logger = logging.getLogger(__name__)

T = TypeVar("T")

# ━━━━━━━━━━━━━━━ Thread Offloading ━━━━━━━━━━━━━━━


async def run_in_thread(fn: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    """Run a blocking function in a thread without blocking the event loop.

    Uses asyncio.to_thread() which runs in the default ThreadPoolExecutor.
    Suitable for:
        - IO-bound work (yfinance, HTTP calls)
        - Light CPU work (pandas-ta analysis, <3s)

    NOT suitable for:
        - Heavy CPU work >10s (use TaskManager for background processing)

    Args:
        fn: Synchronous callable to execute.
        *args, **kwargs: Arguments passed to fn.

    Returns:
        Result of fn(*args, **kwargs).
    """
    if kwargs:
        fn_with_kwargs = functools.partial(fn, *args, **kwargs)
        return await asyncio.to_thread(fn_with_kwargs)
    return await asyncio.to_thread(fn, *args)


# ━━━━━━━━━━━━━━━ Parallel Batch Execution ━━━━━━━━━━━━━━━


async def parallel_batch(
    coros: list[Coroutine],
    batch_size: int = 10,
    semaphore: Optional[asyncio.Semaphore] = None,
    delay_between_batches: float = 0.1,
) -> list[Any]:
    """Execute coroutines in rate-limited parallel batches.

    Controls concurrency to avoid overwhelming external APIs
    (yfinance rate limits, GNews quotas, etc.).

    Args:
        coros: List of coroutines to execute.
        batch_size: Max coroutines per batch.
        semaphore: Optional semaphore for fine-grained concurrency control.
            If provided, overrides batch_size for concurrency limiting.
        delay_between_batches: Seconds to wait between batches (rate limiting).

    Returns:
        List of results in the same order as input coroutines.
        Failed coroutines return None instead of raising.
    """
    results = []

    if semaphore:
        # Semaphore mode: all launched at once, semaphore controls concurrency
        async def _guarded(coro):
            async with semaphore:
                try:
                    return await coro
                except Exception as e:
                    logger.warning("parallel_batch task failed: %s", e)
                    return None

        results = await asyncio.gather(*[_guarded(c) for c in coros])
    else:
        # Batch mode: process in fixed-size chunks
        for i in range(0, len(coros), batch_size):
            batch = coros[i : i + batch_size]
            batch_results = await asyncio.gather(*batch, return_exceptions=True)

            for r in batch_results:
                if isinstance(r, Exception):
                    logger.warning("parallel_batch task failed: %s", r)
                    results.append(None)
                else:
                    results.append(r)

            # Rate limiting pause between batches
            if i + batch_size < len(coros) and delay_between_batches > 0:
                await asyncio.sleep(delay_between_batches)

    return results


# ━━━━━━━━━━━━━━━ Async TTL Cache ━━━━━━━━━━━━━━━


# Module-level caches for different subsystems
_caches: dict[str, TTLCache] = {}


def _get_cache(namespace: str, default_ttl: int = 300) -> TTLCache:
    """Get or create a namespaced TTL cache."""
    if namespace not in _caches:
        _caches[namespace] = TTLCache(default_ttl=default_ttl)
    return _caches[namespace]


async def cached_async(
    namespace: str,
    key: str,
    fn: Callable[..., Coroutine],
    *args: Any,
    ttl: int = 300,
    **kwargs: Any,
) -> Any:
    """Execute an async function with TTL caching.

    Args:
        namespace: Cache namespace (e.g., "market_indices", "fundamentals").
        key: Cache key within the namespace.
        fn: Async function to call on cache miss.
        *args, **kwargs: Arguments for fn.
        ttl: Time-to-live in seconds.

    Returns:
        Cached or freshly computed result.
    """
    cache = _get_cache(namespace, default_ttl=ttl)
    cached = cache.get(key)

    if cached is not None:
        logger.debug("Cache HIT: %s/%s", namespace, key)
        return cached

    logger.debug("Cache MISS: %s/%s — computing...", namespace, key)
    result = await fn(*args, **kwargs)

    if result is not None:
        cache.set(key, result, ttl=ttl)

    return result


def make_cache_key(*parts: Any) -> str:
    """Create a deterministic cache key from multiple parts.

    Args:
        *parts: Strings, numbers, or lists to combine into a key.

    Returns:
        Short hash string suitable as a cache key.
    """
    raw = "|".join(str(p) for p in parts)
    return hashlib.md5(raw.encode()).hexdigest()[:12]

