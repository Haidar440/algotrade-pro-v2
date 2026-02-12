"""
Module: app/services/zerodha_broker.py
Purpose: Zerodha Kite broker integration via kiteconnect SDK.

Implements the BrokerInterface for Zerodha Kite Connect API.
Requires a request_token obtained via Kite's OAuth login flow.
"""

import logging
from datetime import datetime

import pandas as pd
from kiteconnect import KiteConnect

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

# ━━━━━━━━━━━━━━━ Zerodha Exchange Mapping ━━━━━━━━━━━━━━━

_EXCHANGE_MAP: dict[Exchange, str] = {
    Exchange.NSE: "NSE",
    Exchange.BSE: "BSE",
    Exchange.NFO: "NFO",
    Exchange.MCX: "MCX",
}

_ORDER_TYPE_MAP: dict[OrderType, str] = {
    OrderType.MARKET: "MARKET",
    OrderType.LIMIT: "LIMIT",
    OrderType.SL: "SL",
    OrderType.SL_M: "SL-M",
}

_ORDER_SIDE_MAP: dict[OrderSide, str] = {
    OrderSide.BUY: "BUY",
    OrderSide.SELL: "SELL",
}

_PRODUCT_MAP: dict[str, str] = {
    "INTRADAY": "MIS",
    "DELIVERY": "CNC",
}

_INTERVAL_MAP: dict[str, str] = {
    "ONE_MINUTE": "minute",
    "FIVE_MINUTE": "5minute",
    "FIFTEEN_MINUTE": "15minute",
    "ONE_HOUR": "60minute",
    "ONE_DAY": "day",
}


class ZerodhaBroker(BrokerInterface):
    """Zerodha Kite Connect broker implementation.

    Connects via kiteconnect SDK. Requires a request_token from
    Kite's OAuth flow to generate an access_token.

    Attributes:
        _kite: KiteConnect instance (set after connect).
        _connected: Connection state flag.
    """

    def __init__(self) -> None:
        """Initialize with no connection."""
        self._kite: KiteConnect | None = None
        self._connected: bool = False

    @property
    def broker_name(self) -> BrokerName:
        """Return Zerodha broker identifier."""
        return BrokerName.ZERODHA

    @property
    def is_connected(self) -> bool:
        """Check if Zerodha session is active."""
        return self._connected and self._kite is not None

    async def connect(self, credentials: dict) -> bool:
        """Authenticate with Zerodha Kite Connect.

        Args:
            credentials: Dict with keys:
                - api_key: Kite API key.
                - api_secret: Kite API secret.
                - request_token: OAuth request token (from Kite login redirect).
                  OR
                - access_token: Pre-existing access token (for session reuse).

        Returns:
            True if connection succeeded.

        Raises:
            BrokerConnectionError: If login fails.
        """
        try:
            api_key = credentials["api_key"]
            self._kite = KiteConnect(api_key=api_key)

            # If access_token is provided, skip the token generation step
            if credentials.get("access_token"):
                self._kite.set_access_token(credentials["access_token"])
            else:
                # Generate session from request_token
                api_secret = credentials["api_secret"]
                request_token = credentials["request_token"]
                session = self._kite.generate_session(
                    request_token,
                    api_secret=api_secret,
                )
                self._kite.set_access_token(session["access_token"])

            # Verify connection by fetching profile
            profile = self._kite.profile()
            self._connected = True

            logger.info(
                "Zerodha connected — user=%s, email=%s",
                profile.get("user_id", "unknown"),
                profile.get("email", "unknown"),
            )
            return True

        except BrokerConnectionError:
            raise
        except Exception as exc:
            logger.error("Zerodha connection failed: %s", exc)
            self._connected = False
            raise BrokerConnectionError(
                broker="Zerodha",
                detail=str(exc),
            )

    async def disconnect(self) -> None:
        """Invalidate the Zerodha session."""
        try:
            if self._kite and self._connected:
                self._kite.invalidate_access_token()
                logger.info("Zerodha session invalidated")
        except Exception as exc:
            logger.warning("Error during Zerodha disconnect: %s", exc)
        finally:
            self._kite = None
            self._connected = False

    async def place_order(self, order: OrderRequest) -> OrderResponse:
        """Place an order via Zerodha Kite.

        Args:
            order: Standardized order request.

        Returns:
            OrderResponse with Zerodha order ID and status.

        Raises:
            BrokerConnectionError: If order placement fails.
        """
        self._ensure_connected()

        try:
            order_id = self._kite.place_order(
                variety=self._kite.VARIETY_REGULAR,
                exchange=_EXCHANGE_MAP.get(order.exchange, "NSE"),
                tradingsymbol=order.symbol,
                transaction_type=_ORDER_SIDE_MAP[order.side],
                quantity=order.quantity,
                product=_PRODUCT_MAP.get(order.product, "CNC"),
                order_type=_ORDER_TYPE_MAP[order.order_type],
                price=order.price if order.price > 0 else None,
                trigger_price=order.trigger_price if order.trigger_price > 0 else None,
            )

            logger.info(
                "Zerodha order placed — symbol=%s, side=%s, qty=%d, order_id=%s",
                order.symbol, order.side.value, order.quantity, order_id,
            )

            return OrderResponse(
                order_id=str(order_id),
                status="PLACED",
                message=f"Order placed successfully for {order.symbol}",
                broker=BrokerName.ZERODHA,
            )

        except Exception as exc:
            logger.error("Zerodha order failed: %s", exc)
            raise BrokerConnectionError(
                broker="Zerodha",
                detail=f"Order placement failed: {exc}",
            )

    async def cancel_order(self, order_id: str) -> OrderResponse:
        """Cancel a pending order on Zerodha.

        Args:
            order_id: Zerodha order ID.

        Returns:
            OrderResponse with cancellation status.
        """
        self._ensure_connected()

        try:
            self._kite.cancel_order(
                variety=self._kite.VARIETY_REGULAR,
                order_id=order_id,
            )
            logger.info("Zerodha order cancelled — order_id=%s", order_id)

            return OrderResponse(
                order_id=order_id,
                status="CANCELLED",
                message="Order cancelled successfully",
                broker=BrokerName.ZERODHA,
            )
        except Exception as exc:
            logger.error("Zerodha cancel failed: %s", exc)
            raise BrokerConnectionError(
                broker="Zerodha",
                detail=f"Cancel failed: {exc}",
            )

    async def get_positions(self) -> list[Position]:
        """Fetch current open positions from Zerodha.

        Returns:
            List of standardized Position objects.
        """
        self._ensure_connected()

        try:
            response = self._kite.positions()
            if not response or not response.get("net"):
                return []

            positions = []
            for pos in response["net"]:
                net_qty = int(pos.get("quantity", 0))
                if net_qty == 0:
                    continue
                positions.append(Position(
                    symbol=pos.get("tradingsymbol", ""),
                    exchange=pos.get("exchange", ""),
                    quantity=net_qty,
                    average_price=float(pos.get("average_price", 0)),
                    ltp=float(pos.get("last_price", 0)),
                    pnl=float(pos.get("pnl", 0)),
                    product=pos.get("product", ""),
                ))

            logger.info("Zerodha positions fetched — count=%d", len(positions))
            return positions

        except Exception as exc:
            logger.error("Zerodha positions fetch failed: %s", exc)
            raise BrokerConnectionError(
                broker="Zerodha",
                detail=f"Positions fetch failed: {exc}",
            )

    async def get_holdings(self) -> list[Holding]:
        """Fetch delivery holdings from Zerodha demat.

        Returns:
            List of standardized Holding objects.
        """
        self._ensure_connected()

        try:
            response = self._kite.holdings()
            if not response:
                return []

            holdings = []
            for h in response:
                holdings.append(Holding(
                    symbol=h.get("tradingsymbol", ""),
                    quantity=int(h.get("quantity", 0)),
                    average_price=float(h.get("average_price", 0)),
                    ltp=float(h.get("last_price", 0)),
                    pnl=float(h.get("pnl", 0)),
                ))

            logger.info("Zerodha holdings fetched — count=%d", len(holdings))
            return holdings

        except Exception as exc:
            logger.error("Zerodha holdings fetch failed: %s", exc)
            raise BrokerConnectionError(
                broker="Zerodha",
                detail=f"Holdings fetch failed: {exc}",
            )

    async def get_ltp(self, symbol: str, exchange: Exchange = Exchange.NSE) -> float:
        """Get last traded price from Zerodha.

        Args:
            symbol: Trading symbol.
            exchange: Exchange segment (default NSE).

        Returns:
            Last traded price.
        """
        self._ensure_connected()

        try:
            exchange_str = _EXCHANGE_MAP.get(exchange, "NSE")
            instrument = f"{exchange_str}:{symbol}"
            response = self._kite.ltp([instrument])

            if response and response.get(instrument):
                return float(response[instrument]["last_price"])

            raise BrokerConnectionError(
                broker="Zerodha",
                detail=f"No LTP data for {symbol}",
            )
        except BrokerConnectionError:
            raise
        except Exception as exc:
            logger.error("Zerodha LTP fetch failed: %s", exc)
            raise BrokerConnectionError(
                broker="Zerodha",
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
        """Fetch historical OHLCV data from Zerodha.

        Note: Requires instrument_token, not trading symbol.
        This is a simplified version — instrument lookup should be added.

        Args:
            symbol: Instrument token (as string).
            exchange: Exchange segment.
            interval: Candle interval.
            from_date: Start date.
            to_date: End date.

        Returns:
            DataFrame with columns: [timestamp, open, high, low, close, volume].
        """
        self._ensure_connected()

        try:
            kite_interval = _INTERVAL_MAP.get(interval, "day")
            data = self._kite.historical_data(
                instrument_token=int(symbol),
                from_date=from_date,
                to_date=to_date,
                interval=kite_interval,
            )

            if not data:
                return pd.DataFrame(columns=["timestamp", "open", "high", "low", "close", "volume"])

            df = pd.DataFrame(data)
            if "date" in df.columns:
                df = df.rename(columns={"date": "timestamp"})
            return df

        except Exception as exc:
            logger.error("Zerodha historical data fetch failed: %s", exc)
            raise BrokerConnectionError(
                broker="Zerodha",
                detail=f"Historical data fetch failed: {exc}",
            )

    async def get_order_book(self) -> list[dict]:
        """Fetch today's order book from Zerodha.

        Returns:
            List of order dictionaries.
        """
        self._ensure_connected()

        try:
            response = self._kite.orders()
            return response if response else []
        except Exception as exc:
            logger.error("Zerodha order book fetch failed: %s", exc)
            raise BrokerConnectionError(
                broker="Zerodha",
                detail=f"Order book fetch failed: {exc}",
            )

    # ━━━━━━━━━━━━━━━ Private Helpers ━━━━━━━━━━━━━━━

    def _ensure_connected(self) -> None:
        """Raise error if broker is not connected."""
        if not self.is_connected:
            raise BrokerConnectionError(
                broker="Zerodha",
                detail="Not connected. Call connect() first.",
            )
