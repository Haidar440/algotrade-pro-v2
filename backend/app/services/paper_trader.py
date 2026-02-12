"""
Module: app/services/paper_trader.py
Purpose: Simulated trading engine — test strategies with virtual money.

NEVER touches real broker APIs. Uses a hard wall (assertion) to guarantee
no real money can be spent. Tracks positions, P&L, and trade history
exactly like a real broker would.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

import pandas as pd

from app.constants import BrokerName, Exchange, OrderSide, OrderType
from app.exceptions import BrokerConnectionError, RiskCheckFailedError
from app.services.broker_interface import (
    BrokerInterface,
    Holding,
    OrderRequest,
    OrderResponse,
    Position,
)

logger = logging.getLogger(__name__)


class PaperTrader(BrokerInterface):
    """Simulated broker — risk-free testing with virtual money.

    Hard safety wall: `_real_broker` is always None.
    An assertion check in place_order() ensures this class can
    NEVER accidentally interact with a real broker.

    Attributes:
        _capital: Current available cash (starts at starting_capital).
        _starting_capital: Initial virtual capital for reset.
        _positions: Dict of open positions keyed by symbol.
        _trade_history: List of all completed trades.
        _order_book: List of all orders placed.
        _connected: Simulated connection state.
        _real_broker: Hard wall — ALWAYS None.
    """

    def __init__(self, starting_capital: float = 100_000.0) -> None:
        """Initialize paper trader with virtual capital.

        Args:
            starting_capital: Starting virtual capital in ₹ (default ₹1,00,000).
        """
        self._starting_capital = starting_capital
        self._capital = starting_capital
        self._positions: dict[str, dict] = {}
        self._trade_history: list[dict] = []
        self._order_book: list[dict] = []
        self._connected: bool = False
        self._real_broker = None  # HARD WALL — never set this

    @property
    def broker_name(self) -> BrokerName:
        """Return Paper broker identifier."""
        return BrokerName.PAPER

    @property
    def is_connected(self) -> bool:
        """Paper trader is always 'connected' once initialized."""
        return self._connected

    @property
    def capital(self) -> float:
        """Current available cash balance."""
        return self._capital

    @property
    def total_pnl(self) -> float:
        """Total realized P&L from all closed trades."""
        return sum(t.get("pnl", 0) for t in self._trade_history)

    @property
    def portfolio_value(self) -> float:
        """Total portfolio value (cash + open positions at avg price)."""
        position_value = sum(
            pos["quantity"] * pos["average_price"]
            for pos in self._positions.values()
        )
        return self._capital + position_value

    async def connect(self, credentials: dict) -> bool:
        """Simulate broker connection — always succeeds.

        Args:
            credentials: Ignored for paper trading.

        Returns:
            Always True.
        """
        self._connected = True
        logger.info(
            "Paper Trader connected — capital=₹%.2f",
            self._capital,
        )
        return True

    async def disconnect(self) -> None:
        """Simulate disconnect."""
        self._connected = False
        logger.info("Paper Trader disconnected")

    async def place_order(self, order: OrderRequest) -> OrderResponse:
        """Simulate order execution with virtual money.

        SAFETY: Asserts _real_broker is None before every order.

        Args:
            order: Standardized order request.

        Returns:
            OrderResponse with simulated fill.

        Raises:
            RiskCheckFailedError: If insufficient virtual funds.
        """
        # ━━━ HARD WALL — Paper trader must NEVER have a real broker ━━━
        assert self._real_broker is None, \
            "CRITICAL: Paper trader has a real broker reference! This should NEVER happen."

        self._ensure_connected()

        order_id = f"PAPER-{uuid.uuid4().hex[:8].upper()}"
        now = datetime.now(timezone.utc)

        # Simulate fill at the order price (market orders use price=0, need LTP)
        fill_price = order.price if order.price > 0 else 0.0

        if order.side == OrderSide.BUY:
            return await self._execute_buy(order, order_id, fill_price, now)
        else:
            return await self._execute_sell(order, order_id, fill_price, now)

    async def cancel_order(self, order_id: str) -> OrderResponse:
        """Simulate order cancellation.

        Args:
            order_id: Paper order ID.

        Returns:
            OrderResponse with cancellation status.
        """
        # Mark in order book
        for entry in self._order_book:
            if entry["order_id"] == order_id and entry["status"] == "PLACED":
                entry["status"] = "CANCELLED"
                logger.info("Paper order cancelled — order_id=%s", order_id)
                return OrderResponse(
                    order_id=order_id,
                    status="CANCELLED",
                    message="Paper order cancelled",
                    broker=BrokerName.PAPER,
                )

        return OrderResponse(
            order_id=order_id,
            status="NOT_FOUND",
            message=f"Order {order_id} not found in paper order book",
            broker=BrokerName.PAPER,
        )

    async def get_positions(self) -> list[Position]:
        """Fetch current paper positions.

        Returns:
            List of Position objects for open positions.
        """
        self._ensure_connected()

        positions = []
        for symbol, pos in self._positions.items():
            positions.append(Position(
                symbol=symbol,
                exchange=pos.get("exchange", "NSE"),
                quantity=pos["quantity"],
                average_price=pos["average_price"],
                ltp=pos.get("ltp", pos["average_price"]),
                pnl=pos.get("unrealized_pnl", 0.0),
                product="DELIVERY",
            ))
        return positions

    async def get_holdings(self) -> list[Holding]:
        """Paper trader holdings = same as positions.

        Returns:
            List of Holding objects.
        """
        self._ensure_connected()

        holdings = []
        for symbol, pos in self._positions.items():
            holdings.append(Holding(
                symbol=symbol,
                quantity=pos["quantity"],
                average_price=pos["average_price"],
                ltp=pos.get("ltp", pos["average_price"]),
                pnl=pos.get("unrealized_pnl", 0.0),
            ))
        return holdings

    async def get_ltp(self, symbol: str, exchange: Exchange = Exchange.NSE) -> float:
        """Get simulated LTP — returns average price if held, else 0.

        For real LTP, integrate with a real data feed in a future sprint.

        Args:
            symbol: Trading symbol.
            exchange: Exchange segment.

        Returns:
            Last known price for the symbol.
        """
        if symbol in self._positions:
            return self._positions[symbol].get("ltp", self._positions[symbol]["average_price"])
        return 0.0

    async def get_historical(
        self,
        symbol: str,
        exchange: Exchange,
        interval: str,
        from_date: datetime,
        to_date: datetime,
    ) -> pd.DataFrame:
        """Paper trader does not support historical data.

        Returns:
            Empty DataFrame.
        """
        logger.warning("Paper trader does not support historical data — use a real broker")
        return pd.DataFrame(columns=["timestamp", "open", "high", "low", "close", "volume"])

    async def get_order_book(self) -> list[dict]:
        """Fetch paper order book.

        Returns:
            List of all paper orders.
        """
        return self._order_book

    def reset(self) -> None:
        """Reset paper trader to initial state — wipes all data."""
        self._capital = self._starting_capital
        self._positions.clear()
        self._trade_history.clear()
        self._order_book.clear()
        logger.info("Paper Trader reset — capital=₹%.2f", self._capital)

    def get_summary(self) -> dict:
        """Get paper trading summary.

        Returns:
            Dict with capital, P&L, positions, trade count.
        """
        return {
            "starting_capital": self._starting_capital,
            "current_capital": self._capital,
            "portfolio_value": self.portfolio_value,
            "total_pnl": self.total_pnl,
            "total_pnl_percent": (self.total_pnl / self._starting_capital) * 100 if self._starting_capital else 0,
            "open_positions": len(self._positions),
            "total_trades": len(self._trade_history),
            "is_connected": self._connected,
        }

    # ━━━━━━━━━━━━━━━ Private Helpers ━━━━━━━━━━━━━━━

    async def _execute_buy(
        self, order: OrderRequest, order_id: str, fill_price: float, now: datetime,
    ) -> OrderResponse:
        """Execute a simulated buy order."""
        cost = order.quantity * fill_price

        if cost > self._capital:
            self._record_order(order, order_id, "REJECTED", now, fill_price)
            raise RiskCheckFailedError(
                f"Insufficient paper funds. Need ₹{cost:,.2f}, have ₹{self._capital:,.2f}"
            )

        # Deduct cash
        self._capital -= cost

        # Update or create position
        if order.symbol in self._positions:
            existing = self._positions[order.symbol]
            total_qty = existing["quantity"] + order.quantity
            total_cost = (existing["quantity"] * existing["average_price"]) + cost
            existing["average_price"] = total_cost / total_qty if total_qty > 0 else 0
            existing["quantity"] = total_qty
        else:
            self._positions[order.symbol] = {
                "quantity": order.quantity,
                "average_price": fill_price,
                "exchange": order.exchange.value,
                "ltp": fill_price,
                "unrealized_pnl": 0.0,
                "bought_at": now.isoformat(),
            }

        self._record_order(order, order_id, "FILLED", now, fill_price)

        logger.info(
            "Paper BUY filled — %s x%d @ ₹%.2f | Capital: ₹%.2f",
            order.symbol, order.quantity, fill_price, self._capital,
        )

        return OrderResponse(
            order_id=order_id,
            status="PAPER_FILLED",
            message=f"Paper BUY: {order.symbol} x{order.quantity} @ ₹{fill_price:.2f}",
            broker=BrokerName.PAPER,
        )

    async def _execute_sell(
        self, order: OrderRequest, order_id: str, fill_price: float, now: datetime,
    ) -> OrderResponse:
        """Execute a simulated sell order."""
        if order.symbol not in self._positions:
            self._record_order(order, order_id, "REJECTED", now, fill_price)
            raise RiskCheckFailedError(
                f"No paper position in {order.symbol} to sell"
            )

        position = self._positions[order.symbol]

        if order.quantity > position["quantity"]:
            self._record_order(order, order_id, "REJECTED", now, fill_price)
            raise RiskCheckFailedError(
                f"Insufficient paper quantity. Have {position['quantity']}, want to sell {order.quantity}"
            )

        # Calculate P&L
        pnl = (fill_price - position["average_price"]) * order.quantity

        # Credit cash
        self._capital += order.quantity * fill_price

        # Update or remove position
        position["quantity"] -= order.quantity
        if position["quantity"] == 0:
            del self._positions[order.symbol]

        # Record trade
        self._trade_history.append({
            "symbol": order.symbol,
            "side": "SELL",
            "quantity": order.quantity,
            "entry_price": position["average_price"],
            "exit_price": fill_price,
            "pnl": pnl,
            "pnl_percent": (pnl / (position["average_price"] * order.quantity)) * 100 if position["average_price"] > 0 else 0,
            "closed_at": now.isoformat(),
        })

        self._record_order(order, order_id, "FILLED", now, fill_price)

        logger.info(
            "Paper SELL filled — %s x%d @ ₹%.2f | P&L: ₹%.2f | Capital: ₹%.2f",
            order.symbol, order.quantity, fill_price, pnl, self._capital,
        )

        return OrderResponse(
            order_id=order_id,
            status="PAPER_FILLED",
            message=f"Paper SELL: {order.symbol} x{order.quantity} @ ₹{fill_price:.2f} | P&L: ₹{pnl:.2f}",
            broker=BrokerName.PAPER,
        )

    def _record_order(
        self,
        order: OrderRequest,
        order_id: str,
        status: str,
        timestamp: datetime,
        fill_price: float,
    ) -> None:
        """Record an order in the paper order book."""
        self._order_book.append({
            "order_id": order_id,
            "symbol": order.symbol,
            "exchange": order.exchange.value,
            "side": order.side.value,
            "order_type": order.order_type.value,
            "quantity": order.quantity,
            "price": fill_price,
            "status": status,
            "timestamp": timestamp.isoformat(),
        })

    def _ensure_connected(self) -> None:
        """Raise error if paper trader is not connected."""
        if not self._connected:
            raise BrokerConnectionError(
                broker="Paper Trader",
                detail="Not connected. Call connect() first.",
            )
