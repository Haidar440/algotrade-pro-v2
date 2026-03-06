
"""
Script: backend/scripts/verify_sprint5.py
Purpose: Verify Sprint 5 deliverables (Frontend API, Auth, Telegram).
"""

import sys
import os
import requests
import json
import logging

# Add backend directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

BASE_URL = "http://localhost:8000/api"

def test_sprint5():
    print("🚀 Starting Sprint 5 Verification...")
    
    # 1. Login (Auth)
    print("\n🔐 Testing Authentication...")
    try:
        # Using the default admin credentials from auth.py
        login_payload = {"username": "admin", "password": "password123"} 
        # Wait, auth.py said "admin1234" in _USERS_DB?
        # Let's check auth.py content.
        # It was "admin": hash_password("admin1234")
        login_payload["password"] = "admin1234"
        
        response = requests.post(f"{BASE_URL}/auth/login", json=login_payload)
        if response.status_code == 200:
            token_data = response.json()["data"]
            access_token = token_data["access_token"]
            print(f"✅ Login Successful. Token: {access_token[:10]}...")
        else:
            print(f"❌ Login Failed: {response.text}")
            return
    except Exception as e:
        print(f"❌ Login Error: {e}")
        return

    headers = {"Authorization": f"Bearer {access_token}"}

    # 2. Broker Search
    print("\n🔎 Testing Broker Search (Mock/Real)...")
    try:
        # Search for RELIANCE
        res = requests.get(f"{BASE_URL}/broker/search", params={"q": "RELIANCE"}, headers=headers)
        if res.status_code == 200:
            data = res.json()["data"]
            print(f"✅ Search Successful. Found {len(data)} results.")
            if data:
                print(f"   First result: {data[0].get('symbol') or data[0].get('tradingsymbol')}")
        else:
             print(f"⚠️ Search Failed (Maybe broker not connected?): {res.text}")
    except Exception as e:
        print(f"❌ Search Error: {e}")

    # 3. AI Market Indices
    print("\n📈 Testing AI Market Indices...")
    try:
        res = requests.get(f"{BASE_URL}/ai/market/indices", headers=headers)
        if res.status_code == 200:
            data = res.json()["data"]
            print(f"✅ Indices Fetch Successful: {json.dumps(data, indent=2)}")
        else:
            print(f"❌ Indices Fetch Failed: {res.text}")
    except Exception as e:
        print(f"❌ Indices Error: {e}")

    # 4. Telegram Webhook (Simulation)
    print("\n🤖 Testing Telegram Webhook (Simulation)...")
    try:
        webhook_payload = {
            "update_id": 10000,
            "message": {
                "message_id": 123,
                "from": {
                    "id": 9999999, # Fake ID, likely not in ALLOWED_USERS
                    "is_bot": False,
                    "first_name": "Test",
                    "username": "tester"
                },
                "chat": {
                    "id": 9999999,
                    "first_name": "Test",
                    "username": "tester",
                    "type": "private"
                },
                "date": 1600000000,
                "text": "/start"
            }
        }
        
        res = requests.post(f"{BASE_URL}/telegram/webhook", json=webhook_payload)
        if res.status_code == 200:
            print("✅ Webhook Accepted (200 OK). Check server logs for processing.")
        else:
            print(f"❌ Webhook Rejected: {res.status_code} {res.text}")
            
    except Exception as e:
        print(f"❌ Webhook Error: {e}")

    print("\n✨ Verification Complete.")

if __name__ == "__main__":
    test_sprint5()
