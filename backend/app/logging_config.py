"""
Module: app/logging_config.py
Purpose: Structured logging setup with rotation, separate trade and error logs.

All modules use `logger = logging.getLogger(__name__)` to get a child logger.
This module configures the root logger once at startup.
"""

import logging
import sys
from logging.handlers import RotatingFileHandler, TimedRotatingFileHandler
from pathlib import Path

# Ensure logs directory exists
LOG_DIR = Path("logs")
LOG_DIR.mkdir(exist_ok=True)

# ━━━━━━━━━━━━━━━ Format Strings ━━━━━━━━━━━━━━━

CONSOLE_FORMAT = "%(asctime)s │ %(levelname)-7s │ %(name)-25s │ %(message)s"
CONSOLE_DATE_FORMAT = "%H:%M:%S"

FILE_FORMAT = "%(asctime)s | %(levelname)-7s | %(name)s | %(funcName)s:%(lineno)d | %(message)s"
FILE_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


def setup_logging(log_level: str = "INFO") -> None:
    """Configure application-wide logging with multiple handlers.

    This function should be called ONCE at application startup (in main.py).

    Handlers:
        1. Console — Clean, colorful output for development.
        2. File (app.log) — Full debug log, rotates at 10MB, keeps 5 files.
        3. Error (errors.log) — ERROR and above only, rotates at 5MB.
        4. Trade (trades.log) — Trade-specific events, rotates daily, keeps 30 days.

    Args:
        log_level: Minimum log level for the root logger.
    """
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))

    # Clear any existing handlers (prevents duplicates on reload)
    root_logger.handlers.clear()

    # ── 1. Console Handler ──
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(
        logging.Formatter(CONSOLE_FORMAT, datefmt=CONSOLE_DATE_FORMAT)
    )
    root_logger.addHandler(console_handler)

    # ── 2. Application Log (rotates at 10MB, keeps 5 backups) ──
    app_handler = RotatingFileHandler(
        LOG_DIR / "app.log",
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    app_handler.setLevel(logging.DEBUG)
    app_handler.setFormatter(
        logging.Formatter(FILE_FORMAT, datefmt=FILE_DATE_FORMAT)
    )
    root_logger.addHandler(app_handler)

    # ── 3. Error Log (ERROR+ only, rotates at 5MB) ──
    error_handler = RotatingFileHandler(
        LOG_DIR / "errors.log",
        maxBytes=5 * 1024 * 1024,
        backupCount=3,
        encoding="utf-8",
    )
    error_handler.setLevel(logging.ERROR)
    error_handler.setFormatter(
        logging.Formatter(FILE_FORMAT, datefmt=FILE_DATE_FORMAT)
    )
    root_logger.addHandler(error_handler)

    # ── 4. Trade Log (daily rotation, keep 30 days) ──
    trade_logger = logging.getLogger("trades")
    trade_handler = TimedRotatingFileHandler(
        LOG_DIR / "trades.log",
        when="midnight",
        backupCount=30,
        encoding="utf-8",
    )
    trade_handler.setFormatter(
        logging.Formatter(FILE_FORMAT, datefmt=FILE_DATE_FORMAT)
    )
    trade_logger.addHandler(trade_handler)
    trade_logger.setLevel(logging.INFO)

    # Suppress noisy third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)

    root_logger.info("Logging initialized — level=%s, log_dir=%s", log_level, LOG_DIR)
