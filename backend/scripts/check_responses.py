"""Quick check of backend response shapes vs frontend expectations."""
import requests, json

BASE = "http://localhost:8000/api"
t = requests.post(f"{BASE}/auth/login", json={"username":"admin","password":"admin1234"}).json()["data"]["access_token"]
h = {"Authorization": f"Bearer {t}"}

print("=== AI PREDICT ===")
r = requests.get(f"{BASE}/ai/predict/RELIANCE", headers=h)
d = r.json()["data"]
print(f"Keys: {list(d.keys())}")
print(f"signal={d.get('signal')}, target_price={d.get('target_price')}, stop_loss={d.get('stop_loss')}")
print(f"confidence={d.get('confidence')}, time_horizon={d.get('time_horizon')}")
print(f"reasoning={d.get('reasoning','')[:80]}...")

print("\n=== AI ANALYZE ===")
r = requests.get(f"{BASE}/ai/analyze/RELIANCE", headers=h)
d = r.json()["data"]
print(f"Keys: {list(d.keys())}")
print(f"indicators keys: {list(d.get('indicators',{}).keys())}")
print(f"signals keys: {list(d.get('signals',{}).keys())}")

print("\n=== BACKTEST (trades+equity_curve) ===")
r = requests.post(f"{BASE}/backtest/run", json={"strategy_name":"supertrend_rsi","symbol":"RELIANCE","cash":100000,"days":365,"data_source":"yfinance"}, headers=h)
d = r.json()["data"]
print(f"Keys: {list(d.keys())}")
print(f"trades count: {len(d.get('trades',[]))}")
if d.get("trades"):
    print(f"First trade keys: {list(d['trades'][0].keys())}")
    print(f"First trade: {d['trades'][0]}")
print(f"equity_curve count: {len(d.get('equity_curve',[]))}")
if d.get("equity_curve"):
    print(f"First point: {d['equity_curve'][0]}")
    print(f"Last point: {d['equity_curve'][-1]}")

print("\n=== WATCHLISTS ===")
r = requests.get(f"{BASE}/watchlists", headers=h)
print(f"Status: {r.status_code}, data type: {type(r.json().get('data'))}")

print("\n=== TRADES ===")
r = requests.get(f"{BASE}/trades", headers=h)
trades = r.json().get("data", [])
print(f"Status: {r.status_code}, count: {len(trades)}")
if trades:
    print(f"First trade keys: {list(trades[0].keys())}")

print("\n=== HOLDINGS ===")
r = requests.get(f"{BASE}/broker/holdings", headers=h)
holdings = r.json().get("data", [])
print(f"Status: {r.status_code}, count: {len(holdings)}")
if holdings:
    print(f"First holding keys: {list(holdings[0].keys())}")

print("\n=== HISTORICAL ===")
r = requests.get(f"{BASE}/broker/historical?symbol=RELIANCE&interval=ONE_DAY&days=10", headers=h)
hist = r.json().get("data", [])
print(f"Status: {r.status_code}, count: {len(hist)}")
if hist:
    print(f"First candle keys: {list(hist[0].keys())}")

print("\n=== NEWS ===")
r = requests.get(f"{BASE}/ai/news/RELIANCE?with_sentiment=true", headers=h)
d = r.json().get("data", {})
print(f"Keys: {list(d.keys()) if isinstance(d, dict) else type(d)}")
