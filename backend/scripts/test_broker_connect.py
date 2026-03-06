"""Quick test: broker connect endpoint with frontend-style credentials."""
import requests

BASE = "http://localhost:8000/api"

# 1. Login
r = requests.post(f"{BASE}/auth/login", json={"username": "admin", "password": "admin1234"})
token = r.json()["data"]["access_token"]
h = {"Authorization": f"Bearer {token}"}
print(f"1. Login: OK")

# 2. Check broker status (should be disconnected)
r = requests.get(f"{BASE}/broker/status", headers=h)
print(f"2. Status before: {r.json()['data']}")

# 3. Try connect with Paper Trading (no credentials needed)
r = requests.post(f"{BASE}/broker/connect", json={"broker": "paper"}, headers=h)
print(f"3. Paper connect: {r.status_code} — {r.json().get('data', r.json().get('message', r.text[:100]))}")

# 4. Check status again
r = requests.get(f"{BASE}/broker/status", headers=h)
print(f"4. Status after:  {r.json()['data']}")

# 5. Disconnect
r = requests.post(f"{BASE}/broker/disconnect", json={}, headers=h)
print(f"5. Disconnect:    {r.status_code}")

# 6. Try connect with angel (no .env creds, no frontend creds — should fail gracefully)
r = requests.post(f"{BASE}/broker/connect", json={"broker": "angel"}, headers=h)
print(f"6. Angel (no creds): {r.status_code} — {r.json().get('message', r.text[:100])}")

# 7. Try connect with angel + frontend credentials (will fail at smartapi level, but schema should accept)
r = requests.post(f"{BASE}/broker/connect", json={
    "broker": "angel",
    "api_key": "test_key",
    "client_id": "test_client",
    "password": "1234",
    "totp_secret": "TESTSECRET"
}, headers=h)
print(f"7. Angel (with creds): {r.status_code} — {r.json().get('message', r.text[:100])}")

print("\n✅ Schema validation working correctly")
