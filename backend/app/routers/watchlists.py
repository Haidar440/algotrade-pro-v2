"""
Module: app/routers/watchlists.py
Purpose: Watchlist CRUD endpoints — create, read, update, delete stock lists.
         Includes standalone stock search via Instrument table (no broker needed).
         Includes live price quotes via yfinance (no broker needed).

All routes are JWT-protected.
"""

import logging
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, Body, Depends, Query
from sqlalchemy import select, or_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.exceptions import ConflictError, NotFoundError
from app.models.instrument import Instrument
from app.models.schemas import ApiResponse, InstrumentResponse, WatchlistCreate, WatchlistResponse
from app.models.watchlist import Watchlist
from app.security.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/watchlists",
    tags=["Watchlists"],
    dependencies=[Depends(get_current_user)],
)


# ━━━━━━━━━━━━━━━ SEARCH (Instrument DB) ━━━━━━━━━━━━━━━


@router.get(
    "/search",
    response_model=ApiResponse[list[InstrumentResponse]],
    summary="Search Instruments",
)
async def search_instruments(
    q: str = Query(..., min_length=1, max_length=50, description="Search query"),
    exchange: str = Query("NSE", description="Exchange segment filter"),
    equity_only: bool = Query(True, description="Show only equity (EQ) stocks"),
    limit: int = Query(20, ge=1, le=100, description="Max results"),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> ApiResponse[list[InstrumentResponse]]:
    """Search for stocks/instruments from the Instrument database.

    No broker connection required — queries the locally cached instrument master.
    Searches by symbol and name, filtered by exchange segment.

    Args:
        q: Search string (e.g. 'RELIANCE', 'TCS', 'INFY').
        exchange: Exchange segment filter (NSE, BSE, NFO). Default NSE.
        limit: Maximum results to return (1-100). Default 20.
        db: Database session (injected).
        user: Authenticated user from JWT (injected).

    Returns:
        ApiResponse containing matching instruments.
    """
    query_upper = q.strip().upper()

    # Build filter conditions
    conditions = [
        Instrument.exch_seg == exchange.upper(),
        or_(
            func.upper(Instrument.symbol).contains(query_upper),
            func.upper(Instrument.name).contains(query_upper),
        ),
    ]

    # Filter EQ-only: exclude -BE, -BL, futures, options etc.
    if equity_only:
        conditions.append(
            or_(
                Instrument.symbol.endswith("-EQ"),
                # Also include symbols without suffix (some instruments)
                Instrument.instrumenttype == "EQ",
            )
        )

    # Build search query — prioritize exact symbol match, then LIKE
    stmt = (
        select(Instrument)
        .where(*conditions)
        # Prioritize: exact match first, then starts-with, then contains
        .order_by(
            # Exact symbol match gets priority 0
            (func.upper(Instrument.symbol) == query_upper).desc(),
            # Starts-with gets priority 1
            func.upper(Instrument.symbol).startswith(query_upper).desc(),
            # Then alphabetical
            Instrument.symbol,
        )
        .limit(limit)
    )

    result = await db.execute(stmt)
    instruments = result.scalars().all()

    return ApiResponse(
        data=[InstrumentResponse.model_validate(i) for i in instruments],
        message=f"Found {len(instruments)} results for '{q}'",
    )


# ━━━━━━━━━━━━━━━ QUOTES (yfinance — no broker needed) ━━━━━━━━━━━━━━━

# Thread pool for blocking yfinance calls
_yf_executor = ThreadPoolExecutor(max_workers=4)


def _fetch_yfinance_quotes(symbols: list[str]) -> dict[str, dict]:
    """Fetch live quotes from yfinance using batch download (fast).

    Args:
        symbols: List of trading symbols (e.g. ['RELIANCE-EQ', 'TCS-EQ']).

    Returns:
        Dict mapping symbol → {price, changePercent, dayHigh, dayLow}.
    """
    try:
        import yfinance as yf
    except ImportError:
        logger.warning("yfinance not installed — cannot fetch quotes")
        return {}

    quotes: dict[str, dict] = {}

    # Build symbol mapping: original → yfinance format
    sym_map: dict[str, str] = {}
    for s in symbols:
        clean = s.replace("-EQ", "").replace("-BE", "")
        yf_sym = f"{clean}.NS"
        sym_map[s] = yf_sym

    yf_symbols = list(sym_map.values())

    try:
        # Batch download — single HTTP call for all symbols (MUCH faster)
        tickers = yf.Tickers(" ".join(yf_symbols))

        for original, yf_sym in sym_map.items():
            try:
                ticker = tickers.tickers.get(yf_sym)
                if not ticker:
                    quotes[original] = {"price": 0, "changePercent": 0}
                    continue

                info = ticker.fast_info
                price = getattr(info, "last_price", 0) or 0
                prev_close = getattr(info, "previous_close", 0) or 0
                day_high = getattr(info, "day_high", 0) or 0
                day_low = getattr(info, "day_low", 0) or 0

                change_pct = 0.0
                if prev_close > 0 and price > 0:
                    change_pct = round(((price - prev_close) / prev_close) * 100, 2)

                quotes[original] = {
                    "price": round(price, 2),
                    "changePercent": change_pct,
                    "dayHigh": round(day_high, 2),
                    "dayLow": round(day_low, 2),
                    "prevClose": round(prev_close, 2),
                }
            except Exception as exc:
                logger.warning("Quote extraction failed for %s: %s", original, exc)
                quotes[original] = {"price": 0, "changePercent": 0}

    except Exception as exc:
        logger.error("yfinance batch fetch failed: %s", exc)
        # Fallback: return zeros for all
        for s in symbols:
            quotes[s] = {"price": 0, "changePercent": 0}

    return quotes


@router.post(
    "/quotes",
    response_model=ApiResponse[dict],
    summary="Get Live Quotes",
)
async def get_quotes(
    symbols: list[str] = Body(..., embed=True, description="List of symbols"),
    user: dict = Depends(get_current_user),
) -> ApiResponse[dict]:
    """Fetch live price quotes for a list of symbols via yfinance.

    No broker connection required. Uses Yahoo Finance for real-time prices.

    Args:
        symbols: List of trading symbols (e.g. ['RELIANCE-EQ', 'TCS-EQ']).

    Returns:
        ApiResponse with dict mapping symbol → quote data.
    """
    if len(symbols) > 50:
        symbols = symbols[:50]  # Cap at 50 to prevent abuse

    import asyncio
    loop = asyncio.get_event_loop()
    quotes = await loop.run_in_executor(_yf_executor, _fetch_yfinance_quotes, symbols)

    return ApiResponse(
        data=quotes,
        message=f"Fetched quotes for {len(quotes)} symbols",
    )


# ━━━━━━━━━━━━━━━ LIST ━━━━━━━━━━━━━━━


@router.get(
    "",
    response_model=ApiResponse[list[WatchlistResponse]],
    summary="List Watchlists",
)
async def list_watchlists(
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[WatchlistResponse]]:
    """Retrieve all watchlists.

    Returns:
        ApiResponse containing a list of all watchlists with their items.
    """
    result = await db.execute(select(Watchlist).order_by(Watchlist.name))
    watchlists = result.scalars().all()

    return ApiResponse(
        data=[WatchlistResponse.model_validate(w) for w in watchlists],
        message=f"Found {len(watchlists)} watchlists",
    )


@router.get(
    "/names",
    response_model=ApiResponse[list[str]],
    summary="List Watchlist Names",
)
async def list_watchlist_names(
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[str]]:
    """Retrieve only the names of all watchlists (lightweight endpoint).

    Returns:
        ApiResponse containing a list of watchlist names.
    """
    result = await db.execute(select(Watchlist.name).order_by(Watchlist.name))
    names = result.scalars().all()
    return ApiResponse(data=list(names))


# ━━━━━━━━━━━━━━━ GET BY NAME ━━━━━━━━━━━━━━━


@router.get(
    "/{name}",
    response_model=ApiResponse[WatchlistResponse],
    summary="Get Watchlist by Name",
)
async def get_watchlist(
    name: str,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[WatchlistResponse]:
    """Retrieve a single watchlist by its name.

    Args:
        name: Unique name of the watchlist.
        db: Database session (injected).

    Returns:
        ApiResponse containing the watchlist.

    Raises:
        NotFoundError: If the watchlist does not exist.
    """
    result = await db.execute(select(Watchlist).where(Watchlist.name == name))
    watchlist = result.scalar_one_or_none()
    if not watchlist:
        raise NotFoundError("Watchlist", name)

    return ApiResponse(data=WatchlistResponse.model_validate(watchlist))


# ━━━━━━━━━━━━━━━ CREATE / UPDATE (Upsert) ━━━━━━━━━━━━━━━


@router.post(
    "",
    response_model=ApiResponse[WatchlistResponse],
    status_code=201,
    summary="Create or Update Watchlist",
)
async def upsert_watchlist(
    body: WatchlistCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> ApiResponse[WatchlistResponse]:
    """Create a new watchlist or update an existing one (upsert by name).

    Args:
        body: Watchlist name and items.
        db: Database session (injected).
        user: Authenticated user from JWT (injected).

    Returns:
        ApiResponse containing the created/updated watchlist.
    """
    result = await db.execute(select(Watchlist).where(Watchlist.name == body.name))
    existing = result.scalar_one_or_none()

    if existing:
        existing.items = body.items
        watchlist = existing
        action = "updated"
    else:
        watchlist = Watchlist(name=body.name, items=body.items)
        db.add(watchlist)
        action = "created"

    await db.flush()
    await db.refresh(watchlist)

    logger.info(
        "Watchlist '%s' %s by user=%s (items=%d)",
        watchlist.name, action, user["sub"], len(watchlist.items or []),
    )

    return ApiResponse(
        data=WatchlistResponse.model_validate(watchlist),
        message=f"Watchlist '{watchlist.name}' {action}",
    )


# ━━━━━━━━━━━━━━━ DELETE ━━━━━━━━━━━━━━━


@router.delete(
    "/{name}",
    response_model=ApiResponse[dict],
    summary="Delete Watchlist",
)
async def delete_watchlist(
    name: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> ApiResponse[dict]:
    """Delete a watchlist by its name.

    Args:
        name: Unique name of the watchlist to delete.
        db: Database session (injected).
        user: Authenticated user from JWT (injected).

    Returns:
        ApiResponse confirming deletion.

    Raises:
        NotFoundError: If the watchlist does not exist.
    """
    result = await db.execute(select(Watchlist).where(Watchlist.name == name))
    watchlist = result.scalar_one_or_none()
    if not watchlist:
        raise NotFoundError("Watchlist", name)

    await db.delete(watchlist)
    logger.info("Watchlist '%s' deleted by user=%s", name, user["sub"])

    return ApiResponse(
        data={"deleted_name": name},
        message=f"Watchlist '{name}' deleted successfully",
    )
