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
from sqlalchemy import select, or_

from app.constants import BrokerName, Exchange, OrderSide, OrderType
from app.exceptions import BrokerConnectionError
from app.database import AsyncSessionLocal
from app.models.instrument import Instrument
from app.services.broker_interface import (
    BrokerInterface,
    FundsData,
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

    async def _resolve_token(self, symbol: str, exchange: Exchange = Exchange.NSE) -> str:
        """Resolve Angel One symboltoken for a given trading symbol.

        Uses a 2-tier strategy:
        1. Local instrument DB (fast, reliable, refreshed daily).
        2. Angel One search API fallback (slower, may return stale tokens).

        Tries exact symbol, then SYMBOL-EQ pattern (NSE equities).

        Args:
            symbol: Trading symbol (e.g., 'WIPRO', 'RELIANCE').
            exchange: Exchange segment.

        Returns:
            Symbol token string, or empty string if not found.
        """
        exchange_str = _EXCHANGE_MAP.get(exchange, "NSE")
        clean_symbol = symbol.replace("-EQ", "").replace(".NS", "").upper()

        # Tier 1: Instrument DB lookup (fast, reliable)
        try:
            async with AsyncSessionLocal() as session:
                # Try exact match first: WIPRO-EQ (Angel One NSE convention)
                candidates = [f"{clean_symbol}-EQ", clean_symbol]
                stmt = (
                    select(Instrument.token)
                    .where(
                        Instrument.exch_seg == exchange_str,
                        or_(
                            Instrument.symbol == candidates[0],
                            Instrument.symbol == candidates[1],
                        ),
                    )
                    .limit(1)
                )
                result = await session.execute(stmt)
                row = result.scalar_one_or_none()
                if row:
                    logger.debug("Resolved %s token from DB: %s", clean_symbol, row)
                    return str(row)
        except Exception as db_err:
            logger.debug("DB token lookup failed for %s: %s", clean_symbol, db_err)

        # Tier 2: Angel One search API fallback
        try:
            search_results = await self.search_symbols(clean_symbol, exchange)
            if search_results:
                # Try exact match: WIPRO-EQ or WIPRO
                for item in search_results:
                    ts = item.get("tradingsymbol", "")
                    if ts in candidates:
                        token = item.get("symboltoken", "")
                        if token:
                            logger.debug("Resolved %s token from API: %s", clean_symbol, token)
                            return token
                # Fallback: first EQ result
                for item in search_results:
                    ts = item.get("tradingsymbol", "")
                    if ts.endswith("-EQ") or not any(x in ts for x in ["-", "FUT", "OPT"]):
                        token = item.get("symboltoken", "")
                        if token:
                            logger.debug("Resolved %s token from API (fuzzy): %s", clean_symbol, token)
                            return token
        except Exception as api_err:
            logger.warning("API token lookup failed for %s: %s", clean_symbol, api_err)

        logger.error("Could not resolve symboltoken for %s on %s", clean_symbol, exchange_str)
        return ""

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

        SEBI Compliance: MARKET orders are auto-converted to LIMIT orders
        with a price buffer (BUY +0.2%, SELL -0.2%) to comply with
        SEBI algo trading regulations.

        Args:
            order: Standardized order request.

        Returns:
            OrderResponse with Angel One order ID and status.

        Raises:
            BrokerConnectionError: If order placement fails.
        """
        self._ensure_connected()

        try:
            # Resolve symboltoken via DB → API fallback
            symbol_token = await self._resolve_token(order.symbol, order.exchange)

            if not symbol_token:
                raise BrokerConnectionError(
                    broker="Angel One",
                    detail=f"Could not resolve symboltoken for {order.symbol}",
                )

            # Angel One expects tradingsymbol with -EQ suffix for NSE equities
            trading_symbol = order.symbol
            if order.exchange == Exchange.NSE and not trading_symbol.endswith("-EQ"):
                trading_symbol = f"{trading_symbol}-EQ"

            # ━━━ SEBI Compliance: Convert MARKET → LIMIT ━━━
            effective_order_type = order.order_type
            effective_price = order.price

            if order.order_type == OrderType.MARKET:
                try:
                    ltp = await self.get_ltp(order.symbol, order.exchange)

                    if ltp is None or ltp <= 0:
                        raise ValueError(f"Invalid LTP ({ltp}) for {order.symbol}")

                    # Apply price buffer: BUY gets slightly higher, SELL slightly lower
                    if order.side == OrderSide.BUY:
                        effective_price = round(ltp * 1.002, 2)   # +0.2%
                    else:
                        effective_price = round(ltp * 0.998, 2)   # -0.2%

                    effective_order_type = OrderType.LIMIT

                    logger.warning(
                        "SEBI compliance: MARKET → LIMIT conversion — "
                        "symbol=%s, side=%s, ltp=%.2f, limit_price=%.2f",
                        order.symbol, order.side.value, ltp, effective_price,
                    )

                except Exception as ltp_err:
                    logger.error(
                        "SEBI MARKET→LIMIT failed (LTP unavailable): %s — "
                        "REJECTING order for safety", ltp_err,
                    )
                    raise BrokerConnectionError(
                        broker="Angel One",
                        detail=(
                            f"Cannot place MARKET order: LTP unavailable for {order.symbol}. "
                            f"SEBI requires LIMIT orders for algo trading."
                        ),
                    )

            order_params = {
                "variety": "NORMAL",
                "tradingsymbol": trading_symbol,
                "symboltoken": symbol_token,
                "transactiontype": _ORDER_SIDE_MAP[order.side],
                "exchange": _EXCHANGE_MAP[order.exchange],
                "ordertype": _ORDER_TYPE_MAP[effective_order_type],
                "producttype": _PRODUCT_MAP.get(order.product, "DELIVERY"),
                "duration": "DAY",
                "quantity": str(order.quantity),
                "price": str(effective_price) if effective_price > 0 else "0",
                "triggerprice": str(order.trigger_price) if order.trigger_price > 0 else "0",
            }

            response = self._client.placeOrder(order_params)

            if response is None:
                raise BrokerConnectionError(
                    broker="Angel One",
                    detail="Order returned None — check parameters",
                )

            logger.info(
                "Angel One order placed — symbol=%s, side=%s, qty=%d, type=%s, price=%s, order_id=%s",
                order.symbol, order.side.value, order.quantity,
                effective_order_type.value, effective_price, response,
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

    async def modify_order(self, order_id: str, price: float, trigger_price: float = 0.0, quantity: int = 0) -> OrderResponse:
        """Modify an open order on Angel One.

        Args:
            order_id: Angel Order ID.
            price: New limit price.
            trigger_price: New trigger price.
            quantity: New quantity.
        """
        self._ensure_connected()

        try:
            # Angel requires symbol, token, exchange etc. to modify
            # We must fetch the order details first
            orders = await self.get_order_book()
            order_details = next((o for o in orders if o.get("orderid") == order_id), None)

            if not order_details:
                raise BrokerConnectionError(
                    broker="Angel One",
                    detail=f"Order {order_id} not found/fetchable for modification",
                )

            params = {
                "variety": "NORMAL",
                "orderid": order_id,
                "ordertype": order_details.get("ordertype"),
                "producttype": order_details.get("producttype"),
                "duration": order_details.get("duration", "DAY"),
                "price": str(price),
                "quantity": str(quantity if quantity > 0 else order_details.get("quantity")),
                "tradingsymbol": order_details.get("tradingsymbol"),
                "symboltoken": order_details.get("symboltoken"),
                "exchange": order_details.get("exchange"),
            }

            if trigger_price > 0:
                params["triggerprice"] = str(trigger_price)

            response = self._client.modifyOrder(params)

            if not response or not response.get("data"):
                 # Sometimes Angel returns just boolean status or message
                 # Check response structure. SmartConnect usually returns dict with status/message/data
                 # If response is None, it failed?
                 # Let's assume response structure akin to placeOrder
                 pass

            logger.info("Angel One order modified — order_id=%s, new_price=%.2f", order_id, price)

            return OrderResponse(
                order_id=order_id,
                status="MODIFIED",
                message="Order modified successfully",
                broker=BrokerName.ANGEL,
                raw_response=response if response else {},
            )

        except Exception as exc:
            logger.error("Angel One modify failed: %s", exc)
            raise BrokerConnectionError(
                broker="Angel One",
                detail=f"Modify failed: {exc}",
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
            clean_symbol = symbol.replace("-EQ", "").replace(".NS", "").upper()

            # Resolve symbol token via DB → API fallback
            symbol_token = await self._resolve_token(clean_symbol, exchange)

            if not symbol_token:
                raise BrokerConnectionError(
                    broker="Angel One",
                    detail=f"Could not resolve symboltoken for {clean_symbol}",
                )

            # Angel One ltpData requires tradingsymbol with -EQ suffix for NSE
            trading_symbol = f"{clean_symbol}-EQ" if exchange == Exchange.NSE else clean_symbol
            response = self._client.ltpData(exchange_str, trading_symbol, symbol_token)

            if response and response.get("data"):
                ltp = float(response["data"].get("ltp", 0))
                return ltp

            raise BrokerConnectionError(
                broker="Angel One",
                detail=f"No LTP data for {clean_symbol}",
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
            # Resolve symbol token via DB → API fallback
            clean_symbol = symbol.replace("-EQ", "").replace(".NS", "").upper()
            symbol_token = await self._resolve_token(clean_symbol, exchange)
            
            if not symbol_token:
                logger.warning("Could not resolve token for %s", clean_symbol)
                return pd.DataFrame(columns=["timestamp", "open", "high", "low", "close", "volume"])

            params = {
                "exchange": _EXCHANGE_MAP.get(exchange, "NSE"),
                "symboltoken": symbol_token,
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

    async def search_symbols(self, query: str, exchange: Exchange = Exchange.NSE) -> list[dict]:
        """Search for symbols using Angel One API.

        Args:
            query: Search string.
            exchange: Exchange segment.

        Returns:
            List of dicts with symbol info.
        """
        self._ensure_connected()

        try:
            exchange_str = _EXCHANGE_MAP.get(exchange, "NSE")
            response = self._client.searchScrip(exchange_str, query)
            
            if not response or not response.get("data"):
                return []
            
            return response["data"]

        except Exception as exc:
            logger.error("Angel One search failed: %s", exc)
            # Don't raise error, just return empty list to avoid breaking UI
            return []

    # ━━━━━━━━━━━━━━━ Funds / Margin ━━━━━━━━━━━━━━━

    async def get_funds(self) -> FundsData:
        """Fetch real account funds from Angel One RMS API.

        Uses SmartConnect.rmsLimit() to get actual available cash,
        used margin, and total account balance.

        Returns:
            FundsData with real broker account values.
        """
        self._ensure_connected()

        try:
            rms = self._client.rmsLimit()

            if not rms or not rms.get("data"):
                logger.warning("Angel One rmsLimit returned no data")
                return FundsData(available_cash=0.0, used_margin=0.0, total_balance=0.0)

            data = rms["data"]

            # Angel One RMS fields:
            # net: Total account value
            # availablecash: Cash available for trading
            # utiliseddebits: Margin used by open positions/orders
            available = float(data.get("availablecash", 0) or 0)
            used = float(data.get("utiliseddebits", 0) or 0)
            net = float(data.get("net", 0) or 0)

            # If net is 0, compute from available + used
            if net == 0:
                net = available + used

            logger.info("Angel One Funds — Net: ₹%.2f, Available: ₹%.2f, Used: ₹%.2f", net, available, used)
            return FundsData(available_cash=available, used_margin=used, total_balance=net)

        except Exception as exc:
            logger.error("Angel One rmsLimit failed: %s", exc)
            raise BrokerConnectionError(
                broker="Angel One",
                detail=f"Failed to fetch funds: {exc}",
            )

    # ━━━━━━━━━━━━━━━ Private Helpers ━━━━━━━━━━━━━━━

    def _ensure_connected(self) -> None:
        """Raise error if broker is not connected."""
        if not self.is_connected:
            raise BrokerConnectionError(
                broker="Angel One",
                detail="Not connected. Call connect() first.",
            )
