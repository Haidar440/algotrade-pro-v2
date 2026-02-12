"""
Module: app/models/base.py
Purpose: Abstract base model with shared columns — DRY pattern.

Every ORM model inherits from this, automatically getting:
- Auto-incrementing primary key (id)
- Created timestamp (created_at)
- Updated timestamp (updated_at)
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class BaseModel(Base):
    """Abstract base for all ORM models — provides common columns.

    Subclasses automatically get `id`, `created_at`, and `updated_at`.
    Set `__abstract__ = True` so SQLAlchemy doesn't create a table for this.

    Attributes:
        id: Auto-incrementing primary key.
        created_at: Timestamp when the record was created (set by DB).
        updated_at: Timestamp of the last update (set by DB on change).
    """

    __abstract__ = True

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=True,
    )

    def __repr__(self) -> str:
        """Generic repr showing class name and primary key."""
        return f"<{self.__class__.__name__}(id={self.id})>"
