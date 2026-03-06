"""
Module: scripts/seed_instruments.py
Purpose: Seed the instruments table with Angel One OpenAPI instrument master.

Downloads the complete instrument list from Angel One's public JSON endpoint
and inserts ONLY NSE/BSE EQUITY instruments into the database.

Usage:
    cd backend
    python scripts/seed_instruments.py
"""
import asyncio
import logging
import sys
import os
import time

import httpx

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from sqlalchemy import text
from app.database import AsyncSessionLocal
from app.models.instrument import Instrument

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

# Angel One public instrument master URL
INSTRUMENT_URL = "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json"


async def download_instruments() -> list[dict]:
    """Download instrument master from Angel One public API."""
    logger.info("Downloading instrument master from Angel One...")
    start = time.time()

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.get(INSTRUMENT_URL)
        response.raise_for_status()
        data = response.json()

    elapsed = time.time() - start
    logger.info("Downloaded %d instruments in %.1fs", len(data), elapsed)
    return data


def filter_equity_only(raw: list[dict]) -> list[dict]:
    """Filter to ONLY equity stocks (symbol ending in -EQ) on NSE and BSE."""
    filtered = []
    seen = set()

    for item in raw:
        exch_seg = item.get("exch_seg", "")
        symbol = item.get("symbol", "")
        token = item.get("token", "")

        # Only NSE and BSE equity stocks
        if exch_seg not in ("NSE", "BSE"):
            continue

        # Must end with -EQ (equity segment)
        if not symbol.endswith("-EQ"):
            continue

        key = f"{exch_seg}:{token}"
        if key in seen or not token:
            continue
        seen.add(key)

        filtered.append({
            "token": token,
            "symbol": symbol,
            "name": item.get("name", "") or symbol.replace("-EQ", ""),
            "exch_seg": exch_seg,
            "instrumenttype": "EQ",
            "tick_size": item.get("tick_size", "0.05"),
        })

    logger.info(
        "Filtered to %d equity instruments from %d total",
        len(filtered), len(raw),
    )
    return filtered


async def seed_database(instruments: list[dict]) -> int:
    """Insert instruments into database, replacing existing data."""
    async with AsyncSessionLocal() as session:
        # Clear existing data
        await session.execute(text("DELETE FROM instruments"))
        logger.info("Cleared existing instruments")

        # Batch insert for performance
        batch_size = 1000
        total = 0

        for i in range(0, len(instruments), batch_size):
            batch = instruments[i : i + batch_size]
            for item in batch:
                inst = Instrument(
                    token=item["token"],
                    symbol=item["symbol"],
                    name=item["name"],
                    exch_seg=item["exch_seg"],
                    instrumenttype=item["instrumenttype"],
                    tick_size=item.get("tick_size"),
                )
                session.add(inst)
            await session.flush()
            total += len(batch)
            logger.info("  Inserted %d / %d ...", total, len(instruments))

        await session.commit()
        logger.info("Seeding complete: %d instruments inserted", total)
        return total


async def main() -> None:
    """Download and seed instrument master data (equity only)."""
    try:
        raw = await download_instruments()
        filtered = filter_equity_only(raw)
        count = await seed_database(filtered)

        # Show summary by segment
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text(
                    "SELECT exch_seg, COUNT(*) FROM instruments "
                    "GROUP BY exch_seg ORDER BY COUNT(*) DESC"
                )
            )
            print("\nEquity Instrument Summary:")
            for row in result.fetchall():
                print(f"  {row[0]}: {row[1]:,} stocks")
            print(f"\nTotal: {count:,} equity stocks seeded!")

    except httpx.HTTPError as e:
        logger.error("Failed to download instruments: %s", e)
        sys.exit(1)
    except Exception as e:
        logger.error("Seeding failed: %s", e)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
