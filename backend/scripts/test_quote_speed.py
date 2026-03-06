"""Test quote speed: batch vs serial."""
import asyncio, sys, time
sys.path.insert(0, r"e:\algotrade-pro\backend")
import httpx

BASE = "http://localhost:8000/api"
SYMBOLS = ["RELIANCE-EQ", "TCS-EQ", "SBIN-EQ", "HDFCBANK-EQ", "INFY-EQ"]

async def main():
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(f"{BASE}/auth/login", json={"username": "admin", "password": "admin1234"})
        token = resp.json()["data"]["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Test single symbol (simulates adding one stock)
        print("=== Single Stock Quote (add flow) ===")
        start = time.time()
        r = await client.post(f"{BASE}/watchlists/quotes", headers=headers, json={"symbols": ["HDFCLIQUID-EQ"]})
        elapsed = time.time() - start
        data = r.json().get("data", {})
        for sym, q in data.items():
            print(f"  {sym.replace('-EQ','')}:  Rs.{q.get('price',0):,.2f}  ({q.get('changePercent',0):+.2f}%)  [{elapsed:.1f}s]")

        # Test batch (simulates page load with 5 stocks)
        print(f"\n=== Batch Quotes ({len(SYMBOLS)} stocks) ===")
        start = time.time()
        r2 = await client.post(f"{BASE}/watchlists/quotes", headers=headers, json={"symbols": SYMBOLS})
        elapsed = time.time() - start
        data2 = r2.json().get("data", {})
        for sym, q in data2.items():
            print(f"  {sym.replace('-EQ','')}: Rs.{q.get('price',0):,.2f}  ({q.get('changePercent',0):+.2f}%)")
        print(f"  Total time: {elapsed:.1f}s for {len(SYMBOLS)} stocks")

asyncio.run(main())
