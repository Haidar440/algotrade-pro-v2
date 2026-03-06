
import os
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
load_dotenv(env_path)

key = os.getenv("JWT_SECRET_KEY", "")
encryption_key = os.getenv("MASTER_ENCRYPTION_KEY", "")

if not key or key.startswith("CHANGE_ME"):
    print("ERROR: JWT_SECRET_KEY is default or missing")
else:
    print("JWT_SECRET_KEY: OK")

if not encryption_key or encryption_key.startswith("CHANGE_ME"):
    print("ERROR: MASTER_ENCRYPTION_KEY is default or missing")
else:
    print("MASTER_ENCRYPTION_KEY: OK")
