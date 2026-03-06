
import os
import sys
import pyotp
from SmartApi import SmartConnect
from dotenv import load_dotenv

# Load env from parent dir
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.config import settings

def test_search():
    print("Testing Angel One Search...")
    
    api_key = settings.ANGEL_API_KEY
    client_id = settings.ANGEL_CLIENT_ID
    password = settings.ANGEL_PASSWORD
    totp_secret = settings.ANGEL_TOTP_SECRET
    
    print(f"Credentials loaded for {client_id}")

    try:
        totp = pyotp.TOTP(totp_secret).now()
        smartApi = SmartConnect(api_key=api_key)
        data = smartApi.generateSession(client_id, password, totp)
        
        if not data or not data.get('status'):
            print("Login failed:", data)
            return

        print("Login successful.")
        
        # Test Search "IDEA"
        print("Searching for 'IDEA' on NSE...")
        try:
            # mimic the fix I applied
            response = smartApi.searchScrip(exchange="NSE", searchscrip="IDEA")
            print("Search Response Type:", type(response))
            print("Search Response:", response)
            
            if response and response.get('status') and response.get('data'):
                print(f"Found {len(response['data'])} results.")
                print("First result:", response['data'][0])
            else:
                print("No data found or status false.")
                
        except Exception as e:
            print(f"Search failed with error: {e}")

        smartApi.terminateSession(client_id)
        
    except Exception as e:
        print(f"Test failed: {e}")

if __name__ == "__main__":
    test_search()
