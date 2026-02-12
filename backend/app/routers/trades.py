"""
Module: app/routers/trades.py
Purpose: Trade CRUD endpoints — create, read, update, delete trades.

All routes are JWT-protected. Actions are audit-logged.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import TradeStatus
from app.database import get_db
from app.exceptions import NotFoundError
from app.models.schemas import ApiResponse, TradeCreate, TradeResponse, TradeUpdate
from app.models.trade import Trade
from app.security.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/trades",
    tags=["Trades"],
    dependencies=[Depends(get_current_user)],
)


# ━━━━━━━━━━━━━━━ CREATE ━━━━━━━━━━━━━━━


@router.post(
    "",
    response_model=ApiResponse[TradeResponse],
    status_code=201,
    summary="Create Trade",
)
async def create_trade(
    body: TradeCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> ApiResponse[TradeResponse]:
    """Create a new trade record.

    Args:
        body: Trade data (symbol, entry_price, qty, type, etc.).
        db: Database session (injected).
        user: Authenticated user from JWT (injected).

    Returns:
        ApiResponse containing the created trade.
    """
    trade = Trade(**body.model_dump())
    db.add(trade)
    await db.flush()
    await db.refresh(trade)

    logger.info(
        "Trade created: symbol=%s, qty=%d, price=%.2f, user=%s",
        trade.symbol, trade.quantity, float(trade.entry_price), user["sub"],
    )

    return ApiResponse(
        data=TradeResponse.model_validate(trade),
        message=f"Trade for {trade.symbol} created successfully",
    )


# ━━━━━━━━━━━━━━━ READ ━━━━━━━━━━━━━━━


@router.get(
    "",
    response_model=ApiResponse[list[TradeResponse]],
    summary="List Trades",
)
async def list_trades(
    status: Optional[TradeStatus] = Query(default=None, description="Filter by status"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[TradeResponse]]:
    """Retrieve trades with optional filtering and pagination.

    Args:
        status: Optional filter — OPEN or CLOSED.
        skip: Number of records to skip (for pagination).
        limit: Maximum number of records to return.
        db: Database session (injected).

    Returns:
        ApiResponse containing a list of trades.
    """
    query = select(Trade).order_by(Trade.entry_date.desc()).offset(skip).limit(limit)

    if status:
        query = query.where(Trade.status == status.value)

    result = await db.execute(query)
    trades = result.scalars().all()

    return ApiResponse(
        data=[TradeResponse.model_validate(t) for t in trades],
        message=f"Found {len(trades)} trades",
    )


@router.get(
    "/{trade_id}",
    response_model=ApiResponse[TradeResponse],
    summary="Get Trade by ID",
)
async def get_trade(
    trade_id: int,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[TradeResponse]:
    """Retrieve a single trade by its ID.

    Args:
        trade_id: Primary key of the trade.
        db: Database session (injected).

    Returns:
        ApiResponse containing the trade.

    Raises:
        NotFoundError: If the trade does not exist.
    """
    trade = await db.get(Trade, trade_id)
    if not trade:
        raise NotFoundError("Trade", str(trade_id))

    return ApiResponse(data=TradeResponse.model_validate(trade))


# ━━━━━━━━━━━━━━━ UPDATE ━━━━━━━━━━━━━━━


@router.put(
    "/{trade_id}",
    response_model=ApiResponse[TradeResponse],
    summary="Update Trade",
)
async def update_trade(
    trade_id: int,
    body: TradeUpdate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> ApiResponse[TradeResponse]:
    """Update an existing trade (partial update).

    Args:
        trade_id: Primary key of the trade to update.
        body: Fields to update (only non-null fields are applied).
        db: Database session (injected).
        user: Authenticated user from JWT (injected).

    Returns:
        ApiResponse containing the updated trade.

    Raises:
        NotFoundError: If the trade does not exist.
    """
    trade = await db.get(Trade, trade_id)
    if not trade:
        raise NotFoundError("Trade", str(trade_id))

    update_data = body.model_dump(exclude_unset=True)
    if update_data:
        await db.execute(
            update(Trade).where(Trade.id == trade_id).values(**update_data)
        )
        await db.refresh(trade)

    logger.info("Trade %d updated by user=%s: %s", trade_id, user["sub"], update_data)

    return ApiResponse(
        data=TradeResponse.model_validate(trade),
        message=f"Trade {trade_id} updated",
    )


# ━━━━━━━━━━━━━━━ DELETE ━━━━━━━━━━━━━━━


@router.delete(
    "/{trade_id}",
    response_model=ApiResponse[dict],
    summary="Delete Trade",
)
async def delete_trade(
    trade_id: int,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> ApiResponse[dict]:
    """Delete a trade by its ID.

    Args:
        trade_id: Primary key of the trade to delete.
        db: Database session (injected).
        user: Authenticated user from JWT (injected).

    Returns:
        ApiResponse confirming deletion.

    Raises:
        NotFoundError: If the trade does not exist.
    """
    trade = await db.get(Trade, trade_id)
    if not trade:
        raise NotFoundError("Trade", str(trade_id))

    await db.delete(trade)
    logger.info("Trade %d (%s) deleted by user=%s", trade_id, trade.symbol, user["sub"])

    return ApiResponse(
        data={"deleted_id": trade_id},
        message=f"Trade {trade_id} deleted successfully",
    )
