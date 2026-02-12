"""
Module: app/database.py
Purpose: Async PostgreSQL database engine, session factory, and base model.

Uses SQLAlchemy 2.0 async engine with asyncpg driver.
All database access goes through the `get_db` dependency.
"""

import logging
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

logger = logging.getLogger(__name__)

# ━━━━━━━━━━━━━━━ Engine Configuration ━━━━━━━━━━━━━━━

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,         # Verify connections are alive before using
    pool_recycle=300,            # Recycle connections every 5 minutes
)

# ━━━━━━━━━━━━━━━ Session Factory ━━━━━━━━━━━━━━━

AsyncSessionLocal = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ━━━━━━━━━━━━━━━ Declarative Base ━━━━━━━━━━━━━━━

class Base(DeclarativeBase):
    """Base class for all ORM models.

    All models inherit from this. Alembic auto-discovers models
    through this base's metadata.
    """
    pass


# ━━━━━━━━━━━━━━━ Dependency ━━━━━━━━━━━━━━━

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency — provides a database session per request.

    The session is automatically committed if no exception occurs,
    or rolled back on error. Always closed after the request.

    Yields:
        AsyncSession: A SQLAlchemy async session.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ━━━━━━━━━━━━━━━ Lifecycle ━━━━━━━━━━━━━━━

async def init_db() -> None:
    """Create all tables if they don't exist.

    Called once at application startup from main.py.
    In production, use Alembic migrations instead.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables initialized")


async def close_db() -> None:
    """Dispose of the engine connection pool.

    Called on application shutdown from main.py.
    """
    await engine.dispose()
    logger.info("Database connection pool closed")
