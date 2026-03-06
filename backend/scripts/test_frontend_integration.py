"""
Senior Developer Frontend Integration Test
============================================
Tests every API endpoint exactly as the frontend calls them.
Simulates: Login → Connect → Search → Portfolio → AI → News → Backtest → Trades → Watchlists
"""
import requests
import json
import sys

BASE = "http://localhost:8000/api"
PASS = 0
FAIL = 0
WARN = 0

def test(name, condition, detail=""):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  ✅ {name}")
    else:
        FAIL += 1
        print(f"  ❌ {name} — {detail}")

def warn(name, detail=""):
    global WARN
    WARN += 1
    print(f"  ⚠️  {name} — {detail}")

print("=" * 65)
print("  ALGOTRADE PRO — FRONTEND INTEGRATION TEST")
print("  Simulates every API call the React frontend makes")
print("=" * 65)

# ━━━━━━━━━━━━━━━ 1. AUTH ━━━━━━━━━━━━━━━
print("\n📋 1. AUTHENTICATION")
r = requests.post(f"{BASE}/auth/login", json={"username": "admin", "password": "admin1234"})
token = None
if r.status_code == 200:
    data = r.json().get("data", {})
    token = data.get("access_token")
test("POST /auth/login", token is not None, f"status={r.status_code}")

if not token:
    print("\n❌ Cannot continue without auth. Exiting.")
    sys.exit(1)

h = {"Authorization": f"Bearer {token}"}

# ━━━━━━━━━━━━━━━ 2. BROKER CONNECT ━━━━━━━━━━━━━━━
print("\n📋 2. BROKER CONNECTION (auto-reconnect simulation)")

# 2a. Check status first (Dashboard useEffect does this)
r = requests.get(f"{BASE}/broker/status", headers=h)
status_data = r.json().get("data", {})
test("GET /broker/status", r.status_code == 200, f"status={r.status_code}")

# 2b. Connect if not connected (Dashboard auto-reconnect)
if not status_data.get("connected"):
    r = requests.post(f"{BASE}/broker/connect", json={"broker": "angel"}, headers=h)
    test("POST /broker/connect (angel)", r.status_code == 200, f"{r.status_code}: {r.text[:100]}")
else:
    test("Already connected", True)

# 2c. Verify connected
r = requests.get(f"{BASE}/broker/status", headers=h)
connected = r.json().get("data", {}).get("connected", False)
test("Broker is connected", connected, f"data={r.json().get('data')}")

# ━━━━━━━━━━━━━━━ 3. SEARCH (Dashboard search bar) ━━━━━━━━━━━━━━━
print("\n📋 3. SEARCH (as frontend calls it)")

# 3a. Broker search — secureGet('/broker/search?q=RELIANCE')
r = requests.get(f"{BASE}/broker/search?q=RELIANCE", headers=h)
search_data = r.json().get("data", [])
test("GET /broker/search?q=RELIANCE", r.status_code == 200 and len(search_data) > 0,
     f"status={r.status_code}, results={len(search_data)}")

# 3b. Symbol token lookup — secureGet('/broker/token?symbol=RELIANCE-EQ')
r = requests.get(f"{BASE}/broker/token?symbol=RELIANCE-EQ", headers=h)
token_data = r.json().get("data", "")
test("GET /broker/token?symbol=RELIANCE-EQ", r.status_code == 200 and token_data,
     f"status={r.status_code}, token={token_data}")

# ━━━━━━━━━━━━━━━ 4. REAL PORTFOLIO ━━━━━━━━━━━━━━━
print("\n📋 4. REAL PORTFOLIO (RealPortfolio.tsx)")

# 4a. Holdings — secureGet('/broker/holdings')
r = requests.get(f"{BASE}/broker/holdings", headers=h)
holdings = r.json().get("data", [])
test("GET /broker/holdings", r.status_code == 200, f"status={r.status_code}, count={len(holdings)}")

# 4b. Positions — secureGet('/broker/positions')
r = requests.get(f"{BASE}/broker/positions", headers=h)
positions = r.json().get("data", [])
test("GET /broker/positions", r.status_code == 200, f"status={r.status_code}, count={len(positions)}")

# 4c. Orders — secureGet('/broker/orders')
r = requests.get(f"{BASE}/broker/orders", headers=h)
test("GET /broker/orders", r.status_code == 200, f"status={r.status_code}")

# 4d. Risk status (used by getFunds) — secureGet('/broker/risk/status')
r = requests.get(f"{BASE}/broker/risk/status", headers=h)
test("GET /broker/risk/status", r.status_code == 200, f"status={r.status_code}")

# ━━━━━━━━━━━━━━━ 5. AI ANALYSIS ━━━━━━━━━━━━━━━
print("\n📋 5. AI & ANALYSIS (gemini.ts calls)")

# 5a. Technical analysis — secureGet('/ai/analyze/RELIANCE')
r = requests.get(f"{BASE}/ai/analyze/RELIANCE", headers=h)
ai_data = r.json().get("data", {})
test("GET /ai/analyze/RELIANCE", r.status_code == 200 and ai_data.get("overall_signal"),
     f"status={r.status_code}, signal={ai_data.get('overall_signal', 'N/A')}")

# Check response has all fields frontend expects
expected_fields = ["indicators", "signals", "overall_signal", "signal_strength", "support", "resistance", "summary"]
missing = [f for f in expected_fields if f not in ai_data]
test("Analysis response has all fields", len(missing) == 0, f"missing: {missing}")

# 5b. AI prediction — secureGet('/ai/predict/RELIANCE')
r = requests.get(f"{BASE}/ai/predict/RELIANCE", headers=h)
pred_data = r.json().get("data", {})
test("GET /ai/predict/RELIANCE", r.status_code == 200, f"status={r.status_code}")

# Check prediction fields
pred_fields = ["symbol", "signal", "confidence", "target_price", "stop_loss", "reasoning"]
pred_missing = [f for f in pred_fields if f not in pred_data]
test("Prediction has all fields", len(pred_missing) == 0, f"missing: {pred_missing}")

# 5c. News — secureGet('/ai/news/RELIANCE?with_sentiment=true')
r = requests.get(f"{BASE}/ai/news/RELIANCE?with_sentiment=true", headers=h)
news_data = r.json().get("data", {})
test("GET /ai/news/RELIANCE", r.status_code == 200, f"status={r.status_code}")

# 5d. Market indices — secureGet('/ai/market/indices')
r = requests.get(f"{BASE}/ai/market/indices", headers=h)
test("GET /ai/market/indices", r.status_code == 200, f"status={r.status_code}")

# 5e. Stock picks — secureGet('/ai/picks')
r = requests.get(f"{BASE}/ai/picks", headers=h)
test("GET /ai/picks", r.status_code == 200, f"status={r.status_code}")

# 5f. Analytics — secureGet('/ai/analytics')
r = requests.get(f"{BASE}/ai/analytics", headers=h)
test("GET /ai/analytics", r.status_code == 200, f"status={r.status_code}")

# ━━━━━━━━━━━━━━━ 6. BACKTEST ━━━━━━━━━━━━━━━
print("\n📋 6. BACKTEST (BacktestDashboard.tsx)")

# 6a. Strategies list
r = requests.get(f"{BASE}/backtest/strategies", headers=h)
strats = r.json().get("data", [])
test("GET /backtest/strategies", r.status_code == 200 and len(strats) >= 6,
     f"status={r.status_code}, count={len(strats)}")

# 6b. Run backtest (yfinance)
r = requests.post(f"{BASE}/backtest/run", json={
    "strategy_name": "supertrend_rsi", "symbol": "RELIANCE",
    "cash": 100000, "days": 365, "data_source": "yfinance"
}, headers=h)
bt_data = r.json().get("data", {})
bt_stats = bt_data.get("stats", {})
test("POST /backtest/run", r.status_code == 200 and bt_stats.get("total_trades", 0) > 0,
     f"trades={bt_stats.get('total_trades', 0)}")

# Check backtest response has fields frontend expects
bt_fields = ["stats", "trades", "equity_curve"]
bt_missing = [f for f in bt_fields if f not in bt_data]
test("Backtest response has all fields", len(bt_missing) == 0, f"missing: {bt_missing}")

# ━━━━━━━━━━━━━━━ 7. TRADES (DB) ━━━━━━━━━━━━━━━
print("\n📋 7. TRADES DATABASE (db.ts calls)")

# 7a. Get trades — secureGet('/trades')
r = requests.get(f"{BASE}/trades", headers=h)
test("GET /trades", r.status_code == 200, f"status={r.status_code}")

# ━━━━━━━━━━━━━━━ 8. WATCHLISTS ━━━━━━━━━━━━━━━
print("\n📋 8. WATCHLISTS (WatchlistManager.tsx)")

# 8a. Get watchlists
r = requests.get(f"{BASE}/watchlists", headers=h)
test("GET /watchlists", r.status_code == 200, f"status={r.status_code}")

# 8b. Check /watchlists/names endpoint
r = requests.get(f"{BASE}/watchlists/names", headers=h)
if r.status_code == 200:
    test("GET /watchlists/names", True)
else:
    warn("GET /watchlists/names", f"status={r.status_code} — db.ts calls this, may need adding")

# ━━━━━━━━━━━━━━━ 9. HISTORICAL DATA ━━━━━━━━━━━━━━━
print("\n📋 9. HISTORICAL DATA (charts)")

r = requests.get(f"{BASE}/broker/historical?symbol=RELIANCE&interval=ONE_DAY&days=100", headers=h)
hist_data = r.json().get("data", [])
test("GET /broker/historical", r.status_code == 200 and len(hist_data) > 0,
     f"status={r.status_code}, candles={len(hist_data)}")

# ━━━━━━━━━━━━━━━ 10. FRONTEND SERVER ━━━━━━━━━━━━━━━
print("\n📋 10. FRONTEND")

try:
    r = requests.get("http://localhost:3000", timeout=5)
    test("Vite dev server (port 3000)", r.status_code == 200)
except:
    warn("Vite dev server", "Not running on port 3000")

# ━━━━━━━━━━━━━━━ SUMMARY ━━━━━━━━━━━━━━━
print(f"\n{'=' * 65}")
print(f"  RESULTS: {PASS} passed, {FAIL} failed, {WARN} warnings")
print(f"{'=' * 65}")

if FAIL == 0:
    print("  🎉 ALL TESTS PASSED — Frontend integration is solid!")
else:
    print(f"  ⚠️  {FAIL} issue(s) need fixing")

print()
