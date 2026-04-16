"""
Async Architecture Verification Tests
======================================
Run: python tests/test_async_perf.py

Tests:
    1. Event loop blocking detection
    2. Before/after latency benchmarking
    3. Concurrent heavy + light request load testing
    4. TaskManager 202 polling behavior
    5. Thread pool saturation detection
    6. Cache hit/miss monitoring
"""

import asyncio
import json
import logging
import statistics
import time
import os
from typing import Optional

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("async_test")

# ━━━━━━━━━━━━ Config ━━━━━━━━━━━━
BASE = "http://localhost:8000"
TOKEN = os.environ.get("ALGOTRADE_TOKEN", "")


def _headers():
    return {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}


async def _auto_login():
    """Prompt for credentials and get JWT token from /api/auth/login."""
    global TOKEN
    import aiohttp

    username = input("  Username: ").strip()
    password = input("  Password: ").strip()

    async with aiohttp.ClientSession() as session:
        resp = await session.post(
            f"{BASE}/api/auth/login",
            json={"username": username, "password": password},
        )
        data = await resp.json()

        if resp.status == 200 and data.get("success"):
            TOKEN = data["data"]["access_token"]
            log.info("  ✅ Login successful — token obtained")
            return True
        else:
            log.error("  ❌ Login failed: %s", data.get("message", resp.status))
            return False


# ━━━━━━━━━━━━ 1. Event Loop Blocking Detection ━━━━━━━━━━━━

async def test_event_loop_not_blocked():
    """Fire a heavy request + light request simultaneously.
    If event loop is free, light request responds in <500ms
    even while heavy request is running.
    """
    import aiohttp

    log.info("=" * 60)
    log.info("TEST 1: Event Loop Blocking Detection")
    log.info("=" * 60)

    async with aiohttp.ClientSession(headers=_headers()) as session:
        # Fire heavy + light concurrently
        t0 = time.monotonic()

        heavy = session.get(f"{BASE}/api/ai/analyze/RELIANCE")
        light = session.get(f"{BASE}/api/backtest/strategies")

        light_resp, heavy_resp = await asyncio.gather(light, heavy)
        t_light = time.monotonic() - t0

        light_status = light_resp.status
        heavy_status = heavy_resp.status

        await light_resp.read()
        await heavy_resp.read()

    log.info(f"  Light endpoint (/strategies): {t_light*1000:.0f}ms (status={light_status})")
    log.info(f"  Heavy endpoint (/ai/analyze):     running concurrently (status={heavy_status})")

    if t_light < 0.5:
        log.info("  ✅ PASS — Event loop NOT blocked (light responded in <500ms)")
    else:
        log.info("  ❌ FAIL — Event loop BLOCKED (light took >500ms)")

    return t_light < 0.5


# ━━━━━━━━━━━━ 2. Latency Benchmarking ━━━━━━━━━━━━

async def test_latency_benchmark():
    """Measure p50/p95/p99 latency for key endpoints."""
    import aiohttp

    log.info("=" * 60)
    log.info("TEST 2: Latency Benchmarking")
    log.info("=" * 60)

    endpoints = [
        ("GET", "/api/ai/market/indices", None),
        ("GET", "/api/ai/analyze/RELIANCE", None),
    ]

    async with aiohttp.ClientSession(headers=_headers()) as session:
        for method, path, body in endpoints:
            latencies = []
            for i in range(5):
                t0 = time.monotonic()
                if method == "GET":
                    resp = await session.get(f"{BASE}{path}")
                else:
                    resp = await session.post(f"{BASE}{path}", json=body)
                await resp.read()
                latencies.append(time.monotonic() - t0)

            latencies_ms = [l * 1000 for l in latencies]
            p50 = statistics.median(latencies_ms)
            p95 = sorted(latencies_ms)[int(len(latencies_ms) * 0.95)]
            avg = statistics.mean(latencies_ms)

            log.info(f"  {method} {path}")
            log.info(f"    avg={avg:.0f}ms  p50={p50:.0f}ms  p95={p95:.0f}ms  samples={len(latencies_ms)}")


# ━━━━━━━━━━━━ 3. Concurrent Load Test ━━━━━━━━━━━━

async def test_concurrent_load():
    """Fire 1 heavy + 5 light requests simultaneously.
    All light requests should respond in <2s.
    """
    import aiohttp

    log.info("=" * 60)
    log.info("TEST 3: Concurrent Heavy + Light Load Test")
    log.info("=" * 60)

    async with aiohttp.ClientSession(headers=_headers()) as session:
        t0 = time.monotonic()

        # 1 heavy request
        heavy_coros = [session.get(f"{BASE}/api/ai/analyze/TCS")]

        # 5 light requests
        light_coros = [session.get(f"{BASE}/api/backtest/strategies") for _ in range(5)]

        results = await asyncio.gather(*(light_coros + heavy_coros), return_exceptions=True)

        light_times = []
        for i, r in enumerate(results[:5]):
            if not isinstance(r, Exception):
                await r.read()

        t_total = time.monotonic() - t0

    log.info(f"  Total wall time: {t_total*1000:.0f}ms")
    log.info(f"  All {len(results)} requests completed")
    log.info(f"  {'✅ PASS' if t_total < 10 else '❌ FAIL'} — concurrent execution")


# ━━━━━━━━━━━━ 4. TaskManager Polling Test ━━━━━━━━━━━━

async def test_optimize_polling():
    """Test the 202 + status polling pattern for /backtest/optimize."""
    import aiohttp

    log.info("=" * 60)
    log.info("TEST 4: TaskManager 202 Polling (/backtest/optimize)")
    log.info("=" * 60)

    body = {
        "strategy_name": "supertrend_rsi",
        "symbol": "RELIANCE",
        "days": 180,
        "maximize": "Return [%]",
    }

    async with aiohttp.ClientSession(headers=_headers()) as session:
        # Submit optimization
        t0 = time.monotonic()
        resp = await session.post(f"{BASE}/api/backtest/optimize", json=body)
        submit_time = (time.monotonic() - t0) * 1000
        data = await resp.json()

        log.info(f"  Submit: {resp.status} in {submit_time:.0f}ms")
        log.info(f"  Response: {json.dumps(data, indent=2)[:200]}")

        if resp.status != 202:
            log.info("  ❌ FAIL — Expected 202 Accepted")
            return False

        task_id = data.get("task_id")
        if not task_id:
            log.info("  ❌ FAIL — No task_id in response")
            return False

        log.info(f"  ✅ Got task_id: {task_id}")

        # Poll for status
        max_polls = 60
        for i in range(max_polls):
            await asyncio.sleep(2)
            status_resp = await session.get(f"{BASE}/api/backtest/optimize/status/{task_id}")
            status_data = await status_resp.json()

            http_status = status_resp.status
            status = status_data.get("status", "unknown")
            progress = status_data.get("progress", 0)
            stage = status_data.get("stage", "")

            # Show HTTP code + raw response on first unexpected result
            if status == "unknown" and i < 3:
                log.info(f"  Poll {i+1}: HTTP {http_status}, raw={json.dumps(status_data)[:300]}")
            else:
                log.info(f"  Poll {i+1}: status={status}, progress={progress}%, stage={stage}")


            if status == "completed":
                result = status_data.get("data", {})
                log.info(f"  ✅ PASS — Optimization completed!")
                log.info(f"    Return: {result.get('stats', {}).get('return_pct', 'N/A')}%")
                log.info(f"    Best params: {result.get('best_params', {})}")
                return True
            elif status == "failed":
                log.info(f"  ❌ FAIL — Optimization failed: {status_data.get('error')}")
                return False
            elif status == "not_found":
                log.info(f"  ❌ Task disappeared from TaskManager! HTTP {http_status}")
                log.info(f"     This means the task was cleaned up or never stored correctly.")
                return False

        log.info("  ❌ FAIL — Timed out after 120s polling")
        return False


# ━━━━━━━━━━━━ 5. Thread Pool Saturation Check ━━━━━━━━━━━━

async def test_threadpool_saturation():
    """Fire many concurrent heavy requests to check for thread exhaustion.
    Default ThreadPoolExecutor has min(32, os.cpu_count()+4) threads.
    """
    import aiohttp

    log.info("=" * 60)
    log.info("TEST 5: Thread Pool Saturation Detection")
    log.info("=" * 60)

    concurrent = 10
    log.info(f"  Firing {concurrent} concurrent /ai/analyze requests...")

    async with aiohttp.ClientSession(headers=_headers()) as session:
        symbols = ["RELIANCE", "TCS", "INFY", "HDFC", "ICICI",
                    "SBIN", "WIPRO", "ITC", "LT", "HCLTECH"]

        t0 = time.monotonic()
        coros = [session.get(f"{BASE}/api/ai/analyze/{s}") for s in symbols[:concurrent]]
        results = await asyncio.gather(*coros, return_exceptions=True)
        t_total = time.monotonic() - t0

        successes = sum(1 for r in results if not isinstance(r, Exception) and r.status == 200)
        for r in results:
            if not isinstance(r, Exception):
                await r.read()

    log.info(f"  Total wall time: {t_total*1000:.0f}ms")
    log.info(f"  Successes: {successes}/{concurrent}")
    log.info(f"  Avg per request: {t_total/concurrent*1000:.0f}ms (if serial: {t_total*1000:.0f}ms)")

    # If parallel, wall time should be << concurrent * single_request_time
    if t_total < 30:
        log.info("  ✅ PASS — No thread pool saturation detected")
    else:
        log.info("  ⚠️  WARNING — Possible thread pool saturation (>30s wall time)")


# ━━━━━━━━━━━━ 6. Cache Hit/Miss Monitor ━━━━━━━━━━━━

async def test_cache_behavior():
    """Call cached endpoints twice — second call should be near-instant."""
    import aiohttp

    log.info("=" * 60)
    log.info("TEST 6: Cache Hit/Miss Rates")
    log.info("=" * 60)

    endpoints = [
        ("/api/ai/market/indices", "Market indices (60s TTL)"),
    ]

    async with aiohttp.ClientSession(headers=_headers()) as session:
        for path, label in endpoints:
            # First call (MISS)
            t0 = time.monotonic()
            r1 = await session.get(f"{BASE}{path}")
            await r1.read()
            t_miss = (time.monotonic() - t0) * 1000

            # Second call (HIT)
            t0 = time.monotonic()
            r2 = await session.get(f"{BASE}{path}")
            await r2.read()
            t_hit = (time.monotonic() - t0) * 1000

            speedup = t_miss / t_hit if t_hit > 0 else float("inf")
            is_cached = t_hit < t_miss * 0.5

            log.info(f"  {label}")
            log.info(f"    1st call (MISS): {t_miss:.0f}ms")
            log.info(f"    2nd call (HIT):  {t_hit:.0f}ms")
            log.info(f"    Speedup: {speedup:.1f}x")
            log.info(f"    {'✅ PASS — Cache working' if is_cached else '⚠️  Cache not detected (may be first run)'}")


# ━━━━━━━━━━━━ Runner ━━━━━━━━━━━━

async def main():
    log.info("\n🔍 ASYNC ARCHITECTURE VERIFICATION SUITE")
    log.info(f"   Target: {BASE}")
    log.info(f"   Token: {'SET' if TOKEN else 'NOT SET — set TOKEN variable!'}\n")

    if not TOKEN:
        log.info("No token found. Logging in...\n")
        if not await _auto_login():
            return
        print()

    await test_event_loop_not_blocked()
    print()
    await test_latency_benchmark()
    print()
    await test_concurrent_load()
    print()
    await test_cache_behavior()
    print()
    await test_threadpool_saturation()
    print()
    await test_optimize_polling()

    log.info("\n✅ All tests completed. Review results above.")


if __name__ == "__main__":
    asyncio.run(main())
