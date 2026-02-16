"""Quick test: Verify Tavily news API is working with the new key."""
import httpx
import json
import sys

BASE = "http://localhost:8000"

try:
    # Login
    r = httpx.post(f"{BASE}/api/auth/login", json={"username": "admin", "password": "admin1234"}, timeout=10)
    token = r.json()["data"]["access_token"]
    print("[OK] Login successful")

    headers = {"Authorization": f"Bearer {token}"}

    # Test news endpoint
    print("\nFetching news for RELIANCE...")
    r2 = httpx.get(f"{BASE}/api/ai/news/RELIANCE", headers=headers, timeout=30)
    d = r2.json()
    
    print(f"Status: {r2.status_code}")
    
    if r2.status_code == 200 and d.get("success") == True:
        data = d.get("data", {})
        articles = data.get("articles", [])
        article_count = data.get("article_count", 0)
        query = data.get("query", "")
        
        print(f"Query: {query}")
        print(f"Articles found: {article_count}")
        
        if article_count > 0:
            print("\n--- Articles ---")
            for i, a in enumerate(articles, 1):
                title = a.get("title", "No title")
                source = a.get("source", "Unknown")
                print(f"  {i}. [{source}] {title[:100]}")
            print("\n✅ TAVILY API KEY IS WORKING! Real news fetched successfully.")
        else:
            print("\n⚠️  No articles returned — key may be invalid or rate-limited.")
    else:
        print(f"\n❌ FAILED — Response: {json.dumps(d, indent=2)[:500]}")
        
except httpx.ConnectError:
    print("❌ Server not running! Start it first.")
    sys.exit(1)
except Exception as e:
    print(f"❌ Error: {e}")
    sys.exit(1)
