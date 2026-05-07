"""
Module: app/routers/screener.py
Purpose: API endpoints for the Stock Screener.

Endpoints:
  GET  /api/screener/stocks          → Paginated stock list with KPIs
  GET  /api/screener/stock/{symbol}  → Deep-dive single stock
  POST /api/screener/filter          → Custom filter queries
  GET  /api/screener/presets         → Pre-built screening strategies
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.dependencies import get_current_user
from app.services.screener_service import get_screener

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/screener", tags=["screener"])


class FilterRequest(BaseModel):
    filters: dict  # e.g. {"pe_ratio": {"max": 20}, "roe": {"min": 15}}
    sort_by: str = "market_cap"
    sort_dir: str = "desc"


@router.get("/stocks")
async def get_stocks(
    page: int = Query(1, ge=1),
    per_page: int = Query(30, ge=10, le=100),
    sort_by: str = Query("market_cap"),
    sort_dir: str = Query("desc"),
    user=Depends(get_current_user),
):
    """Get paginated stock list with all KPIs."""
    screener = get_screener()
    try:
        result = await screener.get_all_stocks(
            page=page, per_page=per_page,
            sort_by=sort_by, sort_dir=sort_dir,
        )
        return result
    except Exception as e:
        logger.error("[screener] Failed to fetch stocks: %s", str(e)[:200])
        raise HTTPException(500, f"Screener error: {str(e)[:200]}")


@router.get("/stock/{symbol}")
async def get_stock_detail(
    symbol: str,
    user=Depends(get_current_user),
):
    """Get deep-dive financials for a single stock."""
    screener = get_screener()
    try:
        result = await screener.get_stock_detail(symbol.upper())
        return result
    except Exception as e:
        logger.error("[screener] Detail failed for %s: %s", symbol, str(e)[:200])
        raise HTTPException(500, f"Failed to fetch details: {str(e)[:200]}")


@router.post("/filter")
async def filter_stocks(
    req: FilterRequest,
    user=Depends(get_current_user),
):
    """Apply custom filters to stock universe."""
    screener = get_screener()
    try:
        result = await screener.filter_stocks(
            filters=req.filters,
            sort_by=req.sort_by,
            sort_dir=req.sort_dir,
        )
        return result
    except Exception as e:
        logger.error("[screener] Filter failed: %s", str(e)[:200])
        raise HTTPException(500, f"Filter error: {str(e)[:200]}")


@router.get("/presets")
async def get_presets(
    user=Depends(get_current_user),
):
    """Get pre-built screening strategies."""
    screener = get_screener()
    return await screener.get_presets()


@router.get("/breakout-scan")
async def breakout_scan(
    user=Depends(get_current_user),
):
    """Scan NSE stocks for breakout candidates using TradingView technical data."""
    import asyncio
    from app.services.technical_analysis import scan_breakouts

    loop = asyncio.get_event_loop()
    results = await loop.run_in_executor(None, scan_breakouts, None, 30)
    return {"breakout_candidates": results, "scanned": len(results)}


@router.get("/ta/{symbol}")
async def get_ta(
    symbol: str,
    user=Depends(get_current_user),
):
    """Get technical analysis (support/resistance, breakout score) for a stock."""
    import asyncio
    from app.services.technical_analysis import analyze_stock, ensure_instruments_loaded

    await ensure_instruments_loaded()

    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(None, analyze_stock, symbol.upper())
        return result
    except Exception as e:
        logger.error("[screener] TA failed for %s: %s", symbol, str(e)[:200])
        raise HTTPException(500, f"TA error: {str(e)[:200]}")
