import asyncio, sys
sys.path.insert(0, r"e:\algotrade-pro\backend")
from app.database import AsyncSessionLocal
from sqlalchemy import text

async def main():
    async with AsyncSessionLocal() as s:
        r = await s.execute(text("SELECT token, symbol, name FROM instruments WHERE UPPER(symbol) LIKE '%SBIN%' AND exch_seg='NSE' LIMIT 5"))
        print("SBIN symbol search:")
        for row in r.fetchall():
            print(f"  {row}")
        
        r2 = await s.execute(text("SELECT token, symbol, name FROM instruments WHERE UPPER(name) LIKE '%STATE BANK%' AND exch_seg='NSE' LIMIT 5"))
        print("\nSTATE BANK name search:")
        for row in r2.fetchall():
            print(f"  {row}")

asyncio.run(main())
