"""
Module: app/main.py
Purpose: FastAPI application assembly — the single entry point.

This file wires together all components:
  1. Creates the FastAPI instance
  2. Registers middleware (CORS, error handlers, timing)
  3. Includes all routers (health, auth, trades, watchlists)
  4. Sets up database lifecycle (init on startup, close on shutdown)
  5. Configures logging

Every component is kept in its own module — this file ONLY assembles them.
"""

import logging
# Force reload - timestamp 2026-02-16 13:50
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import __app_name__, __version__
from app.config import settings
from app.database import close_db, init_db
from app.logging_config import setup_logging
from app.middleware import setup_exception_handlers, setup_middleware
from app.routers import ai, auth, backtest, broker, health, telegram, trades, watchlists, websocket
from app.services.telegram_bot import telegram_bot

logger = logging.getLogger(__name__)


# ━━━━━━━━━━━━━━━ Lifespan ━━━━━━━━━━━━━━━


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle — runs on startup and shutdown.

    Startup:
        - Initialize logging
        - Create database tables (dev mode; use Alembic in prod)
        - Set Telegram Webhook

    Shutdown:
        - Close database connection pool
    """
    # ── Startup ──
    setup_logging(log_level="DEBUG" if settings.DEBUG else "INFO")
    logger.info(
        "Starting %s v%s [env=%s, debug=%s]",
        __app_name__, __version__, settings.APP_ENV, settings.DEBUG,
    )
    await init_db()

    if settings.TELEGRAM_WEBHOOK_URL:
        telegram_bot.set_webhook(settings.TELEGRAM_WEBHOOK_URL)

    logger.info("🚀 Application ready — accepting requests")

    yield  # Application runs here

    # ── Shutdown ──
    logger.info("Shutting down %s...", __app_name__)
    await close_db()
    logger.info("👋 Shutdown complete")


# ━━━━━━━━━━━━━━━ App Factory ━━━━━━━━━━━━━━━


app = FastAPI(
    title=__app_name__,
    version=__version__,
    description="AI-powered algorithmic trading platform with real-time market data.",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)


# ━━━━━━━━━━━━━━━ Middleware ━━━━━━━━━━━━━━━

setup_middleware(app)
setup_exception_handlers(app)


# ━━━━━━━━━━━━━━━ Routers ━━━━━━━━━━━━━━━

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(trades.router)
app.include_router(watchlists.router)
app.include_router(broker.router)
app.include_router(ai.router)
app.include_router(backtest.router)
app.include_router(telegram.router)
app.include_router(websocket.router)


# ━━━━━━━━━━━━━━━ Root ━━━━━━━━━━━━━━━


@app.get("/", tags=["Root"])
async def root() -> dict:
    """Root endpoint — returns basic app info."""
    return {
        "app": __app_name__,
        "version": __version__,
        "docs": "/docs",
        "health": "/api/health",
    }
