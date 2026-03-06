"""Check instrument types and symbol patterns in the DB."""
import asyncio, sys
sys.path.insert(0, r"e:\algotrade-pro\backend")
from app.database import AsyncSessionLocal
from sqlalchemy import text

async def main():
    async with AsyncSessionLocal() as s:
        # Check instrument types
        r = await s.execute(text("""
            SELECT instrumenttype, COUNT(*) as cnt 
            FROM instruments 
            WHERE exch_seg='NSE'
            GROUP BY instrumenttype 
            ORDER BY cnt DESC
        """))
        print("NSE instrument types:")
        for row in r.fetchall():
            print(f"  {row[0] or 'NULL'}: {row[1]}")

        # Check symbol patterns (e.g. -EQ suffix)
        r2 = await s.execute(text("""
            SELECT symbol, name, instrumenttype 
            FROM instruments 
            WHERE exch_seg='NSE' AND symbol LIKE '%-EQ'
            LIMIT 10
        """))
        print("\nSample -EQ symbols:")
        for row in r2.fetchall():
            print(f"  {row[0]} | {row[1]} | type={row[2]}")

        # Count EQ vs non-EQ
        r3 = await s.execute(text("""
            SELECT 
                COUNT(*) FILTER (WHERE symbol LIKE '%-EQ') as eq_count,
                COUNT(*) FILTER (WHERE symbol NOT LIKE '%-EQ') as non_eq_count,
                COUNT(*) as total
            FROM instruments WHERE exch_seg='NSE'
        """))
        row = r3.fetchone()
        print(f"\nNSE: {row[0]} EQ stocks, {row[1]} non-EQ, {row[2]} total")

        # Sample non-EQ NSE instruments
        r4 = await s.execute(text("""
            SELECT symbol, name, instrumenttype 
            FROM instruments 
            WHERE exch_seg='NSE' AND symbol NOT LIKE '%-EQ'
            LIMIT 15
        """))
        print("\nSample NON-EQ NSE instruments (junk to remove):")
        for row in r4.fetchall():
            print(f"  {row[0]} | {row[1]} | type={row[2]}")

        # BSE check
        r5 = await s.execute(text("""
            SELECT instrumenttype, COUNT(*) as cnt 
            FROM instruments 
            WHERE exch_seg='BSE'
            GROUP BY instrumenttype 
            ORDER BY cnt DESC LIMIT 10
        """))
        print("\nBSE instrument types:")
        for row in r5.fetchall():
            print(f"  {row[0] or 'NULL'}: {row[1]}")

asyncio.run(main())
