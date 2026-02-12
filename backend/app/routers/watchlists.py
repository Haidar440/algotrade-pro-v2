"""
Module: app/routers/watchlists.py
Purpose: Watchlist CRUD endpoints — create, read, update, delete stock lists.

All routes are JWT-protected.
"""

import logging

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.exceptions import ConflictError, NotFoundError
from app.models.schemas import ApiResponse, WatchlistCreate, WatchlistResponse
from app.models.watchlist import Watchlist
from app.security.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/watchlists",
    tags=["Watchlists"],
    dependencies=[Depends(get_current_user)],
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
