import urllib.request
import json
try:
    resp = urllib.request.urlopen('http://localhost:8000/api/backtest/optimize/status/4e849945')
    data = json.loads(resp.read().decode())
    print("SUCCESS JSON:")
    print(json.dumps(data, indent=2))
except Exception as e:
    print("ERROR:", e)
