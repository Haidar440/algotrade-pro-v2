"""
Sprint 2 — Live Endpoint Test
Tests actual HTTP endpoints against a running server.
"""

import json
import urllib.request
import urllib.error

BASE = "http://localhost:8001"


def req(method: str, path: str, data: dict | None = None, token: str | None = None) -> tuple[int, dict]:
    """Make an HTTP request and return (status_code, response_json)."""
    url = f"{BASE}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode() if data else None
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(request)
        return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read()) if e.read() else {}


def main():
    print("=" * 60)
    print("Sprint 2 — Live Endpoint Tests")
    print("=" * 60)

    errors = []

    # 1. Health check
    code, body = req("GET", "/api/health")
    if code == 200:
        print(f"✅ GET /api/health — {body.get('status', 'unknown')}")
    else:
        errors.append(f"❌ Health: {code}")
        print(f"❌ GET /api/health — {code}")

    # 2. Login to get JWT token
    code, body = req("POST", "/api/auth/login", {"username": "admin", "password": "admin1234"})
    if code == 200 and "access_token" in body:
        token = body["access_token"]
        print(f"✅ POST /api/auth/login — got token: {token[:20]}...")
    else:
        print(f"❌ POST /api/auth/login — {code}: {body}")
        print("Cannot continue without token")
        return

    # 3. Connect paper broker
    code, body = req("POST", "/api/broker/connect", {"broker_name": "paper"}, token)
    print(f"{'✅' if code == 200 else '❌'} POST /api/broker/connect (paper) — {code}: {body.get('message', body)}")
    if code != 200:
        errors.append(f"❌ connect: {code}")

    # 4. Broker status
    code, body = req("GET", "/api/broker/status", token=token)
    print(f"{'✅' if code == 200 else '❌'} GET /api/broker/status — {code}: {body}")
    if code != 200:
        errors.append(f"❌ status: {code}")

    # 5. Paper trading summary
    code, body = req("GET", "/api/broker/paper/summary", token=token)
    print(f"{'✅' if code == 200 else '❌'} GET /api/broker/paper/summary — {code}")
    if code == 200:
        print(f"   Capital: ₹{body.get('data', {}).get('starting_capital', 'N/A'):,}")
    if code != 200:
        errors.append(f"❌ paper/summary: {code}")

    # 6. Place a buy order
    order = {
        "symbol": "RELIANCE",
        "exchange": "NSE",
        "side": "BUY",
        "order_type": "MARKET",
        "quantity": 10,
        "price": 2500.0,
    }
    code, body = req("POST", "/api/broker/order", order, token)
    print(f"{'✅' if code == 200 else '❌'} POST /api/broker/order (BUY RELIANCE) — {code}")
    if code == 200:
        order_id = body.get("data", {}).get("order_id", "unknown")
        print(f"   Order ID: {order_id}")
    else:
        print(f"   Error: {body}")
        errors.append(f"❌ place_order: {code}")

    # 7. Get positions
    code, body = req("GET", "/api/broker/positions", token=token)
    print(f"{'✅' if code == 200 else '❌'} GET /api/broker/positions — {code}")
    if code == 200:
        positions = body.get("data", [])
        print(f"   Open positions: {len(positions)}")
    if code != 200:
        errors.append(f"❌ positions: {code}")

    # 8. Risk status
    code, body = req("GET", "/api/broker/risk/status", token=token)
    print(f"{'✅' if code == 200 else '❌'} GET /api/broker/risk/status — {code}")
    if code != 200:
        errors.append(f"❌ risk/status: {code}")

    # 9. Place sell order
    sell_order = {
        "symbol": "RELIANCE",
        "exchange": "NSE",
        "side": "SELL",
        "order_type": "MARKET",
        "quantity": 10,
        "price": 2600.0,
    }
    code, body = req("POST", "/api/broker/order", sell_order, token)
    print(f"{'✅' if code == 200 else '❌'} POST /api/broker/order (SELL RELIANCE) — {code}")
    if code == 200:
        print(f"   Sold! Checking P&L...")
    else:
        print(f"   Error: {body}")
        errors.append(f"❌ sell_order: {code}")

    # 10. Final summary (P&L check)
    code, body = req("GET", "/api/broker/paper/summary", token=token)
    print(f"{'✅' if code == 200 else '❌'} GET /api/broker/paper/summary (final) — {code}")
    if code == 200:
        data = body.get("data", body)
        print(f"   Capital: ₹{data.get('current_capital', 'N/A'):,}")
        print(f"   Total P&L: ₹{data.get('total_pnl', 'N/A'):,}")
        print(f"   Portfolio: ₹{data.get('portfolio_value', 'N/A'):,}")

    # 11. Disconnect
    code, body = req("POST", "/api/broker/disconnect", token=token)
    print(f"{'✅' if code == 200 else '❌'} POST /api/broker/disconnect — {code}")

    print("\n" + "=" * 60)
    if errors:
        print(f"⚠️  {len(errors)} endpoint errors:")
        for e in errors:
            print(f"  {e}")
    else:
        print("🎉 ALL LIVE ENDPOINT TESTS PASSED!")
    print("=" * 60)


if __name__ == "__main__":
    main()
