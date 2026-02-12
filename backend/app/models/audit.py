"""
Module: app/models/audit.py
Purpose: Audit log ORM model — immutable record of every critical action.

Every login, order, kill switch activation, and error is logged here.
This table is append-only — records are never updated or deleted.
"""

from decimal import Decimal
from typing import Optional

from sqlalchemy import Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.constants import AuditAction, AuditCategory
from app.models.base import BaseModel


class AuditLog(BaseModel):
    """Immutable audit trail entry for accountability and debugging.

    Attributes:
        user: Who performed the action (username, 'system', or 'telegram').
        action: What happened (from AuditAction enum).
        category: Grouping category for filtering (from AuditCategory enum).
        symbol: Related stock symbol (null for non-trade events).
        details: JSON-serialized context (stringified for simplicity).
        ip_address: Client IP address (for auth events).
        price: Related price (for trade events).
        quantity: Related quantity (for trade events).
    """

    __tablename__ = "audit_logs"

    user: Mapped[str] = mapped_column(String(100), default="system", nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    symbol: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    price: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    quantity: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    def __repr__(self) -> str:
        return (
            f"<AuditLog(id={self.id}, action={self.action}, "
            f"user={self.user}, symbol={self.symbol})>"
        )
