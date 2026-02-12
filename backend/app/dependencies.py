"""
Module: app/dependencies.py
Purpose: Centralized dependency injection — the DI container.

Every service and handler gets its dependencies injected through here.
This is the ONLY place that creates service instances and wires
configuration into them. No service should read settings directly.
"""

import logging
from functools import lru_cache

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.security.auth import get_current_user  # noqa: F401 — re-exported
from app.security.vault import CredentialVault

logger = logging.getLogger(__name__)


# ━━━━━━━━━━━━━━━ Cached Singletons ━━━━━━━━━━━━━━━


@lru_cache()
def get_vault() -> CredentialVault:
    """Provide a cached CredentialVault instance.

    The vault is created once and reused for the lifetime of the process.
    The master key comes from settings — never hardcoded.

    Returns:
        CredentialVault initialized with the master encryption key.
    """
    logger.info("Initializing CredentialVault")
    return CredentialVault(key=settings.MASTER_ENCRYPTION_KEY)


# ━━━━━━━━━━━━━━━ Database ━━━━━━━━━━━━━━━

# Re-export get_db for convenience — routers import from here
get_db_session = get_db  # Alias for clarity in router signatures
