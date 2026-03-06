import asyncio, sys
sys.path.insert(0, r"e:\algotrade-pro\backend")
from app.database import AsyncSessionLocal
from sqlalchemy import text

async def main():
    async with AsyncSessionLocal() as s:
        # Check total
        r = await s.execute(text("SELECT exch_seg, COUNT(*) FROM instruments GROUP BY exch_seg"))
        print("Instruments by exchange:")
        for row in r.fetchall():
            print(f"  {row[0]}: {row[1]}")

        # Sample some
        r2 = await s.execute(text("SELECT token, symbol, name FROM instruments WHERE symbol LIKE 'RELIANCE%' LIMIT 5"))
        print("\nRELIANCE:")
        for row in r2.fetchall():
            print(f"  {row}")

        r3 = await s.execute(text("SELECT token, symbol, name FROM instruments WHERE symbol LIKE 'TCS%' LIMIT 5"))
        print("\nTCS:")
        for row in r3.fetchall():
            print(f"  {row}")

        r4 = await s.execute(text("SELECT token, symbol, name FROM instruments WHERE symbol LIKE 'SBIN%' LIMIT 5"))
        print("\nSBIN:")
        for row in r4.fetchall():
            print(f"  {row}")

        r5 = await s.execute(text("SELECT token, symbol, name FROM instruments WHERE symbol LIKE 'HDFCBANK%' LIMIT 5"))
        print("\nHDFCBANK:")
        for row in r5.fetchall():
            print(f"  {row}")

asyncio.run(main())
