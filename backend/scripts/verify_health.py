import requests
import sys

try:
    response = requests.get("http://127.0.0.1:8000/api/health", timeout=5)
    print(f"Status: {response.status_code}")
    print(response.json())
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
