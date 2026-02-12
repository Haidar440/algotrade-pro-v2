"""
Module: app/security/auth.py
Purpose: JWT authentication — token creation, verification, and password hashing.

Protected routes use `Depends(get_current_user)` to enforce authentication.
Passwords are hashed with bcrypt. Tokens are signed with HS256.
"""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings
from app.exceptions import UnauthorizedError

logger = logging.getLogger(__name__)

# ━━━━━━━━━━━━━━━ Password Hashing ━━━━━━━━━━━━━━━

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain_password: str) -> str:
    """Hash a plaintext password using bcrypt.

    Args:
        plain_password: The raw password from user input.

    Returns:
        Bcrypt hash string (safe for database storage).
    """
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a stored bcrypt hash.

    Args:
        plain_password: The raw password from user input.
        hashed_password: The stored bcrypt hash from the database.

    Returns:
        True if the password matches, False otherwise.
    """
    return pwd_context.verify(plain_password, hashed_password)


# ━━━━━━━━━━━━━━━ JWT Token Operations ━━━━━━━━━━━━━━━

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")


def create_access_token(subject: str, extra_claims: dict | None = None) -> str:
    """Create a signed JWT access token.

    Args:
        subject: The token subject (usually username or user ID).
        extra_claims: Optional additional claims to embed in the token.

    Returns:
        Encoded JWT string.
    """
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)

    payload = {
        "sub": subject,
        "iat": now,
        "exp": expire,
        "type": "access",
    }
    if extra_claims:
        payload.update(extra_claims)

    token = jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
    logger.info("JWT token created for subject=%s, expires=%s", subject, expire)
    return token


def decode_access_token(token: str) -> dict:
    """Decode and verify a JWT access token.

    Args:
        token: The encoded JWT string.

    Returns:
        Decoded payload dictionary.

    Raises:
        UnauthorizedError: If the token is invalid, expired, or malformed.
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        if payload.get("sub") is None:
            raise UnauthorizedError("Token is missing subject claim.")
        return payload
    except JWTError as exc:
        logger.warning("JWT decode failed: %s", exc)
        raise UnauthorizedError("Invalid or expired authentication token.")


# ━━━━━━━━━━━━━━━ FastAPI Dependency ━━━━━━━━━━━━━━━


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    """FastAPI dependency — extracts and verifies the current user from JWT.

    Add this to any route that requires authentication:
        @router.get("/protected")
        async def protected_route(user: dict = Depends(get_current_user)):
            ...

    Args:
        token: JWT token extracted from Authorization header by OAuth2PasswordBearer.

    Returns:
        Decoded JWT payload containing user info (sub, iat, exp, etc.).

    Raises:
        UnauthorizedError: If the token is invalid or expired.
    """
    return decode_access_token(token)
