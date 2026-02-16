"""Quick inline test against port 8000 — run from any directory."""
import httpx, sys, os
os.environ["PYTHONIOENCODING"] = "utf-8"

BASE = "http://localhost:8000"
P, F = 0, 0
R = []

def c(n, ok, d=""):
    global P, F
    if ok: P += 1; R.append(f"  [PASS] {n}")
    else: F += 1; R.append(f"  [FAIL] {n} -- {d}")

try:
    x = httpx.Client(timeout=10)
    
    # 1. Health
    r = x.get(f"{BASE}/api/health")
    c("Health endpoint", r.status_code == 200)
    
    # 2. Login
    r = x.post(f"{BASE}/api/auth/login", json={"username":"admin","password":"admin1234"})
    c("Auth login", r.status_code == 200)
    d = r.json()
    tk = d["data"]["access_token"]
    c("JWT token received", len(tk) > 20)
    h = {"Authorization": f"Bearer {tk}"}
    
    # 3. Protected endpoints
    r = x.get(f"{BASE}/api/trades", headers=h)
    c("GET /api/trades (auth)", r.status_code == 200)
    r = x.get(f"{BASE}/api/watchlists", headers=h)
    c("GET /api/watchlists (auth)", r.status_code == 200)
    r = x.get(f"{BASE}/api/trades")
    c("Rejects without auth", r.status_code == 401)
    
    # 4. Paper trading flow
    r = x.post(f"{BASE}/api/broker/connect", headers=h, json={"broker":"paper"})
    c("Connect paper broker", r.status_code == 200)
    r = x.get(f"{BASE}/api/broker/status", headers=h)
    c("Broker status", r.status_code == 200)
    r = x.post(f"{BASE}/api/broker/order", headers=h, json={"symbol":"RELIANCE","exchange":"NSE","side":"BUY","order_type":"MARKET","quantity":5,"price":2500})
    c("BUY 5 RELIANCE @ 2500", r.status_code == 200)
    r = x.get(f"{BASE}/api/broker/positions", headers=h)
    c("Positions check", r.status_code == 200)
    r = x.post(f"{BASE}/api/broker/order", headers=h, json={"symbol":"TCS","exchange":"NSE","side":"BUY","order_type":"MARKET","quantity":10,"price":2500})
    c("Risk blocks 25% order", r.status_code == 400)
    r = x.post(f"{BASE}/api/broker/order", headers=h, json={"symbol":"RELIANCE","exchange":"NSE","side":"SELL","order_type":"MARKET","quantity":5,"price":2700})
    c("SELL 5 RELIANCE @ 2700", r.status_code == 200)
    r = x.get(f"{BASE}/api/broker/paper/summary", headers=h)
    c("Paper summary", r.status_code == 200)
    c("Shows profit", "1000" in str(r.json()) or "101000" in str(r.json()))
    r = x.get(f"{BASE}/api/broker/risk/status", headers=h)
    c("Risk status", r.status_code == 200)
    r = x.post(f"{BASE}/api/broker/risk/kill-switch/activate", headers=h)
    c("Kill switch activate", r.status_code == 200)
    r = x.post(f"{BASE}/api/broker/risk/kill-switch/deactivate", headers=h)
    c("Kill switch deactivate", r.status_code == 200)
    r = x.post(f"{BASE}/api/broker/disconnect", headers=h)
    c("Disconnect broker", r.status_code == 200)
    
    # 5. Module imports
    sys.path.insert(0, r"e:\algotrade-pro\backend")
    mods = ["app.config","app.constants","app.exceptions","app.database","app.main",
            "app.models.schemas","app.security.auth","app.security.vault",
            "app.services.broker_interface","app.services.angel_broker",
            "app.services.zerodha_broker","app.services.paper_trader",
            "app.services.risk_manager","app.services.broker_factory",
            "app.routers.health","app.routers.auth","app.routers.trades",
            "app.routers.watchlists","app.routers.broker"]
    for m in mods:
        try: __import__(m); c(f"import {m.split('.')[-1]}", True)
        except Exception as e: c(f"import {m}", False, str(e))
    
    # 6. Docs check
    import os
    docs = [
        (r"e:\algotrade-pro\.github\copilot-instructions.md", "copilot-instructions.md"),
        (r"e:\algotrade-pro\docs\PROJECT_RECORD.md", "PROJECT_RECORD.md"),
        (r"e:\algotrade-pro\docs\AGENT_CONTEXT.md", "AGENT_CONTEXT.md"),
        (r"e:\algotrade-pro\docs\CODE_GUIDE.md", "CODE_GUIDE.md"),
        (r"e:\algotrade-pro\docs\planning\implementation_plan.md", "implementation_plan.md"),
        (r"e:\algotrade-pro\backend\.env", ".env"),
        (r"e:\algotrade-pro\backend\requirements.txt", "requirements.txt"),
    ]
    for p, n in docs:
        ex = os.path.exists(p)
        sz = os.path.getsize(p) if ex else 0
        c(f"{n} ({sz:,}B)", ex and sz > 0)

except Exception as e:
    c("FATAL", False, str(e))

print("\n" + "="*50)
print("  FINAL CHECK RESULTS")
print("="*50)
for r in R: print(r)
print(f"\n  {'='*35}")
t = P + F
if F == 0: print(f"  ALL {t} CHECKS PASSED!")
else: print(f"  {P}/{t} passed, {F} FAILED")
print(f"  {'='*35}")
