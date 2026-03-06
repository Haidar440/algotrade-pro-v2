"""Quick test: AI Picks with Angel One broker connected."""
import requests
import time

JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsImV4cCI6OTk5OTk5OTk5OX0.kcGffz0pDZQjCJUEheZV4hhq8MInyo25AIkQfNRnaJ8"
BASE = "http://localhost:8000"
HEADERS = {"Authorization": f"Bearer {JWT}"}

# 1. Check broker status
print("=" * 60)
print("1. BROKER STATUS")
print("=" * 60)
r = requests.get(f"{BASE}/api/broker/status", headers=HEADERS)
data = r.json()
broker_info = data.get("data", {})
print(f"   Connected: {broker_info.get('connected')}")
print(f"   Broker:    {broker_info.get('broker')}")
print(f"   Paper:     {broker_info.get('is_paper')}")

# 2. Test AI Picks (this should now use Angel One → yfinance → demo)
print()
print("=" * 60)
print("2. AI PICKS (capital=₹50,000, top 5)")
print("=" * 60)
start = time.time()
r = requests.get(
    f"{BASE}/api/ai/picks",
    params={"capital": 50000, "top_n": 5},
    headers=HEADERS,
    timeout=300,
)
elapsed = time.time() - start

if r.status_code != 200:
    print(f"   ❌ HTTP {r.status_code}: {r.text[:300]}")
else:
    data = r.json()
    msg = data.get("message", "")
    picks_data = data.get("data", {})
    scanned = picks_data.get("total_scanned", 0)
    found = picks_data.get("picks_found", 0)
    picks = picks_data.get("top_picks", [])

    print(f"   ✅ {msg}")
    print(f"   Scanned: {scanned} stocks | Found: {found} picks")
    print(f"   Time: {elapsed:.1f}s")
    print()
    print(f"   {'#':>2}  {'Symbol':<14} {'Score':>6} {'Rating':<10} {'Price':>8}  {'Entry':>14}  {'SL':>8}  {'Target':>8}  {'R:R':>5}")
    print(f"   {'─'*2}  {'─'*14} {'─'*6} {'─'*10} {'─'*8}  {'─'*14}  {'─'*8}  {'─'*8}  {'─'*5}")

    for i, p in enumerate(picks, 1):
        entry = p.get("entry_range", [0, 0])
        entry_str = f"₹{entry[0]:.0f}-{entry[1]:.0f}" if len(entry) == 2 else "N/A"
        rr = str(p.get("risk_reward", "0"))
        print(
            f"   {i:>2}  {p['symbol']:<14} {p['score']:>5.1f}  {p['rating']:<10} "
            f"₹{p['price']:>7.0f}  {entry_str:>14}  ₹{p.get('stop_loss',0):>6.0f}  "
            f"₹{p.get('target',0):>6.0f}  {rr:>6}"
        )

        # Show reasons
        reasons = p.get("reasons", [])
        if reasons:
            for reason in reasons[:3]:
                print(f"       ↳ {reason}")

    print()
    print("=" * 60)
    print("✅ Angel One integration test complete!")
    print("=" * 60)

# 3. Check screener status
print()
r = requests.get(f"{BASE}/api/ai/screener/status", headers=HEADERS)
if r.status_code == 200:
    ss = r.json().get("data", {})
    print(f"   Screener: source={ss.get('source','?')}, "
          f"candidates={ss.get('total_matches',0)}, "
          f"cached={ss.get('is_cached',False)}")
