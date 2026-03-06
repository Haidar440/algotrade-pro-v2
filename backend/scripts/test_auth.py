
import requests
import time

BASE_URL = "http://localhost:8000/api"

def test_auth_flow():
    username = f"user_{int(time.time())}"
    email = f"{username}@example.com"
    password = "password123"

    print(f"🔹 Testing Registration for {username}...")
    try:
        res = requests.post(f"{BASE_URL}/auth/register", json={
            "username": username,
            "email": email,
            "password": password
        })
        if res.status_code == 200:
            print("✅ Registration Successful:", res.json())
        else:
            print("❌ Registration Failed:", res.status_code, res.text)
            return
    except Exception as e:
        print(f"❌ Connection Error: {e}")
        return

    print(f"\n🔹 Testing Login for {username}...")
    try:
        res = requests.post(f"{BASE_URL}/auth/login", json={
            "username": username,
            "password": password
        })
        if res.status_code == 200:
            token = res.json()['data']['access_token']
            print("✅ Login Successful. Token received.")
            print(f"🔑 Token: {token[:20]}...")
        else:
            print("❌ Login Failed:", res.status_code, res.text)
    except Exception as e:
        print(f"❌ Connection Error: {e}")

if __name__ == "__main__":
    test_auth_flow()
