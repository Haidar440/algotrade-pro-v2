"""
Module: app/models/trade.py
Purpose: Trade ORM model — represents a trading position (open or closed).
"""

from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import DateTime, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.constants import TradeSource, TradeStatus, TradeType
from app.models.base import BaseModel


class Trade(BaseModel):
    """A trading position — tracks entry, exit, P&L, and strategy used.

    Attributes:
        symbol: Stock symbol (e.g., 'RELIANCE', 'TCS').
        entry_price: Price at which the position was entered.
        quantity: Number of shares.
        type: SWING or INTRADAY (from TradeType enum).
        status: OPEN or CLOSED (from TradeStatus enum).
        entry_date: When the trade was entered.
        exit_date: When the trade was closed (null if still open).
        exit_price: Price at which the position was exited (null if open).
        pnl: Profit/Loss in ₹ (null if open).
        strategy: Name of the strategy that triggered this trade.
        notes: Optional free-text notes.
        source: How the trade was initiated — MANUAL, AUTO, or PAPER.
    """

    __tablename__ = "trades"

    symbol: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    entry_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    type: Mapped[str] = mapped_column(
        String(20),
        default=TradeType.SWING.value,
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default=TradeStatus.OPEN.value,
        nullable=False,
        index=True,
    )
    entry_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    exit_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    exit_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    pnl: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    strategy: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(
        String(20),
        default=TradeSource.MANUAL.value,
        nullable=False,
    )

    def __repr__(self) -> str:
        return (
            f"<Trade(id={self.id}, symbol={self.symbol}, "
            f"status={self.status}, pnl={self.pnl})>"
        )
