"""
Quick live test of Tavily-powered AI endpoints.
Tests news, market indices, and verifies published_date + tavily_answer flow.
"""
import requests
import json
import sys

BASE = "http://localhost:8000/api"

def get_token():
    """Login and get JWT token."""
    r = requests.post(f"{BASE}/auth/login", json={
        "username": "admin",
        "password": "admin1234"
    })
    if r.status_code != 200:
        print(f"LOGIN FAILED: {r.status_code} {r.text[:200]}")
        sys.exit(1)
    token = r.json()["data"]["access_token"]
    print(f"[OK] Login successful, token: {token[:20]}...")
    return token

def test_news(token: str, symbol: str = "RELIANCE"):
    """Test /ai/news/{symbol} endpoint."""
    print(f"\n{'='*60}")
    print(f"TEST: /ai/news/{symbol}?with_sentiment=true")
    print(f"{'='*60}")
    
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{BASE}/ai/news/{symbol}", headers=headers, params={"with_sentiment": "true"})
    
    print(f"Status: {r.status_code}")
    if r.status_code != 200:
        print(f"ERROR: {r.text[:300]}")
        return
    
    data = r.json()["data"]
    
    print(f"\n--- Response Fields ---")
    print(f"  symbol: {data.get('symbol')}")
    print(f"  article_count: {data.get('article_count')}")
    print(f"  sentiment: {data.get('sentiment')}")
    print(f"  sentiment_score: {data.get('sentiment_score')}")
    
    tavily_answer = data.get("tavily_answer")
    if tavily_answer:
        print(f"\n  [OK] tavily_answer present ({len(tavily_answer)} chars)")
        print(f"  Preview: {tavily_answer[:200]}...")
    else:
        print(f"  [FAIL] tavily_answer: MISSING")
    
    summary = data.get("sentiment_summary")
    if summary and summary != "Sentiment analysis unavailable":
        print(f"\n  [OK] sentiment_summary: {summary[:200]}...")
    else:
        print(f"  [WARN] sentiment_summary: {summary}")
    
    print(f"\n--- Articles ---")
    for i, a in enumerate(data.get("articles", [])):
        pub = a.get("published_date", "NONE")
        title = a["title"][:70]
        print(f"  {i+1}. {title}")
        print(f"     published_date: {pub}")
        print(f"     score: {a.get('score', 'N/A')}")
        print(f"     url: {a.get('url', 'N/A')[:80]}")
        print()

def test_market_indices(token: str):
    """Test /ai/market/indices endpoint."""
    print(f"\n{'='*60}")
    print(f"TEST: /ai/market/indices")
    print(f"{'='*60}")
    
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{BASE}/ai/market/indices", headers=headers)
    
    print(f"Status: {r.status_code}")
    if r.status_code != 200:
        print(f"ERROR: {r.text[:300]}")
        return
    
    data = r.json()["data"]
    
    # Check indices (keys: nifty, sensex, bankNifty)
    for key in ["nifty", "sensex", "bankNifty"]:
        idx = data.get(key, {})
        price = idx.get("price", 0)
        change = idx.get("changePercent", 0)
        print(f"    {key}: {price:,.2f} ({change:+.2f}%)")
    
    # Check market summary (from Tavily)
    summary = data.get("market_summary", "")
    if summary and len(summary) > 20:
        print(f"\n  [OK] market_summary ({len(summary)} chars): {summary[:200]}...")
    else:
        print(f"\n  [WARN] market_summary: {summary or 'EMPTY'}")

def test_analyze(token: str, symbol: str = "TCS"):
    """Test /ai/analyze/{symbol} endpoint."""
    print(f"\n{'='*60}")
    print(f"TEST: /ai/analyze/{symbol}")
    print(f"{'='*60}")
    
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{BASE}/ai/analyze/{symbol}", headers=headers)
    
    print(f"Status: {r.status_code}")
    if r.status_code != 200:
        print(f"ERROR: {r.text[:300]}")
        return
    
    data = r.json()["data"]
    print(f"  recommendation: {data.get('recommendation')}")
    print(f"  confidence: {data.get('confidence')}")
    print(f"  reasoning: {(data.get('reasoning') or 'NONE')[:200]}")

def test_predict(token: str, symbol: str = "INFY"):
    """Test /ai/predict/{symbol} endpoint."""
    print(f"\n{'='*60}")
    print(f"TEST: /ai/predict/{symbol}")
    print(f"{'='*60}")
    
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{BASE}/ai/predict/{symbol}", headers=headers)
    
    print(f"Status: {r.status_code}")
    if r.status_code != 200:
        print(f"ERROR: {r.text[:300]}")
        return
    
    data = r.json()["data"]
    print(f"  direction: {data.get('direction')}")
    print(f"  target_price: {data.get('target_price')}")
    print(f"  stop_loss: {data.get('stop_loss')}")
    print(f"  confidence: {data.get('confidence')}")
    print(f"  reasoning: {(data.get('reasoning') or 'NONE')[:200]}")

if __name__ == "__main__":
    print("=" * 60)
    print("  TAVILY v2 INTEGRATION LIVE TEST")
    print("  (Sub-queries + Post-filtering + Advanced answer)")
    print("=" * 60)
    
    token = get_token()
    
    # Test problematic stocks that previously returned irrelevant results
    test_news(token, "IDEA")      # Generic ticker -- should get Vodafone Idea
    test_news(token, "RELIANCE")  # Should get Reliance Industries
    test_news(token, "YESBANK")   # Should get Yes Bank
    test_news(token, "PAYTM")     # Should get Paytm/One97
    test_news(token, "HAL")       # Ambiguous -- should get Hindustan Aeronautics
    
    # Test market overview
    test_market_indices(token)
    
    print(f"\n{'='*60}")
    print("  ALL TESTS COMPLETE")
    print(f"{'='*60}")
