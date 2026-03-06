"""
Test Gemini News Intelligence (replaces Tavily).

Usage:
    cd backend
    .venv\Scripts\python.exe scripts\test_gemini_news.py

Requires: Server running on localhost:8000
"""

import json
import sys
import time

import requests

BASE = "http://localhost:8000/api"


def get_token() -> str:
    """Login and get JWT token."""
    r = requests.post(f"{BASE}/auth/login", json={
        "username": "admin",
        "password": "admin1234"
    }, timeout=10)
    r.raise_for_status()
    return r.json()["data"]["access_token"]


def test_health() -> bool:
    """Check server is up."""
    try:
        r = requests.get(f"{BASE}/health", timeout=5)
        data = r.json()
        ok = data.get("status") == "healthy"
        print(f"[{'PASS' if ok else 'FAIL'}] Health: {data.get('status')}")
        return ok
    except Exception as e:
        print(f"[FAIL] Server not reachable: {e}")
        return False


def test_news(token: str, symbol: str) -> dict:
    """Test /ai/news/{symbol} endpoint."""
    print(f"\n{'='*60}")
    print(f"Testing: /ai/news/{symbol}?with_sentiment=true")
    print(f"{'='*60}")

    start = time.time()
    r = requests.get(
        f"{BASE}/ai/news/{symbol}?with_sentiment=true",
        headers={"Authorization": f"Bearer {token}"},
        timeout=60
    )
    elapsed = time.time() - start

    print(f"Status: {r.status_code} ({elapsed:.1f}s)")

    if r.status_code != 200:
        print(f"[FAIL] HTTP {r.status_code}: {r.text[:200]}")
        return {}

    data = r.json().get("data", {})

    # Display results
    print(f"Symbol:     {data.get('symbol')}")
    print(f"Sentiment:  {data.get('sentiment')} (score: {data.get('sentiment_score')})")
    print(f"Articles:   {data.get('article_count', 0)}")

    summary = data.get("sentiment_summary", "")
    if summary:
        print(f"Summary:    {summary[:200]}{'...' if len(summary) > 200 else ''}")

    key_drivers = data.get("key_drivers", [])
    if key_drivers:
        print(f"Key Drivers ({len(key_drivers)}):")
        for d in key_drivers:
            print(f"  + {d}")

    risk_factors = data.get("risk_factors", [])
    if risk_factors:
        print(f"Risk Factors ({len(risk_factors)}):")
        for r_ in risk_factors:
            print(f"  - {r_}")

    articles = data.get("articles", [])
    if articles:
        print(f"Articles ({len(articles)}):")
        for i, a in enumerate(articles, 1):
            source = a.get("source", "Unknown")
            title = a.get("title", "No title")[:80]
            url = a.get("url", "")
            print(f"  {i}. [{source}] {title}")
            if url:
                print(f"     {url}")

    # Validation
    checks = {
        "has_symbol": data.get("symbol") == symbol,
        "has_sentiment": data.get("sentiment") in ("POSITIVE", "NEUTRAL", "NEGATIVE"),
        "has_score": isinstance(data.get("sentiment_score"), (int, float)),
        "has_summary": bool(summary) and "unavailable" not in summary.lower(),
        "has_articles": len(articles) > 0,
        "has_key_drivers": len(key_drivers) > 0,
        "has_risk_factors": len(risk_factors) > 0,
        "articles_have_urls": all(a.get("url") for a in articles) if articles else True,
        "articles_have_sources": all(a.get("source") for a in articles) if articles else True,
    }

    passed = sum(checks.values())
    total = len(checks)
    print(f"\nChecks: {passed}/{total}")
    for name, ok in checks.items():
        print(f"  [{'PASS' if ok else 'FAIL'}] {name}")

    return data


def main():
    print("=" * 60)
    print("Gemini News Intelligence — Live Test")
    print("=" * 60)

    if not test_health():
        print("\nServer not running! Start it first.")
        sys.exit(1)

    token = get_token()
    print(f"[PASS] Auth token obtained")

    # Test stocks — wait between calls to avoid rate limits
    symbols = ["RELIANCE", "TCS", "IDEA"]

    results = {}
    for i, sym in enumerate(symbols):
        if i > 0:
            print("\n⏳ Waiting 5s between calls (rate limit protection)...")
            time.sleep(5)
        results[sym] = test_news(token, sym)

    # Final summary
    print(f"\n{'='*60}")
    print("FINAL SUMMARY")
    print(f"{'='*60}")
    for sym, data in results.items():
        sentiment = data.get("sentiment", "N/A")
        count = data.get("article_count", 0)
        drivers = len(data.get("key_drivers", []))
        risks = len(data.get("risk_factors", []))
        print(f"  {sym:12s} | {sentiment:10s} | {count} articles | {drivers} drivers | {risks} risks")

    print("\n✅ Gemini News test complete!")


if __name__ == "__main__":
    main()
