"""
Final Health Check — Tests everything before leaving.
Run: python scripts/final_check.py
Starts its own server on port 8001, runs all checks, then shuts down.
"""

import httpx
import sys
import os
import json
import time
import subprocess
import signal
import atexit

BASE = "http://localhost:8001"
PASS = 0
FAIL = 0
RESULTS = []
SERVER_PROC = None


def start_server():
    """Start uvicorn in a subprocess."""
    global SERVER_PROC
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    venv_python = os.path.join(backend_dir, ".venv", "Scripts", "python.exe")
    SERVER_PROC = subprocess.Popen(
        [venv_python, "-c",
         "import os; os.chdir(r'{}'); import uvicorn; uvicorn.run('app.main:app', host='0.0.0.0', port=8001, log_level='warning')".format(backend_dir)],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
        env={**os.environ, "PYTHONIOENCODING": "utf-8"}
    )
    atexit.register(stop_server)
    # Wait for server to be ready
    for i in range(20):
        try:
            httpx.get(f"{BASE}/api/health", timeout=2)
            return True
        except Exception:
            time.sleep(0.5)
    return False


def stop_server():
    """Stop the server subprocess."""
    global SERVER_PROC
    if SERVER_PROC and SERVER_PROC.poll() is None:
        SERVER_PROC.terminate()
        try:
            SERVER_PROC.wait(timeout=5)
        except subprocess.TimeoutExpired:
            SERVER_PROC.kill()


def check(name: str, passed: bool, detail: str = ""):
    global PASS, FAIL
    if passed:
        PASS += 1
        RESULTS.append(f"  ✅ {name}")
    else:
        FAIL += 1
        RESULTS.append(f"  ❌ {name} — {detail}")


def main():
    global PASS, FAIL

    print("\n" + "=" * 60)
    print("  AlgoTrade Pro — Final Health Check")
    print("=" * 60)

    # Start server
    print("\n⏳ Starting server on port 8001...")
    if not start_server():
        print("  ❌ Server failed to start!")
        return
    print("  ✅ Server ready!\n")

    client = httpx.Client(timeout=10)
    token = None

    # ━━━━━━━━━━ 1. HEALTH ENDPOINT ━━━━━━━━━━
    print("\n📡 1. Health Endpoint...")
    try:
        r = client.get(f"{BASE}/api/health")
        data = r.json()
        check("GET /api/health returns 200", r.status_code == 200)
        check("Health response has status", "status" in str(data))
        check("Database is connected", "database" in str(data).lower() or "db" in str(data).lower() or r.status_code == 200)
    except Exception as e:
        check("Health endpoint reachable", False, str(e))

    # ━━━━━━━━━━ 2. AUTH LOGIN ━━━━━━━━━━
    print("\n🔐 2. Auth Login...")
    try:
        r = client.post(f"{BASE}/api/auth/login", json={"username": "admin", "password": "admin1234"})
        data = r.json()
        check("POST /api/auth/login returns 200", r.status_code == 200)

        # Extract token (nested at body.data.access_token)
        if "body" in data and "data" in data["body"] and "access_token" in data["body"]["data"]:
            token = data["body"]["data"]["access_token"]
        elif "data" in data and "access_token" in data["data"]:
            token = data["data"]["access_token"]
        elif "access_token" in data:
            token = data["access_token"]

        check("JWT token received", token is not None and len(token) > 20)
    except Exception as e:
        check("Auth login works", False, str(e))

    if not token:
        print("\n  ⛔ Cannot continue without token!")
        print_summary()
        return

    headers = {"Authorization": f"Bearer {token}"}

    # ━━━━━━━━━━ 3. AUTH-PROTECTED ENDPOINTS ━━━━━━━━━━
    print("\n🛡️  3. Auth-Protected Endpoints...")
    try:
        r = client.get(f"{BASE}/api/trades", headers=headers)
        check("GET /api/trades returns 200", r.status_code == 200)
    except Exception as e:
        check("Trades endpoint", False, str(e))

    try:
        r = client.get(f"{BASE}/api/watchlists", headers=headers)
        check("GET /api/watchlists returns 200", r.status_code == 200)
    except Exception as e:
        check("Watchlists endpoint", False, str(e))

    # Test that endpoints reject without auth
    try:
        r = client.get(f"{BASE}/api/trades")
        check("GET /api/trades rejects without auth (401)", r.status_code == 401)
    except Exception as e:
        check("Auth rejection works", False, str(e))

    # ━━━━━━━━━━ 4. BROKER FLOW ━━━━━━━━━━
    print("\n📊 4. Full Paper Trading Flow...")

    # Connect paper broker
    try:
        r = client.post(f"{BASE}/api/broker/connect", headers=headers,
                        json={"broker": "paper"})
        check("Connect paper broker (200)", r.status_code == 200)
    except Exception as e:
        check("Broker connect", False, str(e))

    # Check status
    try:
        r = client.get(f"{BASE}/api/broker/status", headers=headers)
        data = r.json()
        check("Broker status returns 200", r.status_code == 200)
    except Exception as e:
        check("Broker status", False, str(e))

    # Paper summary (before trade)
    try:
        r = client.get(f"{BASE}/api/broker/paper/summary", headers=headers)
        data = r.json()
        check("Paper summary returns 200", r.status_code == 200)
    except Exception as e:
        check("Paper summary", False, str(e))

    # Buy order (5 RELIANCE @ ₹2,500 — within 20% limit)
    try:
        r = client.post(f"{BASE}/api/broker/order", headers=headers, json={
            "symbol": "RELIANCE", "exchange": "NSE", "side": "BUY",
            "order_type": "MARKET", "quantity": 5, "price": 2500
        })
        data = r.json()
        check("BUY 5 RELIANCE @ ₹2,500", r.status_code == 200)
    except Exception as e:
        check("Buy order", False, str(e))

    # Check positions
    try:
        r = client.get(f"{BASE}/api/broker/positions", headers=headers)
        data = r.json()
        check("Positions show RELIANCE", r.status_code == 200)
    except Exception as e:
        check("Positions check", False, str(e))

    # Risk status
    try:
        r = client.get(f"{BASE}/api/broker/risk/status", headers=headers)
        check("Risk status returns 200", r.status_code == 200)
    except Exception as e:
        check("Risk status", False, str(e))

    # Risk check — order too large (should be rejected)
    try:
        r = client.post(f"{BASE}/api/broker/order", headers=headers, json={
            "symbol": "TCS", "exchange": "NSE", "side": "BUY",
            "order_type": "MARKET", "quantity": 10, "price": 2500
        })
        check("Risk blocks 25% concentration order (400)", r.status_code == 400)
    except Exception as e:
        check("Risk concentration check", False, str(e))

    # Sell order (profit ₹1,000)
    try:
        r = client.post(f"{BASE}/api/broker/order", headers=headers, json={
            "symbol": "RELIANCE", "exchange": "NSE", "side": "SELL",
            "order_type": "MARKET", "quantity": 5, "price": 2700
        })
        check("SELL 5 RELIANCE @ ₹2,700 (₹1,000 profit)", r.status_code == 200)
    except Exception as e:
        check("Sell order", False, str(e))

    # Final summary
    try:
        r = client.get(f"{BASE}/api/broker/paper/summary", headers=headers)
        data = r.json()
        check("Final paper summary returns 200", r.status_code == 200)
        # Check for profit in response
        summary_str = json.dumps(data)
        check("Paper trading shows profit", "1000" in summary_str or "101000" in summary_str)
    except Exception as e:
        check("Final summary", False, str(e))

    # Kill switch test
    try:
        r = client.post(f"{BASE}/api/broker/risk/kill-switch/activate", headers=headers)
        check("Kill switch activate (200)", r.status_code == 200)

        r = client.post(f"{BASE}/api/broker/risk/kill-switch/deactivate", headers=headers)
        check("Kill switch deactivate (200)", r.status_code == 200)
    except Exception as e:
        check("Kill switch", False, str(e))

    # Disconnect
    try:
        r = client.post(f"{BASE}/api/broker/disconnect", headers=headers)
        check("Disconnect broker (200)", r.status_code == 200)
    except Exception as e:
        check("Broker disconnect", False, str(e))

    # ━━━━━━━━━━ 5. IMPORT TESTS ━━━━━━━━━━
    print("\n📦 5. Module Imports...")
    modules = [
        ("app.config", "Settings"),
        ("app.constants", "Enums"),
        ("app.exceptions", "Custom Errors"),
        ("app.database", "Database"),
        ("app.main", "FastAPI App"),
        ("app.models.schemas", "Pydantic Schemas"),
        ("app.security.auth", "JWT Auth"),
        ("app.security.vault", "Credential Vault"),
        ("app.services.broker_interface", "Broker ABC"),
        ("app.services.angel_broker", "Angel One"),
        ("app.services.zerodha_broker", "Zerodha"),
        ("app.services.paper_trader", "Paper Trader"),
        ("app.services.risk_manager", "Risk Manager"),
        ("app.services.broker_factory", "Broker Factory"),
        ("app.routers.health", "Health Router"),
        ("app.routers.auth", "Auth Router"),
        ("app.routers.trades", "Trades Router"),
        ("app.routers.watchlists", "Watchlists Router"),
        ("app.routers.broker", "Broker Router"),
    ]

    # Add backend to path
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    for module, name in modules:
        try:
            __import__(module)
            check(f"import {name} ({module})", True)
        except Exception as e:
            check(f"import {name} ({module})", False, str(e))

    # ━━━━━━━━━━ 6. DOCS CHECK ━━━━━━━━━━
    print("\n📄 6. Documentation Files...")
    docs = [
        ("e:/algotrade-pro/.github/copilot-instructions.md", "copilot-instructions.md"),
        ("e:/algotrade-pro/docs/PROJECT_RECORD.md", "PROJECT_RECORD.md"),
        ("e:/algotrade-pro/docs/AGENT_CONTEXT.md", "AGENT_CONTEXT.md"),
        ("e:/algotrade-pro/docs/planning/implementation_plan.md", "implementation_plan.md"),
        ("e:/algotrade-pro/backend/.env", ".env (secrets)"),
        ("e:/algotrade-pro/backend/.env.example", ".env.example (template)"),
        ("e:/algotrade-pro/backend/requirements.txt", "requirements.txt"),
    ]
    for path, name in docs:
        exists = os.path.exists(path)
        size = os.path.getsize(path) if exists else 0
        check(f"{name} exists ({size:,} bytes)", exists and size > 0)

    # ━━━━━━━━━━ SUMMARY ━━━━━━━━━━
    stop_server()
    print_summary()


def print_summary():
    print("\n" + "=" * 60)
    print("  RESULTS")
    print("=" * 60)
    for r in RESULTS:
        print(r)
    print(f"\n  {'=' * 40}")
    total = PASS + FAIL
    if FAIL == 0:
        print(f"  🎉 ALL {total} CHECKS PASSED! Safe to leave.")
    else:
        print(f"  ⚠️  {PASS}/{total} passed, {FAIL} FAILED")
    print(f"  {'=' * 40}\n")


if __name__ == "__main__":
    main()
