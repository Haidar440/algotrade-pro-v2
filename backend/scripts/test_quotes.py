"""Test live quotes endpoint."""
import asyncio, sys
sys.path.insert(0, r"e:\algotrade-pro\backend")
import httpx

BASE = "http://localhost:8000/api"

async def main():
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Login
        resp = await client.post(f"{BASE}/auth/login", json={"username": "admin", "password": "admin1234"})
        token = resp.json()["data"]["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Test search (should show equity only now)
        print("=== Search RELIANCE ===")
        r = await client.get(f"{BASE}/watchlists/search?q=RELIANCE", headers=headers)
        for item in r.json().get("data", [])[:5]:
            print(f"  {item['token']} | {item['symbol']} | {item.get('name')} | {item['exch_seg']}")

        # Test quotes
        print("\n=== Live Quotes ===")
        r2 = await client.post(f"{BASE}/watchlists/quotes", headers=headers, json={
            "symbols": ["RELIANCE-EQ", "TCS-EQ", "SBIN-EQ", "HDFCBANK-EQ", "INFY-EQ"]
        })
        data = r2.json()
        print(f"Status: {r2.status_code}")
        quotes = data.get("data", {})
        for sym, q in quotes.items():
            clean = sym.replace("-EQ", "")
            print(f"  {clean}: Rs.{q.get('price', 0):,.2f} ({q.get('changePercent', 0):+.2f}%)")

asyncio.run(main())
