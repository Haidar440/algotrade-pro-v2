"""Test the full dynamic screener pipeline end-to-end."""
import requests
import time

JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsImV4cCI6OTk5OTk5OTk5OX0.kcGffz0pDZQjCJUEheZV4hhq8MInyo25AIkQfNRnaJ8"
HEADERS = {"Authorization": f"Bearer {JWT}"}
BASE = "http://localhost:8000"

# ── Step 1: Trigger AI Picks (this will call TradingView screener) ──
print("=" * 60)
print("  STEP 1: Calling /api/ai/picks (dynamic TradingView scan)")
print("=" * 60)
start = time.time()
r = requests.get(
    f"{BASE}/api/ai/picks?capital=100000&top_n=10",
    headers=HEADERS,
    timeout=180,
)
elapsed = time.time() - start
print(f"  Status: {r.status_code}")
print(f"  Time: {elapsed:.1f}s")

if r.status_code == 200:
    d = r.json().get("data", {})
    print(f"  Total scanned: {d.get('total_scanned', 0)}")
    print(f"  Picks found: {d.get('picks_found', 0)}")
    picks = d.get("top_picks", [])
    print()
    print(f"  {'Symbol':<15} {'Score':>6} {'Rating':<12} {'Price':>10}")
    print(f"  {'-'*15} {'-'*6} {'-'*12} {'-'*10}")
    for p in picks[:10]:
        print(f"  {p['symbol']:<15} {p['score']:>6.1f} {p['rating']:<12} {p['price']:>10.2f}")
    
    # Show reasons for top pick
    if picks:
        top = picks[0]
        print(f"\n  Top pick reasons ({top['symbol']}):")
        for reason in top.get("reasons", []):
            print(f"    • {reason}")
else:
    print(f"  ERROR: {r.text[:300]}")

# ── Step 2: Check screener status (should be cached now) ──
print()
print("=" * 60)
print("  STEP 2: Checking /api/ai/screener/status (should be cached)")
print("=" * 60)
r2 = requests.get(f"{BASE}/api/ai/screener/status", headers=HEADERS, timeout=10)
print(f"  Status: {r2.status_code}")
if r2.status_code == 200:
    status = r2.json().get("data", {})
    print(f"  Cached: {status.get('cached')}")
    print(f"  Source: {status.get('source')}")
    print(f"  Total matches: {status.get('total_matches')}")
    print(f"  Candidates returned: {status.get('candidates_returned')}")
    print(f"  Scan time: {status.get('scan_time_ms')}ms")
    print(f"  Cache age: {status.get('cache_age_seconds')}s")
    top5 = status.get("top_5", [])
    if top5:
        print(f"\n  Top 5 swing candidates (by relative volume):")
        for c in top5:
            print(f"    {c['symbol']:<15} Close={c.get('close','?'):>10} RelVol={c.get('rel_volume','?')}x RSI={c.get('rsi','?')}")

print("\n✅ Full pipeline test complete!")
