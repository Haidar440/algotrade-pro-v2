"""
Module: app/routers/auth.py
Purpose: Authentication endpoints — login and token generation.

Rate-limited to prevent brute force attacks.
Passwords are verified against bcrypt hashes (never stored in plain text).
"""

import logging

from fastapi import APIRouter, Depends, Request
from fastapi.security import OAuth2PasswordRequestForm
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings
from app.exceptions import UnauthorizedError
from app.models.schemas import ApiResponse, LoginRequest, TokenResponse
from app.security.auth import create_access_token, hash_password, verify_password

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])
limiter = Limiter(key_func=get_remote_address, config_filename=None)

# ━━━━━━━━━━━━━━━ Temporary In-Memory Users ━━━━━━━━━━━━━━━
# TODO: Replace with database Users table in Sprint 2.
# Passwords are bcrypt-hashed, never stored in plaintext.
_USERS_DB: dict[str, str] = {
    "admin": hash_password("admin1234"),
}


@router.post(
    "/login",
    response_model=ApiResponse[TokenResponse],
    summary="Login (JSON)",
    description="Authenticate with JSON body {username, password}, receive JWT token.",
)
@limiter.limit(settings.RATE_LIMIT_LOGIN)
async def login(request: Request, body: LoginRequest) -> ApiResponse[TokenResponse]:
    """Authenticate user and return a signed JWT token.

    Args:
        request: FastAPI request (required for rate limiter).
        body: Login credentials (username + password).

    Returns:
        ApiResponse containing the JWT access token.

    Raises:
        UnauthorizedError: If credentials are invalid.
    """
    # Look up user
    stored_hash = _USERS_DB.get(body.username)
    if not stored_hash or not verify_password(body.password, stored_hash):
        logger.warning("Failed login attempt for user=%s", body.username)
        raise UnauthorizedError("Invalid username or password.")

    # Generate JWT
    token = create_access_token(subject=body.username)
    logger.info("User '%s' logged in successfully", body.username)

    return ApiResponse(
        data=TokenResponse(
            access_token=token,
            expires_in_minutes=settings.JWT_EXPIRE_MINUTES,
        ),
        message="Login successful",
    )


@router.post(
    "/token",
    summary="Login (OAuth2 Form)",
    description="OAuth2-compatible login — used by Swagger Authorize button.",
)
@limiter.limit(settings.RATE_LIMIT_LOGIN)
async def login_oauth2_form(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
) -> dict:
    """OAuth2 form-based login for Swagger UI Authorize button.

    Args:
        request: FastAPI request (required for rate limiter).
        form_data: OAuth2 form with username and password fields.

    Returns:
        OAuth2-compliant token response.

    Raises:
        UnauthorizedError: If credentials are invalid.
    """
    stored_hash = _USERS_DB.get(form_data.username)
    if not stored_hash or not verify_password(form_data.password, stored_hash):
        logger.warning("Failed login attempt for user=%s", form_data.username)
        raise UnauthorizedError("Invalid username or password.")

    token = create_access_token(subject=form_data.username)
    logger.info("User '%s' logged in via OAuth2 form", form_data.username)

    return {
        "access_token": token,
        "token_type": "bearer",
    }
