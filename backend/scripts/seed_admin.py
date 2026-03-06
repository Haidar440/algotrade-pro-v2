
import asyncio
import logging
import sys
import os

# Add backend directory to path so we can import app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from app.database import AsyncSessionLocal, init_db
from app.models.user import User
from app.security.auth import hash_password

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def seed_admin():
    """Seeds the database with an initial admin user."""
    print("🌱 Seeding Admin User...")
    
    # Ensure tables exist
    await init_db()

    async with AsyncSessionLocal() as db:
        try:
            # Check if admin exists
            result = await db.execute(select(User).where(User.username == "admin"))
            user = result.scalar_one_or_none()
            
            if user:
                print("✅ Admin user already exists.")
            else:
                print("creating admin user...")
                new_admin = User(
                    username="admin",
                    email="admin@algotradepro.com",
                    hashed_password=hash_password("admin1234"),
                    is_active=True
                )
                db.add(new_admin)
                await db.commit()
                print("✅ Admin user created successfully (admin / admin1234).")
                
        except Exception as e:
            print(f"❌ Error seeding database: {e}")
            await db.rollback()

if __name__ == "__main__":
    asyncio.run(seed_admin())
