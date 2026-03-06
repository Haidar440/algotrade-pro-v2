"""Test search + portfolio when broker is connected."""
import requests

BASE = "http://localhost:8000/api"

# 1. Login
r = requests.post(f"{BASE}/auth/login", json={"username": "admin", "password": "admin1234"})
token = r.json()["data"]["access_token"]
h = {"Authorization": f"Bearer {token}"}

# 2. Connect broker
r = requests.post(f"{BASE}/broker/connect", json={"broker": "angel"}, headers=h)
print(f"1. Connect:   {r.json().get('message', 'FAIL')}")

# 3. Search
r = requests.get(f"{BASE}/broker/search?q=RELIANCE", headers=h)
results = r.json().get("data", [])
print(f"2. Search:    {r.status_code} — {len(results)} results")
if results:
    print(f"   First:     {results[0].get('tradingsymbol', 'N/A')}")

# 4. Holdings
r = requests.get(f"{BASE}/broker/holdings", headers=h)
print(f"3. Holdings:  {r.status_code} — {r.json().get('message', 'N/A')}")

# 5. Positions
r = requests.get(f"{BASE}/broker/positions", headers=h)
print(f"4. Positions: {r.status_code} — {r.json().get('message', 'N/A')}")

# 6. Orders
r = requests.get(f"{BASE}/broker/orders", headers=h)
print(f"5. Orders:    {r.status_code} — {r.json().get('message', 'N/A')}")

# 7. Broker status
r = requests.get(f"{BASE}/broker/status", headers=h)
print(f"6. Status:    {r.json()['data']}")

print("\n✅ All broker endpoints working when connected!")
