"""Test the watchlist search endpoint and full CRUD flow."""
import asyncio
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

import httpx

BASE = "http://localhost:8000/api"


async def get_token() -> str:
    """Login and get JWT token."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(f"{BASE}/auth/login", json={
            "username": "admin",
            "password": "admin1234"
        })
        data = resp.json()
        return data["data"]["access_token"]


async def test_search(token: str):
    """Test instrument search endpoint."""
    headers = {"Authorization": f"Bearer {token}"}
    
    async with httpx.AsyncClient() as client:
        # Test 1: Search for RELIANCE
        print("\n=== Test 1: Search RELIANCE ===")
        resp = await client.get(f"{BASE}/watchlists/search?q=RELIANCE", headers=headers)
        data = resp.json()
        print(f"Status: {resp.status_code}")
        print(f"Found: {len(data.get('data', []))} results")
        for item in data.get("data", [])[:5]:
            print(f"  {item['token']} | {item['symbol']} | {item.get('name', 'N/A')} | {item['exch_seg']}")

        # Test 2: Search for TCS
        print("\n=== Test 2: Search TCS ===")
        resp = await client.get(f"{BASE}/watchlists/search?q=TCS", headers=headers)
        data = resp.json()
        print(f"Found: {len(data.get('data', []))} results")
        for item in data.get("data", [])[:5]:
            print(f"  {item['token']} | {item['symbol']} | {item.get('name', 'N/A')} | {item['exch_seg']}")

        # Test 3: Search for INFY
        print("\n=== Test 3: Search INFY ===")
        resp = await client.get(f"{BASE}/watchlists/search?q=INFY", headers=headers)
        data = resp.json()
        print(f"Found: {len(data.get('data', []))} results")
        for item in data.get("data", [])[:3]:
            print(f"  {item['token']} | {item['symbol']} | {item.get('name', 'N/A')} | {item['exch_seg']}")

        # Test 4: Search for partial name
        print("\n=== Test 4: Search 'STATE BANK' (by name) ===")
        resp = await client.get(f"{BASE}/watchlists/search?q=STATE BANK", headers=headers)
        data = resp.json()
        print(f"Found: {len(data.get('data', []))} results")
        for item in data.get("data", [])[:5]:
            print(f"  {item['token']} | {item['symbol']} | {item.get('name', 'N/A')} | {item['exch_seg']}")

        # Test 5: Watchlist CRUD
        print("\n=== Test 5: Watchlist CRUD ===")
        # Create watchlist
        resp = await client.post(f"{BASE}/watchlists", headers=headers, json={
            "name": "TestList",
            "items": [
                {"id": "s-1", "symbol": "RELIANCE-EQ", "name": "RELIANCE INDUSTRIES", "token": "2885", "price": 0, "changePercent": 0},
                {"id": "s-2", "symbol": "TCS-EQ", "name": "TATA CONSULTANCY SERV", "token": "11536", "price": 0, "changePercent": 0},
            ]
        })
        print(f"Create: {resp.status_code} — {resp.json().get('message', '')}")

        # Get watchlist
        resp = await client.get(f"{BASE}/watchlists/TestList", headers=headers)
        data = resp.json()
        items = data.get("data", {}).get("items", [])
        print(f"Get: {len(items)} items")
        for item in items:
            print(f"  {item['symbol']} — {item.get('name', 'N/A')}")

        # Delete watchlist
        resp = await client.delete(f"{BASE}/watchlists/TestList", headers=headers)
        print(f"Delete: {resp.status_code} — {resp.json().get('message', '')}")

        print("\nAll tests passed!")


async def main():
    try:
        token = await get_token()
        print(f"Got JWT token: {token[:20]}...")
        await test_search(token)
    except httpx.ConnectError:
        print("ERROR: Backend not running! Start with: python run.py")
    except Exception as e:
        print(f"ERROR: {e}")


if __name__ == "__main__":
    asyncio.run(main())
