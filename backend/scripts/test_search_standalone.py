
import pyotp
from SmartApi import SmartConnect
import time

def test_search():
    try:
        with open("search_result.txt", "w") as f:
            f.write("Starting test...\n")
            
            api_key = "WVfqoPnD"
            client_id = "S1029255"
            password = "1864"
            totp_secret = "W2H3MDWJ5OB3J6464WLVBXQE4Y"
            
            f.write(f"Credentials: {client_id}\n")

            totp = pyotp.TOTP(totp_secret).now()
            smartApi = SmartConnect(api_key=api_key)
            data = smartApi.generateSession(client_id, password, totp)
            
            if not data or not data.get('status'):
                f.write(f"Login failed: {data}\n")
                return

            f.write("Login successful.\n")
            
            # Test Search "IDEA"
            f.write("Searching for 'IDEA'...\n")
            try:
                # The corrected signature
                response = smartApi.searchScrip(exchange="NSE", searchscrip="IDEA")
                f.write(f"Response Type: {type(response)}\n")
                
                if response and response.get('status') and response.get('data'):
                    f.write(f"Found {len(response['data'])} results.\n")
                    f.write(f"First result: {response['data'][0]}\n")
                else:
                    f.write(f"No data found. Response: {response}\n")
                    
            except Exception as e:
                f.write(f"Search call failed: {e}\n")

            smartApi.terminateSession(client_id)
            f.write("Session terminated.\n")
            
    except Exception as e:
        with open("search_result.txt", "a") as f:
            f.write(f"Script crashed: {e}\n")

if __name__ == "__main__":
    test_search()
