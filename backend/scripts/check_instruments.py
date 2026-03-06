"""Quick check: how many instruments in DB?"""
import asyncio
import sys
sys.path.insert(0, r"e:\algotrade-pro\backend")

from sqlalchemy import select, func, text
from app.database import AsyncSessionLocal
from app.models.instrument import Instrument

async def check():
    async with AsyncSessionLocal() as s:
        count = await s.execute(select(func.count()).select_from(Instrument))
        total = count.scalar()
        print(f"Total instruments: {total}")
        
        if total and total > 0:
            result = await s.execute(
                select(Instrument).where(Instrument.exch_seg == "NSE").limit(5)
            )
            for inst in result.scalars():
                print(f"  {inst.token} | {inst.symbol} | {inst.name} | {inst.exch_seg}")
            
            seg_result = await s.execute(
                text("SELECT exch_seg, COUNT(*) FROM instruments GROUP BY exch_seg ORDER BY COUNT(*) DESC")
            )
            print("\nBy exchange segment:")
            for row in seg_result.fetchall():
                print(f"  {row[0]}: {row[1]}")
        else:
            print("No instruments in DB -- need to seed the table")

asyncio.run(check())
