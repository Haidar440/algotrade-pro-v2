"""
Module: app/config.py
Purpose: Application configuration — the ONLY place that reads environment variables.

Every other module imports `settings` from here instead of calling os.getenv().
If a required variable is missing, the app crashes immediately at startup
with a clear error message — no silent failures.
"""

from typing import Optional
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Validated application settings loaded from .env file.

    This is the single source of truth for all configuration.
    No other module should read environment variables directly.

    Required fields (no default) will cause an immediate crash
    if missing from .env — this is intentional.
    """

    # ━━━━ MANDATORY — App crashes without these ━━━━
    DATABASE_URL: str = Field(
        ...,
        description="PostgreSQL connection string (asyncpg format)",
    )
    JWT_SECRET_KEY: str = Field(
        ...,
        min_length=32,
        description="Secret key for signing JWT tokens (min 32 chars)",
    )
    MASTER_ENCRYPTION_KEY: str = Field(
        ...,
        min_length=32,
        description="Fernet key for encrypting broker credentials",
    )
    GEMINI_API_KEY: str = Field(
        ...,
        description="Google Gemini API key for AI analysis",
    )

    # ━━━━ Application ━━━━
    APP_ENV: str = Field(default="development", description="development | staging | production")
    DEBUG: bool = Field(default=False, description="Enable debug mode (never in production)")
    ALLOWED_ORIGINS: str = Field(
        default="http://localhost:3000,http://localhost:5173",
        description="Comma-separated list of allowed CORS origins",
    )

    # ━━━━ Authentication ━━━━
    JWT_ALGORITHM: str = Field(default="HS256", description="JWT signing algorithm")
    JWT_EXPIRE_MINUTES: int = Field(default=60, ge=5, le=1440, description="JWT token TTL in minutes")

    # ━━━━ Broker: Angel One (optional — disabled if empty) ━━━━
    ANGEL_API_KEY: Optional[str] = Field(default=None, description="Angel One SmartAPI key")
    ANGEL_CLIENT_ID: Optional[str] = Field(default=None, description="Angel One client code")
    ANGEL_PASSWORD: Optional[str] = Field(default=None, description="Angel One PIN/password")
    ANGEL_TOTP_SECRET: Optional[str] = Field(default=None, description="Angel One TOTP seed")

    # ━━━━ Broker: Zerodha (optional) ━━━━
    ZERODHA_API_KEY: Optional[str] = Field(default=None, description="Zerodha Kite API key")
    ZERODHA_API_SECRET: Optional[str] = Field(default=None, description="Zerodha Kite API secret")

    # ━━━━ External APIs (optional) ━━━━
    TAVILY_API_KEY: Optional[str] = Field(default=None, description="Tavily search API key")

    # ━━━━ Telegram (optional) ━━━━
    TELEGRAM_BOT_TOKEN: Optional[str] = Field(default=None, description="Telegram bot token")
    TELEGRAM_ALLOWED_USERS: Optional[str] = Field(
        default=None,
        description="Comma-separated Telegram user IDs allowed to interact",
    )

    # ━━━━ Rate Limiting ━━━━
    RATE_LIMIT_LOGIN: str = Field(default="5/minute", description="Login endpoint rate limit")
    RATE_LIMIT_ORDERS: str = Field(default="30/minute", description="Order endpoint rate limit")

    # ━━━━ Risk Management ━━━━
    MAX_ORDER_VALUE: int = Field(default=100_000, ge=1_000, description="Max single order value in ₹")
    MAX_DAILY_LOSS: int = Field(default=5_000, ge=100, description="Max daily loss before kill switch in ₹")
    MAX_POSITIONS: int = Field(default=10, ge=1, le=50, description="Max concurrent open positions")
    MAX_POSITION_SIZE_PERCENT: int = Field(
        default=20, ge=1, le=100,
        description="Max % of portfolio in a single position",
    )

    # ━━━━━━━━━━━━━━━ Validators ━━━━━━━━━━━━━━━

    @field_validator("JWT_SECRET_KEY")
    @classmethod
    def validate_jwt_not_default(cls, value: str) -> str:
        """Ensure JWT secret is not the placeholder from .env.example."""
        if value.startswith("CHANGE_ME"):
            raise ValueError(
                "JWT_SECRET_KEY is still the default placeholder! "
                "Generate a real key: python -c \"import secrets; print(secrets.token_urlsafe(64))\""
            )
        return value

    @field_validator("MASTER_ENCRYPTION_KEY")
    @classmethod
    def validate_encryption_key_not_default(cls, value: str) -> str:
        """Ensure encryption key is not the placeholder from .env.example."""
        if value.startswith("CHANGE_ME"):
            raise ValueError(
                "MASTER_ENCRYPTION_KEY is still the default placeholder! "
                "Generate: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )
        return value

    # ━━━━━━━━━━━━━━━ Computed Properties ━━━━━━━━━━━━━━━

    @property
    def allowed_origins_list(self) -> list[str]:
        """Parse ALLOWED_ORIGINS string into a list."""
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",")]

    @property
    def telegram_allowed_user_ids(self) -> list[int]:
        """Parse TELEGRAM_ALLOWED_USERS string into a list of ints."""
        if not self.TELEGRAM_ALLOWED_USERS:
            return []
        return [int(uid.strip()) for uid in self.TELEGRAM_ALLOWED_USERS.split(",") if uid.strip()]

    def is_broker_configured(self, broker: str) -> bool:
        """Check if all required credentials exist for a broker.

        Args:
            broker: Broker name ('angel' or 'zerodha').

        Returns:
            True if all required credentials are present.
        """
        if broker == "angel":
            return all([
                self.ANGEL_API_KEY,
                self.ANGEL_CLIENT_ID,
                self.ANGEL_PASSWORD,
                self.ANGEL_TOTP_SECRET,
            ])
        if broker == "zerodha":
            return all([self.ZERODHA_API_KEY, self.ZERODHA_API_SECRET])
        return False

    @property
    def is_production(self) -> bool:
        """Check if running in production environment."""
        return self.APP_ENV == "production"

    class Config:
        env_file = Path(__file__).resolve().parent.parent / ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Global singleton — crashes on import if .env is invalid.
# This is intentional: fail fast, fail loud.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
settings = Settings()
