"""
Module: app/models/schemas.py
Purpose: Pydantic request/response schemas — the API contract.

Separating request (Create/Update) from response (Response) models
ensures we never accidentally expose internal fields (like hashed passwords)
and always validate incoming data before it touches the database.
"""

from datetime import datetime, timezone
from typing import Generic, Optional, TypeVar

from pydantic import BaseModel, Field

from app.constants import OrderSide, OrderType, TradeSource, TradeStatus, TradeType

# ━━━━━━━━━━━━━━━ Generic API Response ━━━━━━━━━━━━━━━

T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    """Standard API response wrapper — every endpoint returns this shape.

    Ensures consistent response format across the entire API:
    { "success": true, "data": {...}, "message": "OK", "timestamp": "..." }
    """

    success: bool = True
    data: T
    message: str = "OK"
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ApiErrorResponse(BaseModel):
    """Standard error response — returned by the global error handler.

    Never exposes internal stack traces or implementation details.
    """

    success: bool = False
    error: str
    error_code: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ━━━━━━━━━━━━━━━ Auth Schemas ━━━━━━━━━━━━━━━


class LoginRequest(BaseModel):
    """Login endpoint request body."""

    username: str = Field(..., min_length=3, max_length=50, examples=["admin"])
    password: str = Field(..., min_length=4, max_length=100)


class TokenResponse(BaseModel):
    """JWT token returned after successful login."""

    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int


# ━━━━━━━━━━━━━━━ Trade Schemas ━━━━━━━━━━━━━━━


class TradeCreate(BaseModel):
    """Request body for creating a new trade."""

    symbol: str = Field(..., min_length=1, max_length=50, examples=["RELIANCE"])
    entry_price: float = Field(..., gt=0, examples=[2450.50])
    quantity: int = Field(..., gt=0, le=10000, examples=[10])
    type: TradeType = Field(default=TradeType.SWING)
    entry_date: datetime
    strategy: Optional[str] = Field(default=None, max_length=100)
    notes: Optional[str] = Field(default=None, max_length=1000)
    source: TradeSource = Field(default=TradeSource.MANUAL)


class TradeUpdate(BaseModel):
    """Request body for updating an existing trade (partial update)."""

    exit_price: Optional[float] = Field(default=None, gt=0)
    exit_date: Optional[datetime] = None
    pnl: Optional[float] = None
    status: Optional[TradeStatus] = None
    notes: Optional[str] = Field(default=None, max_length=1000)


class TradeResponse(BaseModel):
    """Trade data returned to the client."""

    id: int
    symbol: str
    entry_price: float
    quantity: int
    type: str
    status: str
    entry_date: datetime
    exit_date: Optional[datetime] = None
    exit_price: Optional[float] = None
    pnl: Optional[float] = None
    strategy: Optional[str] = None
    notes: Optional[str] = None
    source: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ━━━━━━━━━━━━━━━ Watchlist Schemas ━━━━━━━━━━━━━━━


class WatchlistCreate(BaseModel):
    """Request body for creating/updating a watchlist."""

    name: str = Field(..., min_length=1, max_length=100, examples=["My Picks"])
    items: list[dict] = Field(default_factory=list)


class WatchlistResponse(BaseModel):
    """Watchlist data returned to the client."""

    id: int
    name: str
    items: list[dict]
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ━━━━━━━━━━━━━━━ Instrument Schemas ━━━━━━━━━━━━━━━


class InstrumentResponse(BaseModel):
    """Instrument search result returned to the client."""

    token: str
    symbol: str
    name: Optional[str] = None
    exch_seg: str

    model_config = {"from_attributes": True}


# ━━━━━━━━━━━━━━━ Health Check ━━━━━━━━━━━━━━━


class HealthResponse(BaseModel):
    """Health check response."""

    status: str = "healthy"
    version: str
    environment: str
    database: str = "connected"


# ━━━━━━━━━━━━━━━ Broker Schemas ━━━━━━━━━━━━━━━


class BrokerConnectRequest(BaseModel):
    """Request body for connecting to a broker."""

    broker: str = Field(..., examples=["angel", "zerodha", "paper"], description="Broker name")


class OrderCreateRequest(BaseModel):
    """Request body for placing an order."""

    symbol: str = Field(..., min_length=1, max_length=100, examples=["RELIANCE-EQ"])
    exchange: str = Field(default="NSE", examples=["NSE", "BSE", "NFO"])
    side: str = Field(..., examples=["BUY", "SELL"])
    order_type: str = Field(default="MARKET", examples=["MARKET", "LIMIT", "SL"])
    quantity: int = Field(..., gt=0, le=10000, examples=[10])
    price: float = Field(default=0.0, ge=0, examples=[2450.50])
    trigger_price: float = Field(default=0.0, ge=0)
    product: str = Field(default="DELIVERY", examples=["DELIVERY", "INTRADAY"])


class OrderResponseSchema(BaseModel):
    """Order response returned to the client."""

    order_id: str
    status: str
    message: str
    broker: str


class PositionSchema(BaseModel):
    """A single position returned to the client."""

    symbol: str
    exchange: str
    quantity: int
    average_price: float
    ltp: float
    pnl: float
    product: str


class HoldingSchema(BaseModel):
    """A single holding returned to the client."""

    symbol: str
    quantity: int
    average_price: float
    ltp: float
    pnl: float


class PaperTradingSummary(BaseModel):
    """Paper trading account summary."""

    starting_capital: float
    current_capital: float
    portfolio_value: float
    total_pnl: float
    total_pnl_percent: float
    open_positions: int
    total_trades: int
    is_connected: bool


class RiskStatusSchema(BaseModel):
    """Risk manager current status."""

    kill_switch_active: bool
    daily_pnl: float
    daily_trades: int
    max_order_value: int
    max_daily_loss: int
    max_positions: int
    max_position_pct: int
    daily_loss_remaining: float
