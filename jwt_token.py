from SmartApi import SmartConnect
import pyotp

# Inputs
api_key = "", ""
client_id = ""
password = ""
totp_key = "" # From Google Authenticator Setup

# Generate
obj = SmartConnect(api_key=api_key)
data = obj.generateSession(client_id, password, pyotp.TOTP(totp_key).now())
print(data['data']['jwtToken'])
