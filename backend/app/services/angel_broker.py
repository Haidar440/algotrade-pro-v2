"""
Module: app/services/angel_broker.py
Purpose: Angel One broker integration via smartapi-python.

Implements the BrokerInterface for Angel One SmartAPI.
Credentials are decrypted from vault, used to authenticate,
then discarded — only session tokens are kept.
"""

import logging
from datetime import datetime

import pandas as pd
import pyotp
from SmartApi import SmartConnect

from app.constants import BrokerName, Exchange, OrderSide, OrderType
from app.exceptions import BrokerConnectionError
from app.services.broker_interface import (
    BrokerInterface,
    Holding,
    OrderRequest,
    OrderResponse,
    Position,
)

logger = logging.getLogger(__name__)

# ━━━━━━━━━━━━━━━ Angel One Exchange Mapping ━━━━━━━━━━━━━━━

_EXCHANGE_MAP: dict[Exchange, str] = {
    Exchange.NSE: "NSE",
    Exchange.BSE: "BSE",
    Exchange.NFO: "NFO",
    Exchange.MCX: "MCX",
}

_ORDER_TYPE_MAP: dict[OrderType, str] = {
    OrderType.MARKET: "MARKET",
    OrderType.LIMIT: "LIMIT",
    OrderType.SL: "STOPLOSS_LIMIT",
    OrderType.SL_M: "STOPLOSS_MARKET",
}

_ORDER_SIDE_MAP: dict[OrderSide, str] = {
    OrderSide.BUY: "BUY",
    OrderSide.SELL: "SELL",
}

_PRODUCT_MAP: dict[str, str] = {
    "INTRADAY": "INTRADAY",
    "DELIVERY": "DELIVERY",
}


class AngelOneBroker(BrokerInterface):
    """Angel One SmartAPI broker implementation.

    Connects via smartapi-python SDK. Credentials are used once during
    connect() and never stored — only the SmartConnect client object
    with an active session is retained.

    Attributes:
        _client: SmartConnect instance (set after connect).
        _session_data: Session metadata (tokens, feed token, etc.).
        _connected: Connection state flag.
    """

    def __init__(self) -> None:
        """Initialize with no connection."""
        self._client: SmartConnect | None = None
        self._session_data: dict | None = None
        self._connected: bool = False

    @property
    def broker_name(self) -> BrokerName:
        """Return Angel One broker identifier."""
        return BrokerName.ANGEL

    @property
    def is_connected(self) -> bool:
        """Check if Angel One session is active."""
        return self._connected and self._client is not None

    async def connect(self, credentials: dict) -> bool:
        """Authenticate with Angel One SmartAPI.

        Args:
            credentials: Dict with keys:
                - api_key: Angel One API key.
                - client_id: Angel One client ID.
                - password: Angel One PIN/password.
                - totp_secret: TOTP seed for 2FA.

        Returns:
            True if connection succeeded.

        Raises:
            BrokerConnectionError: If login fails.
        """
        try:
            api_key = credentials["api_key"]
            client_id = credentials["client_id"]
            password = credentials["password"]
            totp_secret = credentials["totp_secret"]

            # Generate TOTP code
            totp = pyotp.TOTP(totp_secret).now()

            # Create client and authenticate
            self._client = SmartConnect(api_key=api_key)
            session = self._client.generateSession(client_id, password, totp)

            if not session or not session.get("data"):
                raise BrokerConnectionError(
                    broker="Angel One",
                    detail=session.get("message", "Empty session response"),
                )

            self._session_data = session["data"]
            self._connected = True

            logger.info(
                "Angel One connected — client_id=%s, feed_token=%s",
                client_id,
                "present" if self._session_data.get("feedToken") else "missing",
            )
            return True

        except BrokerConnectionError:
            raise
        except Exception as exc:
            logger.error("Angel One connection failed: %s", exc)
            self._connected = False
            raise BrokerConnectionError(
                broker="Angel One",
                detail=str(exc),
            )

    async def disconnect(self) -> None:
        """Logout from Angel One session."""
        try:
            if self._client and self._connected:
                self._client.terminateSession(
                    self._session_data.get("clientcode", "")
                )
                logger.info("Angel One session terminated")
        except Exception as exc:
            logger.warning("Error during Angel One disconnect: %s", exc)
        finally:
            self._client = None
            self._session_data = None
            self._connected = False

    async def place_order(self, order: OrderRequest) -> OrderResponse:
        """Place an order via Angel One SmartAPI.

        Args:
            order: Standardized order request.

        Returns:
            OrderResponse with Angel One order ID and status.

        Raises:
            BrokerConnectionError: If order placement fails.
        """
        self._ensure_connected()

        try:
            order_params = {
                "variety": "NORMAL",
                "tradingsymbol": order.symbol,
                "symboltoken": "",  # Will be resolved via instrument lookup
                "transactiontype": _ORDER_SIDE_MAP[order.side],
                "exchange": _EXCHANGE_MAP[order.exchange],
                "ordertype": _ORDER_TYPE_MAP[order.order_type],
                "producttype": _PRODUCT_MAP.get(order.product, "DELIVERY"),
                "duration": "DAY",
                "quantity": str(order.quantity),
                "price": str(order.price) if order.price > 0 else "0",
                "triggerprice": str(order.trigger_price) if order.trigger_price > 0 else "0",
            }

            response = self._client.placeOrder(order_params)

            if response is None:
                raise BrokerConnectionError(
                    broker="Angel One",
                    detail="Order returned None — check parameters",
                )

            logger.info(
                "Angel One order placed — symbol=%s, side=%s, qty=%d, order_id=%s",
                order.symbol, order.side.value, order.quantity, response,
            )

            return OrderResponse(
                order_id=str(response),
                status="PLACED",
                message=f"Order placed successfully for {order.symbol}",
                broker=BrokerName.ANGEL,
            )

        except BrokerConnectionError:
            raise
        except Exception as exc:
            logger.error("Angel One order failed: %s", exc)
            raise BrokerConnectionError(
                broker="Angel One",
                detail=f"Order placement failed: {exc}",
            )

    async def cancel_order(self, order_id: str) -> OrderResponse:
        """Cancel a pending order on Angel One.

        Args:
            order_id: Angel One order ID.

        Returns:
            OrderResponse with cancellation status.
        """
        self._ensure_connected()

        try:
            response = self._client.cancelOrder(
                order_id=order_id,
                variety="NORMAL",
            )
            logger.info("Angel One order cancelled — order_id=%s", order_id)

            return OrderResponse(
                order_id=order_id,
                status="CANCELLED",
                message="Order cancelled successfully",
                broker=BrokerName.ANGEL,
                raw_response=response if isinstance(response, dict) else {},
            )
        except Exception as exc:
            logger.error("Angel One cancel failed: %s", exc)
            raise BrokerConnectionError(
                broker="Angel One",
                detail=f"Cancel failed: {exc}",
            )

    async def get_positions(self) -> list[Position]:
        """Fetch current open positions from Angel One.

        Returns:
            List of standardized Position objects.
        """
        self._ensure_connected()

        try:
            response = self._client.position()
            if not response or not response.get("data"):
                return []

            positions = []
            for pos in response["data"]:
                net_qty = int(pos.get("netqty", 0))
                if net_qty == 0:
                    continue
                positions.append(Position(
                    symbol=pos.get("tradingsymbol", ""),
                    exchange=pos.get("exchange", ""),
                    quantity=net_qty,
                    average_price=float(pos.get("averageprice", 0)),
                    ltp=float(pos.get("ltp", 0)),
                    pnl=float(pos.get("pnl", 0)),
                    product=pos.get("producttype", ""),
                ))

            logger.info("Angel One positions fetched — count=%d", len(positions))
            return positions

        except Exception as exc:
            logger.error("Angel One positions fetch failed: %s", exc)
            raise BrokerConnectionError(
                broker="Angel One",
                detail=f"Positions fetch failed: {exc}",
            )

    async def get_holdings(self) -> list[Holding]:
        """Fetch delivery holdings from Angel One demat.

        Returns:
            List of standardized Holding objects.
        """
        self._ensure_connected()

        try:
            response = self._client.holding()
            if not response or not response.get("data"):
                return []

            holdings = []
            for h in response["data"]:
                holdings.append(Holding(
                    symbol=h.get("tradingsymbol", ""),
                    quantity=int(h.get("quantity", 0)),
                    average_price=float(h.get("averageprice", 0)),
                    ltp=float(h.get("ltp", 0)),
                    pnl=float(h.get("pnl", 0)),
                ))

            logger.info("Angel One holdings fetched — count=%d", len(holdings))
            return holdings

        except Exception as exc:
            logger.error("Angel One holdings fetch failed: %s", exc)
            raise BrokerConnectionError(
                broker="Angel One",
                detail=f"Holdings fetch failed: {exc}",
            )

    async def get_ltp(self, symbol: str, exchange: Exchange = Exchange.NSE) -> float:
        """Get last traded price from Angel One.

        Args:
            symbol: Trading symbol.
            exchange: Exchange segment (default NSE).

        Returns:
            Last traded price.
        """
        self._ensure_connected()

        try:
            exchange_str = _EXCHANGE_MAP.get(exchange, "NSE")
            response = self._client.ltpData(exchange_str, symbol, "")

            if response and response.get("data"):
                ltp = float(response["data"].get("ltp", 0))
                return ltp

            raise BrokerConnectionError(
                broker="Angel One",
                detail=f"No LTP data for {symbol}",
            )
        except BrokerConnectionError:
            raise
        except Exception as exc:
            logger.error("Angel One LTP fetch failed: %s", exc)
            raise BrokerConnectionError(
                broker="Angel One",
                detail=f"LTP fetch failed: {exc}",
            )

    async def get_historical(
        self,
        symbol: str,
        exchange: Exchange,
        interval: str,
        from_date: datetime,
        to_date: datetime,
    ) -> pd.DataFrame:
        """Fetch historical OHLCV data from Angel One.

        Args:
            symbol: Trading symbol.
            exchange: Exchange segment.
            interval: Candle interval (e.g., 'ONE_DAY').
            from_date: Start date.
            to_date: End date.

        Returns:
            DataFrame with columns: [timestamp, open, high, low, close, volume].
        """
        self._ensure_connected()

        try:
            params = {
                "exchange": _EXCHANGE_MAP.get(exchange, "NSE"),
                "symboltoken": "",  # Needs instrument token lookup
                "interval": interval,
                "fromdate": from_date.strftime("%Y-%m-%d %H:%M"),
                "todate": to_date.strftime("%Y-%m-%d %H:%M"),
            }

            response = self._client.getCandleData(params)

            if not response or not response.get("data"):
                return pd.DataFrame(columns=["timestamp", "open", "high", "low", "close", "volume"])

            df = pd.DataFrame(
                response["data"],
                columns=["timestamp", "open", "high", "low", "close", "volume"],
            )
            df["timestamp"] = pd.to_datetime(df["timestamp"])
            return df

        except Exception as exc:
            logger.error("Angel One historical data fetch failed: %s", exc)
            raise BrokerConnectionError(
                broker="Angel One",
                detail=f"Historical data fetch failed: {exc}",
            )

    async def get_order_book(self) -> list[dict]:
        """Fetch today's order book from Angel One.

        Returns:
            List of order dictionaries.
        """
        self._ensure_connected()

        try:
            response = self._client.orderBook()
            if not response or not response.get("data"):
                return []
            return response["data"]
        except Exception as exc:
            logger.error("Angel One order book fetch failed: %s", exc)
            raise BrokerConnectionError(
                broker="Angel One",
                detail=f"Order book fetch failed: {exc}",
            )

    # ━━━━━━━━━━━━━━━ Private Helpers ━━━━━━━━━━━━━━━

    def _ensure_connected(self) -> None:
        """Raise error if broker is not connected."""
        if not self.is_connected:
            raise BrokerConnectionError(
                broker="Angel One",
                detail="Not connected. Call connect() first.",
            )
