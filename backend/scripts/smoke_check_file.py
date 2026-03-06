
import sys
import os

# Add backend directory to path
backend_dir = os.path.join(os.path.dirname(__file__), '..')
sys.path.append(backend_dir)

log_file = os.path.join(os.path.dirname(__file__), 'smoke_output.txt')

with open(log_file, 'w') as f:
    f.write(f"Starting smoke check. Backend dir: {backend_dir}\n")
    try:
        from app.main import app
        f.write("Successfully imported app.main\n")
    except Exception as e:
        f.write(f"CRITICAL ERROR importing app.main: {e}\n")
        import traceback
        traceback.print_exc(file=f)
    f.write("Smoke check finished.\n")
