"""
Module: app/middleware.py
Purpose: Application middleware — CORS, global error handling, request logging.

Middleware runs on EVERY request. The error handler catches our custom
exceptions and returns structured JSON — never leaking internal details.
"""

import logging
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config import settings
from app.exceptions import AlgoTradeError

logger = logging.getLogger(__name__)


# ━━━━━━━━━━━━━━━ Rate Limiter ━━━━━━━━━━━━━━━

limiter = Limiter(key_func=get_remote_address, config_filename=None)


def setup_middleware(app: FastAPI) -> None:
    """Register all middleware on the FastAPI application.

    Called once from main.py during app assembly.

    Args:
        app: The FastAPI application instance.
    """
    # ── CORS ──
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
        allow_headers=["*"],
    )

    # ── Rate Limiter ──
    app.state.limiter = limiter

    # ── Request ID + Timing Middleware ──
    @app.middleware("http")
    async def request_context_middleware(request: Request, call_next):
        """Add request ID and log request duration for every request."""
        request_id = str(uuid.uuid4())[:8]
        request.state.request_id = request_id

        start_time = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start_time) * 1000

        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time"] = f"{duration_ms:.1f}ms"

        logger.info(
            "%s %s — %d (%s, %.0fms)",
            request.method,
            request.url.path,
            response.status_code,
            request_id,
            duration_ms,
        )
        return response


def setup_exception_handlers(app: FastAPI) -> None:
    """Register global exception handlers on the FastAPI application.

    These handlers catch exceptions and return consistent JSON responses.
    Internal error details are NEVER exposed to the client.

    Args:
        app: The FastAPI application instance.
    """

    @app.exception_handler(AlgoTradeError)
    async def algotrade_error_handler(request: Request, exc: AlgoTradeError) -> JSONResponse:
        """Handle all custom application errors with structured response."""
        logger.warning(
            "AlgoTradeError: %s (code=%s, status=%d, path=%s)",
            exc.message,
            exc.error_code,
            exc.status_code,
            request.url.path,
        )
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "success": False,
                "error": exc.message,
                "error_code": exc.error_code,
            },
        )

    @app.exception_handler(RateLimitExceeded)
    async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
        """Handle rate limit exceeded errors."""
        logger.warning("Rate limit exceeded: %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=429,
            content={
                "success": False,
                "error": "Too many requests. Please slow down.",
                "error_code": "RATE_LIMIT_EXCEEDED",
            },
        )

    @app.exception_handler(Exception)
    async def global_error_handler(request: Request, exc: Exception) -> JSONResponse:
        """Catch-all handler — logs the real error, returns generic message.

        CRITICAL: Never return str(exc) to the client in production!
        Internal details are logged to errors.log for debugging.
        """
        logger.error(
            "Unhandled error on %s %s: %s",
            request.method,
            request.url.path,
            exc,
            exc_info=True,
        )
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "An internal server error occurred.",
                "error_code": "INTERNAL_ERROR",
            },
        )
