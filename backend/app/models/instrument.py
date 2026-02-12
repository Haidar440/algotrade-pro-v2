"""
Module: app/models/instrument.py
Purpose: Instrument ORM model — represents a tradable security (stock, F&O, etc).
"""

from decimal import Decimal
from typing import Optional

from sqlalchemy import Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel


class Instrument(BaseModel):
    """A tradable security — populated from broker instrument master data.

    The instrument master is typically refreshed daily from the broker API
    and contains thousands of entries (NSE, BSE, NFO, MCX).

    Attributes:
        token: Broker-specific instrument token for API calls.
        symbol: Trading symbol (e.g., 'RELIANCE-EQ', 'NIFTY23DECFUT').
        name: Full human-readable name of the instrument.
        exch_seg: Exchange segment (NSE, BSE, NFO, MCX).
        instrumenttype: Type classification (EQ, FUTSTK, OPTIDX, etc.).
        tick_size: Minimum price movement for this instrument.
    """

    __tablename__ = "instruments"

    token: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    symbol: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    exch_seg: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    instrumenttype: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    tick_size: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 4), nullable=True)

    def __repr__(self) -> str:
        return f"<Instrument(token={self.token}, symbol={self.symbol}, exch={self.exch_seg})>"
