"""Quick test: verify dynamic screener is live on running server."""
import requests
import json
import time

BASE = "http://localhost:8000"
TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsImV4cCI6OTk5OTk5OTk5OX0.kcGffz0pDZQjCJUEheZV4hhq8MInyo25AIkQfNRnaJ8"
H = {"Authorization": f"Bearer {TOKEN}"}

# 1) Screener status
print("=" * 60)
print("1. SCREENER STATUS")
r = requests.get(f"{BASE}/api/ai/screener/status", headers=H)
print(f"   {r.status_code}: {json.dumps(r.json().get('data', {}), indent=4)}")

# 2) Trigger picks scan
print("\n" + "=" * 60)
print("2. AI PICKS (dynamic scan) — this takes ~60-90s ...")
start = time.time()
r = requests.get(f"{BASE}/api/ai/picks", headers=H, params={"capital": 100000, "top_n": 10}, timeout=180)
elapsed = time.time() - start
print(f"   Status: {r.status_code} | Time: {elapsed:.1f}s")

if r.status_code == 200:
    data = r.json().get("data", {})
    print(f"   Scanned: {data.get('total_scanned')} stocks (DYNAMIC!)")
    print(f"   Picks: {data.get('picks_found')}")
    for p in data.get("top_picks", []):
        reasons = "; ".join(p.get("reasons", [])[:2])
        print(f"   {p['symbol']:<15} Score={p['score']:>5.1f} {p['rating']:<10} ₹{p['price']:>9.2f}  [{reasons}]")
else:
    print(f"   ERROR: {r.text[:300]}")

# 3) Check cache populated
print("\n" + "=" * 60)
print("3. SCREENER STATUS (post-scan — should be cached)")
r = requests.get(f"{BASE}/api/ai/screener/status", headers=H)
d = r.json().get("data", {})
print(f"   Cached: {d.get('cached')} | Source: {d.get('source')} | Matches: {d.get('total_matches')} | Scan: {d.get('scan_time_ms')}ms")
for t in d.get("top_5", []):
    print(f"   → {t['symbol']}: ₹{t['close']}, RelVol={t['rel_volume']}x, RSI={t['rsi']}")

print("\n✅ DYNAMIC SWING SCREENER IS LIVE!" if d.get("cached") else "\n❌ Something went wrong")
