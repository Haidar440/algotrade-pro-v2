"""
Module: app/services/broker_interface.py
Purpose: Unified broker abstraction — one interface, any broker.

All broker implementations (Angel One, Zerodha, Paper) must implement
this interface. This ensures the rest of the application is completely
decoupled from any specific broker's API.

Usage:
    broker: BrokerInterface = AngelOneBroker()
    await broker.connect(credentials)
    positions = await broker.get_positions()
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional

import pandas as pd

from app.constants import BrokerName, Exchange, OrderSide, OrderType


# ━━━━━━━━━━━━━━━ Data Classes ━━━━━━━━━━━━━━━


@dataclass
class OrderRequest:
    """Standardized order request — broker-agnostic.

    Attributes:
        symbol: Trading symbol (e.g., 'RELIANCE-EQ').
        exchange: Exchange segment (NSE, BSE, NFO, MCX).
        side: BUY or SELL.
        order_type: MARKET, LIMIT, SL, SL-M.
        quantity: Number of shares/lots.
        price: Limit price (required for LIMIT/SL orders, ignored for MARKET).
        trigger_price: Stop-loss trigger price (required for SL/SL-M orders).
        product: Product type — 'INTRADAY' or 'DELIVERY'.
    """

    symbol: str
    exchange: Exchange
    side: OrderSide
    order_type: OrderType
    quantity: int
    price: float = 0.0
    trigger_price: float = 0.0
    product: str = "DELIVERY"


@dataclass
class OrderResponse:
    """Standardized order response — returned by all brokers.

    Attributes:
        order_id: Broker-assigned order ID.
        status: Order status (PLACED, REJECTED, FILLED, etc.).
        message: Human-readable status message.
        broker: Which broker processed the order.
        raw_response: Full broker response for debugging.
    """

    order_id: str
    status: str
    message: str
    broker: BrokerName
    raw_response: dict = field(default_factory=dict)


@dataclass
class Position:
    """A currently open position — standardized across brokers.

    Attributes:
        symbol: Trading symbol.
        exchange: Exchange segment.
        quantity: Net quantity (positive = long, negative = short).
        average_price: Average entry price.
        ltp: Last traded price.
        pnl: Unrealized profit/loss.
        product: Product type (INTRADAY/DELIVERY).
    """

    symbol: str
    exchange: str
    quantity: int
    average_price: float
    ltp: float
    pnl: float
    product: str


@dataclass
class Holding:
    """A long-term holding — delivery stocks in demat.

    Attributes:
        symbol: Trading symbol.
        quantity: Number of shares held.
        average_price: Average buy price.
        ltp: Last traded price.
        pnl: Unrealized P&L.
    """

    symbol: str
    quantity: int
    average_price: float
    ltp: float
    pnl: float


# ━━━━━━━━━━━━━━━ Abstract Interface ━━━━━━━━━━━━━━━


class BrokerInterface(ABC):
    """Unified broker interface — all broker implementations inherit this.

    Credentials are NEVER stored as instance variables.
    Only session tokens/objects are kept after connect().

    Methods:
        connect: Authenticate with broker API.
        disconnect: Close the session.
        place_order: Submit an order.
        cancel_order: Cancel a pending order.
        get_positions: Fetch current open positions.
        get_holdings: Fetch delivery holdings.
        get_ltp: Get last traded price for a symbol.
        get_historical: Fetch OHLCV candle data.
        get_order_book: Fetch today's order history.
    """

    @property
    @abstractmethod
    def broker_name(self) -> BrokerName:
        """Return the broker identifier."""
        ...

    @property
    @abstractmethod
    def is_connected(self) -> bool:
        """Check if the broker session is active."""
        ...

    @abstractmethod
    async def connect(self, credentials: dict) -> bool:
        """Authenticate with the broker API.

        Args:
            credentials: Decrypted credential dict from vault.
                Angel: {api_key, client_id, password, totp_secret}
                Zerodha: {api_key, api_secret, request_token}

        Returns:
            True if connection succeeded.

        Raises:
            BrokerConnectionError: If authentication fails.
        """
        ...

    @abstractmethod
    async def disconnect(self) -> None:
        """Close the broker session and clean up resources."""
        ...

    @abstractmethod
    async def place_order(self, order: OrderRequest) -> OrderResponse:
        """Submit an order to the broker.

        Args:
            order: Standardized order request.

        Returns:
            OrderResponse with broker-assigned order ID and status.

        Raises:
            BrokerConnectionError: If order submission fails.
        """
        ...

    @abstractmethod
    async def cancel_order(self, order_id: str) -> OrderResponse:
        """Cancel a pending order.

        Args:
            order_id: Broker-assigned order ID.

        Returns:
            OrderResponse with cancellation status.
        """
        ...

    @abstractmethod
    async def get_positions(self) -> list[Position]:
        """Fetch all current open positions.

        Returns:
            List of standardized Position objects.
        """
        ...

    @abstractmethod
    async def get_holdings(self) -> list[Holding]:
        """Fetch all delivery holdings from demat.

        Returns:
            List of standardized Holding objects.
        """
        ...

    @abstractmethod
    async def get_ltp(self, symbol: str, exchange: Exchange = Exchange.NSE) -> float:
        """Get last traded price for a symbol.

        Args:
            symbol: Trading symbol.
            exchange: Exchange segment (default NSE).

        Returns:
            Last traded price as float.
        """
        ...

    @abstractmethod
    async def get_historical(
        self,
        symbol: str,
        exchange: Exchange,
        interval: str,
        from_date: datetime,
        to_date: datetime,
    ) -> pd.DataFrame:
        """Fetch historical OHLCV candle data.

        Args:
            symbol: Trading symbol.
            exchange: Exchange segment.
            interval: Candle timeframe (e.g., 'ONE_DAY', 'FIVE_MINUTE').
            from_date: Start date.
            to_date: End date.

        Returns:
            DataFrame with columns: [timestamp, open, high, low, close, volume].
        """
        ...

    @abstractmethod
    async def get_order_book(self) -> list[dict]:
        """Fetch today's order book (all orders placed today).

        Returns:
            List of order dictionaries.
        """
        ...
