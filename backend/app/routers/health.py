"""
Module: app/routers/health.py
Purpose: Health check endpoint — confirms the API is alive and database is reachable.

This is the only UNPROTECTED endpoint (no JWT required).
Used by monitoring tools, load balancers, and frontend connection checks.
"""

import logging

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app import __version__
from app.config import settings
from app.database import get_db
from app.models.schemas import HealthResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/health", tags=["Health"])


@router.get(
    "",
    response_model=HealthResponse,
    summary="Health Check",
    description="Returns application status, version, and database connectivity.",
)
async def health_check(db: AsyncSession = Depends(get_db)) -> HealthResponse:
    """Check if the API is alive and the database is reachable.

    Returns:
        HealthResponse with status, version, environment, and DB status.
    """
    db_status = "connected"
    try:
        await db.execute(text("SELECT 1"))
    except Exception as exc:
        logger.error("Database health check failed: %s", exc)
        db_status = "disconnected"

    return HealthResponse(
        status="healthy" if db_status == "connected" else "degraded",
        version=__version__,
        environment=settings.APP_ENV,
        database=db_status,
    )
