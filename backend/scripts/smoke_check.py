
import sys
import os

# Add backend directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

print("Attempting to import app.main...")
try:
    from app.main import app
    print("Successfully imported app.main")
except Exception as e:
    print(f"CRITICAL ERROR importing app.main: {e}")
    import traceback
    traceback.print_exc()
