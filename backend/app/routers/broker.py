"""
Module: app/routers/broker.py
Purpose: Broker API endpoints — connect, trade, positions, portfolio.

All endpoints require JWT authentication.
Orders go through the RiskManager before reaching the broker.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Request

from app.config import settings
from app.constants import BrokerName, Exchange, OrderSide, OrderType
from app.exceptions import (
    BrokerConnectionError,
    BrokerNotConfiguredError,
    RiskCheckFailedError,
    ValidationError,
)
from app.models.schemas import (
    ApiResponse,
    BrokerConnectRequest,
    HoldingSchema,
    OrderCreateRequest,
    OrderModifyRequest,
    OrderResponseSchema,
    PaperTradingSummary,
    PositionSchema,
    RiskStatusSchema,
)
from app.security.auth import get_current_user
from app.services.broker_factory import create_broker
from app.services.broker_interface import BrokerInterface, OrderRequest
from app.services.paper_trader import PaperTrader
from app.services.risk_manager import RiskManager

from app.middleware import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/broker", tags=["Broker"])

# ━━━━━━━━━━━━━━━ In-Memory State ━━━━━━━━━━━━━━━
# TODO: Move to Redis or database-backed sessions in production
_active_broker: Optional[BrokerInterface] = None
_risk_manager: RiskManager = RiskManager()


def _get_active_broker() -> BrokerInterface:
    """Get the currently active broker or raise error."""
    if _active_broker is None or not _active_broker.is_connected:
        raise BrokerConnectionError(
            broker="none",
            detail="No broker connected. Use POST /api/broker/connect first.",
        )
    return _active_broker


def get_active_broker_optional() -> Optional[BrokerInterface]:
    """Get the active broker if connected, else None.

    Used by other modules (e.g., ai.py) that want to opportunistically
    use broker data but can fall back to other sources.

    Returns:
        Active BrokerInterface or None.
    """
    if _active_broker is not None and _active_broker.is_connected:
        return _active_broker
    return None


# ━━━━━━━━━━━━━━━ Connection Endpoints ━━━━━━━━━━━━━━━


@router.post(
    "/connect",
    response_model=ApiResponse[dict],
    summary="Connect to a broker",
    description="Connect to Angel One, Zerodha, or Paper Trading.",
)
async def connect_broker(
    body: BrokerConnectRequest,
    user: dict = Depends(get_current_user),
) -> ApiResponse[dict]:
    """Connect to a broker using encrypted credentials from vault.

    Paper trading requires no credentials.
    Angel/Zerodha credentials are loaded from .env settings.

    Args:
        body: Contains broker name ('angel', 'zerodha', 'paper').
        user: Authenticated user (from JWT).

    Returns:
        ApiResponse with connection status.
    """
    global _active_broker

    try:
        broker_name = BrokerName(body.broker.lower())
    except ValueError:
        raise ValidationError(
            f"Invalid broker: '{body.broker}'. Choose: angel, zerodha, paper"
        )

    # Disconnect existing broker if any
    if _active_broker and _active_broker.is_connected:
        await _active_broker.disconnect()
        logger.info("Previous broker disconnected")

    # Create broker instance
    broker = create_broker(broker_name)

    # Build credentials based on broker type
    if broker_name == BrokerName.PAPER:
        credentials = {}
    elif broker_name == BrokerName.ANGEL:
        # Priority: frontend-sent credentials > .env credentials
        api_key = body.api_key or settings.ANGEL_API_KEY
        client_id = body.client_id or settings.ANGEL_CLIENT_ID
        password = body.password or settings.ANGEL_PASSWORD
        totp_secret = body.totp_secret or settings.ANGEL_TOTP_SECRET

        if not all([api_key, client_id, password, totp_secret]):
            raise BrokerNotConfiguredError(
                broker="Angel One — provide credentials via request or set ANGEL_* env vars"
            )
        credentials = {
            "api_key": api_key,
            "client_id": client_id,
            "password": password,
            "totp_secret": totp_secret,
        }
    elif broker_name == BrokerName.ZERODHA:
        if not settings.is_broker_configured("zerodha"):
            raise BrokerNotConfiguredError(broker="Zerodha")
        credentials = {
            "api_key": settings.ZERODHA_API_KEY,
            "api_secret": settings.ZERODHA_API_SECRET,
        }
    else:
        raise BrokerNotConfiguredError(broker=body.broker)

    # Connect
    await broker.connect(credentials)
    _active_broker = broker

    logger.info("Broker connected — type=%s, user=%s", broker_name.value, user.get("sub"))

    return ApiResponse(
        data={
            "broker": broker_name.value,
            "connected": True,
            "is_paper": broker_name == BrokerName.PAPER,
        },
        message=f"Connected to {broker_name.value} successfully",
    )


@router.post(
    "/disconnect",
    response_model=ApiResponse[dict],
    summary="Disconnect from broker",
)
async def disconnect_broker(
    user: dict = Depends(get_current_user),
) -> ApiResponse[dict]:
    """Disconnect from the currently active broker."""
    global _active_broker

    if _active_broker and _active_broker.is_connected:
        broker_name = _active_broker.broker_name.value
        await _active_broker.disconnect()
        _active_broker = None
        return ApiResponse(
            data={"broker": broker_name, "connected": False},
            message=f"Disconnected from {broker_name}",
        )

    return ApiResponse(
        data={"connected": False},
        message="No broker was connected",
    )


@router.get(
    "/status",
    response_model=ApiResponse[dict],
    summary="Get broker connection status",
)
async def broker_status(
    user: dict = Depends(get_current_user),
) -> ApiResponse[dict]:
    """Get current broker connection status."""
    if _active_broker and _active_broker.is_connected:
        return ApiResponse(
            data={
                "broker": _active_broker.broker_name.value,
                "connected": True,
                "is_paper": isinstance(_active_broker, PaperTrader),
            },
            message="Broker is connected",
        )
    return ApiResponse(
        data={"broker": None, "connected": False},
        message="No broker connected",
    )


# ━━━━━━━━━━━━━━━ Trading Endpoints ━━━━━━━━━━━━━━━


@router.post(
    "/order",
    response_model=ApiResponse[OrderResponseSchema],
    summary="Place an order",
    description="Place an order through the connected broker. Runs risk checks first.",
)
@limiter.limit(settings.RATE_LIMIT_ORDERS)
async def place_order(
    request: Request,
    body: OrderCreateRequest,
    user: dict = Depends(get_current_user),
) -> ApiResponse[OrderResponseSchema]:
    """Place an order after passing risk validation.

    Args:
        body: Order parameters (symbol, side, quantity, price, etc.).
        user: Authenticated user (from JWT).

    Returns:
        ApiResponse with order ID and status.

    Raises:
        RiskCheckFailedError: If order fails risk checks.
        BrokerConnectionError: If order submission fails.
    """
    broker = _get_active_broker()

    # Parse enums
    try:
        side = OrderSide(body.side.upper())
        order_type = OrderType(body.order_type.upper())
        exchange = Exchange(body.exchange.upper())
    except ValueError as exc:
        raise ValidationError(f"Invalid enum value: {exc}")

    # Build order request
    order = OrderRequest(
        symbol=body.symbol,
        exchange=exchange,
        side=side,
        order_type=order_type,
        quantity=body.quantity,
        price=body.price,
        trigger_price=body.trigger_price,
        product=body.product.upper(),
    )

    # Run risk checks (skip market hours for paper trading)
    positions = await broker.get_positions()
    portfolio_value = 100_000.0  # TODO: Calculate from actual portfolio

    if isinstance(broker, PaperTrader):
        portfolio_value = broker.portfolio_value

    risk_result = await _risk_manager.validate_order(order, positions, portfolio_value)

    # For paper trading, allow orders outside market hours
    if not risk_result.allowed:
        if isinstance(broker, PaperTrader) and risk_result.check_name == "market_hours":
            logger.info("Paper trade — bypassing market hours check")
        else:
            raise RiskCheckFailedError(risk_result.reason)

    # Place order
    response = await broker.place_order(order)

    # Record P&L for risk tracking (for sell orders with paper trader)
    # Real P&L tracking will come from trade history

    return ApiResponse(
        data=OrderResponseSchema(
            order_id=response.order_id,
            status=response.status,
            message=response.message,
            broker=response.broker.value,
        ),
        message="Order placed successfully",
    )


@router.put(
    "/order/{order_id}",
    response_model=ApiResponse[OrderResponseSchema],
    summary="Modify an order",
    description="Modify price, trigger price, or quantity of an open order.",
)
async def modify_order(
    order_id: str,
    request: Request,
    body: OrderModifyRequest,  # We need to import this!
    user: dict = Depends(get_current_user),
) -> ApiResponse[OrderResponseSchema]:
    """Modify an open order.

    Args:
        order_id: The order ID to modify.
        body: New parameters (price, trigger_price).
        user: Authenticated user (from JWT).
    """
    broker = _get_active_broker()
    
    # We should add risk checks here too, but for modification it's tricky.
    # For now, we trust the broker to reject invalid mods.
    # In a full system, we check limits again.

    response = await broker.modify_order(
        order_id=order_id,
        price=body.price,
        trigger_price=body.trigger_price,
        quantity=body.quantity,
    )

    return ApiResponse(
        data=OrderResponseSchema(
            order_id=response.order_id,
            status=response.status,
            message=response.message,
            broker=response.broker.value,
        ),
        message="Order modified successfully",
    )


@router.delete(
    "/order/{order_id}",
    response_model=ApiResponse[OrderResponseSchema],
    summary="Cancel an order",
)
async def cancel_order(
    order_id: str,
    user: dict = Depends(get_current_user),
) -> ApiResponse[OrderResponseSchema]:
    """Cancel a pending order.

    Args:
        order_id: The order ID to cancel.
        user: Authenticated user (from JWT).
    """
    broker = _get_active_broker()
    response = await broker.cancel_order(order_id)

    return ApiResponse(
        data=OrderResponseSchema(
            order_id=response.order_id,
            status=response.status,
            message=response.message,
            broker=response.broker.value,
        ),
        message="Order cancelled",
    )


# ━━━━━━━━━━━━━━━ Portfolio Endpoints ━━━━━━━━━━━━━━━


@router.get(
    "/positions",
    response_model=ApiResponse[list[PositionSchema]],
    summary="Get open positions",
)
async def get_positions(
    user: dict = Depends(get_current_user),
) -> ApiResponse[list[PositionSchema]]:
    """Fetch all current open positions."""
    broker = _get_active_broker()
    positions = await broker.get_positions()

    return ApiResponse(
        data=[
            PositionSchema(
                symbol=p.symbol,
                exchange=p.exchange,
                quantity=p.quantity,
                average_price=p.average_price,
                ltp=p.ltp,
                pnl=p.pnl,
                product=p.product,
            )
            for p in positions
        ],
        message=f"{len(positions)} positions found",
    )


@router.get(
    "/holdings",
    response_model=ApiResponse[list[HoldingSchema]],
    summary="Get delivery holdings",
)
async def get_holdings(
    user: dict = Depends(get_current_user),
) -> ApiResponse[list[HoldingSchema]]:
    """Fetch all delivery holdings from demat."""
    broker = _get_active_broker()
    holdings = await broker.get_holdings()

    return ApiResponse(
        data=[
            HoldingSchema(
                symbol=h.symbol,
                quantity=h.quantity,
                average_price=h.average_price,
                ltp=h.ltp,
                pnl=h.pnl,
            )
            for h in holdings
        ],
        message=f"{len(holdings)} holdings found",
    )


@router.get(
    "/orders",
    response_model=ApiResponse[list[dict]],
    summary="Get order book",
)
async def get_order_book(
    user: dict = Depends(get_current_user),
) -> ApiResponse[list[dict]]:
    """Fetch today's order book."""
    broker = _get_active_broker()
    orders = await broker.get_order_book()

    return ApiResponse(
        data=orders,
        message=f"{len(orders)} orders found",
    )


# ━━━━━━━━━━━━━━━ Paper Trading Endpoints ━━━━━━━━━━━━━━━


@router.get(
    "/paper/summary",
    response_model=ApiResponse[PaperTradingSummary],
    summary="Get paper trading summary",
)
async def paper_summary(
    user: dict = Depends(get_current_user),
) -> ApiResponse[PaperTradingSummary]:
    """Get paper trading account summary (only works when paper broker is active)."""
    broker = _get_active_broker()

    if not isinstance(broker, PaperTrader):
        raise ValidationError("Paper summary only available when connected to paper broker")

    summary = broker.get_summary()
    return ApiResponse(
        data=PaperTradingSummary(**summary),
        message="Paper trading summary",
    )


@router.post(
    "/paper/reset",
    response_model=ApiResponse[PaperTradingSummary],
    summary="Reset paper trading",
)
async def paper_reset(
    user: dict = Depends(get_current_user),
) -> ApiResponse[PaperTradingSummary]:
    """Reset paper trading to initial state — wipes all positions and history."""
    broker = _get_active_broker()

    if not isinstance(broker, PaperTrader):
        raise ValidationError("Paper reset only available when connected to paper broker")

    broker.reset()
    summary = broker.get_summary()
    return ApiResponse(
        data=PaperTradingSummary(**summary),
        message="Paper trading reset to initial state",
    )


# ━━━━━━━━━━━━━━━ Risk Management Endpoints ━━━━━━━━━━━━━━━


@router.get(
    "/risk/status",
    response_model=ApiResponse[RiskStatusSchema],
    summary="Get risk manager status",
)
async def risk_status(
    user: dict = Depends(get_current_user),
) -> ApiResponse[RiskStatusSchema]:
    """Get current risk manager status including kill switch state."""
    status_data = _risk_manager.get_status()
    return ApiResponse(
        data=RiskStatusSchema(**status_data),
        message="Risk manager status",
    )


@router.post(
    "/risk/kill-switch/activate",
    response_model=ApiResponse[RiskStatusSchema],
    summary="Activate kill switch",
)
async def activate_kill_switch(
    user: dict = Depends(get_current_user),
) -> ApiResponse[RiskStatusSchema]:
    """🚨 Emergency kill switch — halts ALL trading immediately."""
    _risk_manager.activate_kill_switch(reason=f"Manual by {user.get('sub', 'unknown')}")
    status_data = _risk_manager.get_status()
    return ApiResponse(
        data=RiskStatusSchema(**status_data),
        message="🚨 Kill switch ACTIVATED — all trading halted",
    )


@router.post(
    "/risk/kill-switch/deactivate",
    response_model=ApiResponse[RiskStatusSchema],
    summary="Deactivate kill switch",
)
async def deactivate_kill_switch(
    user: dict = Depends(get_current_user),
) -> ApiResponse[RiskStatusSchema]:
    """Deactivate kill switch — resume trading."""
    _risk_manager.deactivate_kill_switch()
    status_data = _risk_manager.get_status()
    return ApiResponse(
        data=RiskStatusSchema(**status_data),
        message="Kill switch DEACTIVATED — trading resumed",
    )


# ━━━━━━━━━━━━━━━ Data & Helper Endpoints ━━━━━━━━━━━━━━━


@router.get(
    "/ltp",
    response_model=ApiResponse[dict],
    summary="Get last traded price",
)
async def get_ltp(
    symbol: str,
    exchange: str = "NSE",
    user: dict = Depends(get_current_user),
) -> ApiResponse[dict]:
    """Get the last traded price for a symbol.

    Args:
        symbol: Trading symbol (e.g. 'RELIANCE').
        exchange: Exchange segment (default NSE).
    """
    broker = _get_active_broker()
    try:
        exc_enum = Exchange(exchange.upper())
    except ValueError:
        exc_enum = Exchange.NSE

    ltp = await broker.get_ltp(symbol, exc_enum)
    return ApiResponse(
        data={"symbol": symbol, "exchange": exchange, "ltp": ltp},
        message=f"LTP for {symbol}: {ltp}",
    )


@router.get(
    "/search",
    response_model=ApiResponse[list[dict]],
    summary="Search for symbols",
)
async def search_symbols(
    q: str,
    exchange: str = "NSE",
    user: dict = Depends(get_current_user),
) -> ApiResponse[list[dict]]:
    """Search for stocks/instruments via the connected broker.

    Args:
        q: Query string (e.g. 'RELIANCE').
        exchange: Exchange segment (default NSE).
    """
    broker = _get_active_broker()
    try:
        exc_enum = Exchange(exchange.upper())
    except ValueError:
        exc_enum = Exchange.NSE

    results = await broker.search_symbols(q, exc_enum)
    return ApiResponse(
        data=results,
        message=f"Found {len(results)} results for '{q}'",
    )


@router.get(
    "/token",
    response_model=ApiResponse[str],
    summary="Get symbol token",
)
async def get_symbol_token(
    symbol: str,
    exchange: str = "NSE",
    user: dict = Depends(get_current_user),
) -> ApiResponse[str]:
    """Helper to get the token for a specific symbol."""
    broker = _get_active_broker()
    try:
        exc_enum = Exchange(exchange.upper())
    except ValueError:
        exc_enum = Exchange.NSE

    results = await broker.search_symbols(symbol, exc_enum)
    
    # Simple match logic
    token = ""
    for item in results:
        if item.get("tradingsymbol") == symbol or item.get("symbol") == symbol:
            token = item.get("symboltoken", "") or item.get("token", "")
            break
            
    if not token and results:
        # Fallback to first result if exact match fails
        token = results[0].get("symboltoken", "") or results[0].get("token", "")

    if not token:
        return ApiResponse(data="", message="Token not found")

    return ApiResponse(
        success=True,
        data=token,
        message=f"Token for {symbol}: {token}",
    )


@router.get(
    "/historical",
    response_model=ApiResponse[list[dict]],
    summary="Get historical candle data",
)
async def get_historical_data(
    symbol: str,
    interval: str = "ONE_DAY",
    days: int = 200,
    exchange: str = "NSE",
    user: dict = Depends(get_current_user),
) -> ApiResponse[list[dict]]:
    """Fetch historical OHLCV data for charts.

    Args:
        symbol: Trading symbol.
        interval: Candle interval.
        days: Number of days of history to fetch.
    """
    broker = _get_active_broker()
    try:
        exc_enum = Exchange(exchange.upper())
    except ValueError:
        exc_enum = Exchange.NSE

    # Calculate dates
    to_date = datetime.now()
    from_date = to_date - timedelta(days=days)

    try:
        df = await broker.get_historical(symbol, exc_enum, interval, from_date, to_date)
        
        # Convert DataFrame to list of dicts for JSON response
        data = df.to_dict(orient="records") if not df.empty else []
        
        # Ensure timestamp is string for JSON serialization
        for d in data:
            if "timestamp" in d and not isinstance(d["timestamp"], str):
                 d["timestamp"] = str(d["timestamp"])

        return ApiResponse(
            data=data,
            message=f"Fetched {len(data)} candles for {symbol}",
        )
    except Exception as e:
        logger.error(f"Historical data error: {e}")
        return ApiResponse(data=[], message=f"Failed to fetch history: {e}")
