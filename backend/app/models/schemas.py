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


# ━━━━━━━━━━━━━━━ AI & Analysis Schemas (Sprint 3) ━━━━━━━━━━━━━━━


class TechnicalIndicatorsSchema(BaseModel):
    """Technical indicator values for API response."""

    rsi: float
    macd_line: float
    macd_signal: float
    macd_histogram: float
    adx: float
    ema_9: float
    ema_21: float
    ema_50: float
    ema_200: float
    bb_upper: float
    bb_middle: float
    bb_lower: float
    atr: float
    volume_ratio: float
    mfi: float
    supertrend_direction: int
    current_price: float
    day_change_pct: float


class TechnicalSignalsSchema(BaseModel):
    """Signal interpretation for API response."""

    rsi_signal: str
    macd_signal: str
    ema_signal: str
    adx_signal: str
    supertrend_signal: str
    bb_signal: str
    volume_signal: str


class TechnicalAnalysisSchema(BaseModel):
    """Full technical analysis for API response."""

    indicators: TechnicalIndicatorsSchema
    signals: TechnicalSignalsSchema
    market_condition: str
    overall_signal: str
    signal_strength: float
    support: float
    resistance: float
    summary: str


class AIAnalysisSchema(BaseModel):
    """AI-powered stock analysis response."""

    symbol: str
    signal: str
    confidence: float
    predicted_direction: str
    target_price: float
    stop_loss: float
    time_horizon: str
    reasoning: str
    key_factors: list[str]
    risk_level: str
    news_sentiment: str = "NEUTRAL"


class StockPickSchema(BaseModel):
    """A single stock recommendation."""

    symbol: str
    score: float
    rating: str
    price: float
    entry_range: str
    stop_loss: float
    target: float
    risk_reward: str
    shares: int
    investment: float
    risk_amount: float
    reasons: list[str]


class StockPicksResponse(BaseModel):
    """Response for stock picks endpoint."""

    capital: float
    total_scanned: int
    picks_found: int
    top_picks: list[StockPickSchema]


class NewsArticleSchema(BaseModel):
    """A single news article from search."""

    title: str
    url: str
    content: str
    score: float


class NewsSearchSchema(BaseModel):
    """News search response."""

    symbol: str
    query: str
    articles: list[NewsArticleSchema]
    sentiment: Optional[str] = None
    sentiment_score: Optional[float] = None
    sentiment_summary: Optional[str] = None
    article_count: int


class PerformanceMetricsSchema(BaseModel):
    """Portfolio performance metrics response."""

    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate: float
    total_pnl: float
    average_pnl: float
    profit_factor: float
    sharpe_ratio: float
    max_drawdown: float
    max_drawdown_amount: float
    best_trade: float
    worst_trade: float
    best_streak: int
    worst_streak: int
    current_streak: int
    risk_reward_ratio: float
    expectancy: float
    avg_holding_days: float


# ━━━━━━━━━━━━━━━ Backtesting Schemas (Sprint 4) ━━━━━━━━━━━━━━━


class BacktestRequest(BaseModel):
    """Request body for running a backtest."""
    strategy_name: str = Field(
        ..., examples=["supertrend_rsi"],
        description="Strategy identifier from /api/backtest/strategies",
    )
    symbol: str = Field(
        default="RELIANCE", examples=["RELIANCE", "TCS", "INFY"],
        description="NSE stock symbol",
    )
    cash: float = Field(default=1_000_000, gt=0, description="Starting capital in ₹")
    commission: float = Field(
        default=0.002, ge=0, le=0.01,
        description="Round-trip commission (0.002 = 0.2% covers Indian market costs)",
    )
    days: int = Field(default=365, ge=30, le=3650, description="Historical days to test")
    params: Optional[dict] = Field(
        default=None,
        description="Override default strategy parameters",
    )


class BacktestResult(BaseModel):
    """Response body for backtest results."""
    success: bool
    stats: dict = Field(default_factory=dict)
    chart_html: str = Field(default="", description="Base64-encoded interactive HTML chart")
    strategy_info: dict = Field(default_factory=dict)
    data_info: dict = Field(default_factory=dict)
    error: Optional[str] = None


class StrategyInfo(BaseModel):
    """Strategy metadata returned by list endpoint."""
    name: str
    description: str
    strategy_type: str
    default_params: dict
    expected_win_rate: str
    source: str = ""


class OptimizeRequest(BaseModel):
    """Request body for strategy optimization."""
    strategy_name: str = Field(..., examples=["supertrend_rsi"])
    symbol: str = Field(default="RELIANCE", examples=["RELIANCE"])
    cash: float = Field(default=1_000_000, gt=0)
    commission: float = Field(default=0.002, ge=0, le=0.01)
    days: int = Field(default=365, ge=30, le=3650)
    maximize: str = Field(
        default="Return [%]",
        examples=["Return [%]", "Sharpe Ratio", "Win Rate [%]"],
        description="Metric to maximize during optimization",
    )


class OptimizeResult(BaseModel):
    """Response body for optimization results."""
    success: bool
    best_params: dict = Field(default_factory=dict)
    stats: dict = Field(default_factory=dict)
    maximize: str = ""
    symbol: str = ""
    error: Optional[str] = None

