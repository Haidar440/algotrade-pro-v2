
import os
try:
    with open("e:\\algotrade-pro\\hello.txt", "w") as f:
        f.write("Hello from Python")
except Exception as e:
    print(f"Error: {e}")
