"""
Module: app/models/watchlist.py
Purpose: Watchlist ORM model — user-defined stock groupings.
"""

from typing import Any

from sqlalchemy import String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel


class Watchlist(BaseModel):
    """A named list of stocks grouped by the user (e.g., 'Nifty 50', 'My Picks').

    Items are stored as JSONB for flexible schema — each item can contain
    symbol, token, exchange, and any custom user annotations.

    Attributes:
        name: Unique name of the watchlist.
        items: JSONB array of stock objects.
    """

    __tablename__ = "watchlists"

    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    items: Mapped[Any] = mapped_column(JSONB, default=list, nullable=False)

    def __repr__(self) -> str:
        item_count = len(self.items) if self.items else 0
        return f"<Watchlist(id={self.id}, name={self.name}, items={item_count})>"
