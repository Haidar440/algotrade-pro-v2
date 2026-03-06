"""
Script: scripts/migrate_add_trade_columns.py
Purpose: Add target_price and stop_loss columns to the trades table.

Run once: python scripts/migrate_add_trade_columns.py
"""

import asyncio
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text
from app.database import engine


async def migrate():
    """Add target_price and stop_loss columns to trades table if they don't exist."""
    async with engine.begin() as conn:
        # Check existing columns
        result = await conn.execute(
            text("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'trades'
                AND column_name IN ('target_price', 'stop_loss')
            """)
        )
        existing = {row[0] for row in result.fetchall()}

        if "target_price" not in existing:
            await conn.execute(
                text("ALTER TABLE trades ADD COLUMN target_price NUMERIC(12, 2)")
            )
            print("✅ Added column: target_price")
        else:
            print("⏭️  Column target_price already exists")

        if "stop_loss" not in existing:
            await conn.execute(
                text("ALTER TABLE trades ADD COLUMN stop_loss NUMERIC(12, 2)")
            )
            print("✅ Added column: stop_loss")
        else:
            print("⏭️  Column stop_loss already exists")

    print("🎉 Migration complete!")


if __name__ == "__main__":
    asyncio.run(migrate())
