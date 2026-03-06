"""Check exactly what each AI endpoint returns — field by field."""
import requests, json

BASE = "http://localhost:8000/api"
t = requests.post(f"{BASE}/auth/login", json={"username":"admin","password":"admin1234"}).json()["data"]["access_token"]
h = {"Authorization": f"Bearer {t}"}

print("=" * 70)
print("  AI SERVICE RESPONSE AUDIT")
print("=" * 70)

# 1. NEWS — what the frontend screenshot shows
print("\n📰 1. NEWS /ai/news/BLISSGVS?with_sentiment=true")
r = requests.get(f"{BASE}/ai/news/BLISSGVS?with_sentiment=true", headers=h)
d = r.json().get("data", {})
print(f"  sentiment: '{d.get('sentiment')}'")
print(f"  sentiment_score: {d.get('sentiment_score')}")
print(f"  sentiment_summary: '{d.get('sentiment_summary', '')[:120]}'")
print(f"  article_count: {d.get('article_count')}")
if d.get("articles"):
    a = d["articles"][0]
    print(f"  First article keys: {list(a.keys())}")
    print(f"  First article title: '{a.get('title','')[:80]}'")

# 2. ANALYZE — StockDetailView
print("\n📊 2. ANALYZE /ai/analyze/RELIANCE")
r = requests.get(f"{BASE}/ai/analyze/RELIANCE", headers=h)
d = r.json().get("data", {})
print(f"  overall_signal: '{d.get('overall_signal')}'")
print(f"  signal_strength: {d.get('signal_strength')}")
print(f"  summary: '{d.get('summary', '')[:120]}'")
print(f"  support: {d.get('support')}, resistance: {d.get('resistance')}")
print(f"  market_condition: '{d.get('market_condition')}'")
print(f"  indicators.current_price: {d.get('indicators',{}).get('current_price')}")

# 3. PREDICT — AiPredictionCard
print("\n🤖 3. PREDICT /ai/predict/RELIANCE")
r = requests.get(f"{BASE}/ai/predict/RELIANCE", headers=h)
d = r.json().get("data", {})
print(f"  signal: '{d.get('signal')}'")
print(f"  confidence: {d.get('confidence')}")
print(f"  target_price: {d.get('target_price')}")
print(f"  stop_loss: {d.get('stop_loss')}")
print(f"  time_horizon: '{d.get('time_horizon')}'")
print(f"  reasoning: '{d.get('reasoning', '')[:120]}'")
print(f"  risk_level: '{d.get('risk_level')}'")
print(f"  key_factors: {d.get('key_factors')}")

# 4. MARKET INDICES — TradingViewTicker / MarketStatusTicker
print("\n📈 4. MARKET INDICES /ai/market/indices")
r = requests.get(f"{BASE}/ai/market/indices", headers=h)
d = r.json().get("data", {})
print(f"  Keys: {list(d.keys()) if isinstance(d, dict) else type(d)}")
if isinstance(d, dict):
    for k, v in d.items():
        print(f"    {k}: {v}")

# 5. PICKS — Stock picks
print("\n🎯 5. PICKS /ai/picks")
r = requests.get(f"{BASE}/ai/picks", headers=h)
d = r.json().get("data", {})
print(f"  Type: {type(d)}")
if isinstance(d, list):
    print(f"  Count: {len(d)}")
    if d: print(f"  First: {json.dumps(d[0], indent=2)[:200]}")
elif isinstance(d, dict):
    print(f"  Keys: {list(d.keys())}")

# 6. ANALYTICS
print("\n📉 6. ANALYTICS /ai/analytics")
r = requests.get(f"{BASE}/ai/analytics", headers=h)
d = r.json().get("data", {})
print(f"  Type: {type(d)}")
if isinstance(d, dict):
    print(f"  Keys: {list(d.keys())}")

print("\n" + "=" * 70)
