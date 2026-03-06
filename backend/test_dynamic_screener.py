"""Test the dynamic swing screener integration with /api/ai/picks."""
import requests
import json
import time

BASE = "http://localhost:8000"
TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsImV4cCI6OTk5OTk5OTk5OX0.kcGffz0pDZQjCJUEheZV4hhq8MInyo25AIkQfNRnaJ8"
HEADERS = {"Authorization": f"Bearer {TOKEN}"}


def test_screener_status():
    """Test the screener diagnostic endpoint."""
    print("=" * 60)
    print("1. SCREENER STATUS (before scan)")
    print("=" * 60)
    r = requests.get(f"{BASE}/api/ai/screener/status", headers=HEADERS)
    print(f"   Status: {r.status_code}")
    print(f"   Data: {json.dumps(r.json().get('data', {}), indent=2)}")
    return r.status_code == 200


def test_ai_picks():
    """Test the AI picks endpoint with dynamic screener."""
    print("\n" + "=" * 60)
    print("2. AI PICKS (dynamic swing candidates)")
    print("=" * 60)
    start = time.time()
    r = requests.get(
        f"{BASE}/api/ai/picks",
        headers=HEADERS,
        params={"capital": 100000, "top_n": 10},
        timeout=120,
    )
    elapsed = time.time() - start
    print(f"   Status: {r.status_code}")
    print(f"   Time: {elapsed:.1f}s")

    if r.status_code != 200:
        print(f"   ERROR: {r.text[:500]}")
        return False

    data = r.json().get("data", {})
    print(f"   Total scanned: {data.get('total_scanned', '?')}")
    print(f"   Picks found: {data.get('picks_found', '?')}")

    picks = data.get("top_picks", [])
    print(f"\n   {'Symbol':<15} {'Score':>6} {'Rating':<10} {'Price':>10}")
    print(f"   {'-'*15} {'-'*6} {'-'*10} {'-'*10}")
    for p in picks:
        print(
            f"   {p['symbol']:<15} {p['score']:>6.1f} {p['rating']:<10} "
            f"₹{p['price']:>9.2f}"
        )

    # Print reasons for top 3
    print("\n   TOP 3 REASONS:")
    for p in picks[:3]:
        reasons = p.get("reasons", [])[:3]
        print(f"   {p['symbol']}: {'; '.join(reasons)}")

    return len(picks) > 0


def test_screener_status_after():
    """Test screener status after scan to verify caching."""
    print("\n" + "=" * 60)
    print("3. SCREENER STATUS (after scan — should be cached)")
    print("=" * 60)
    r = requests.get(f"{BASE}/api/ai/screener/status", headers=HEADERS)
    data = r.json().get("data", {})
    print(f"   Cached: {data.get('cached')}")
    print(f"   Source: {data.get('source')}")
    print(f"   Total matches: {data.get('total_matches')}")
    print(f"   Candidates: {data.get('candidates_returned')}")
    print(f"   Scan time: {data.get('scan_time_ms')}ms")
    top5 = data.get("top_5", [])
    for t in top5:
        print(
            f"   → {t['symbol']}: ₹{t['close']}, "
            f"RelVol={t['rel_volume']}x, RSI={t['rsi']}"
        )
    return data.get("cached") is True


if __name__ == "__main__":
    results = []
    results.append(("Screener Status (pre)", test_screener_status()))
    results.append(("AI Picks (dynamic)", test_ai_picks()))
    results.append(("Screener Status (post)", test_screener_status_after()))

    print("\n" + "=" * 60)
    print("RESULTS SUMMARY")
    print("=" * 60)
    for name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"   {status}  {name}")
