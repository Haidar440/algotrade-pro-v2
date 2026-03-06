"""
Module: app/routers/auth.py
Purpose: Authentication endpoints — login and token generation.

Rate-limited to prevent brute force attacks.
Passwords are verified against bcrypt hashes (never stored in plain text).
"""

import logging

from fastapi import APIRouter, Depends, Request
from fastapi.security import OAuth2PasswordRequestForm


from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.exceptions import BadRequestError, UnauthorizedError
from app.middleware import limiter
from app.models.schemas import ApiResponse, LoginRequest, TokenResponse, UserCreate, UserResponse
from app.models.user import User
from app.security.auth import create_access_token, hash_password, verify_password

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post(
    "/register",
    response_model=ApiResponse[UserResponse],
    summary="Register User",
    description="Create a new user account.",
)
async def register(body: UserCreate, db: AsyncSession = Depends(get_db)) -> ApiResponse[UserResponse]:
    """Register a new user."""
    # Check if username exists
    stmt = select(User).where(User.username == body.username)
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise BadRequestError("Username already taken.")

    # Check if email exists
    stmt = select(User).where(User.email == body.email)
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise BadRequestError("Email already registered.")

    # Create user
    new_user = User(
        username=body.username,
        email=body.email,
        hashed_password=hash_password(body.password),
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    logger.info("New user registered: %s", body.username)
    return ApiResponse(data=new_user, message="User registered successfully")


@router.post(
    "/login",
    response_model=ApiResponse[TokenResponse],
    summary="Login (JSON)",
    description="Authenticate with JSON body {username, password}, receive JWT token.",
)
@limiter.limit(settings.RATE_LIMIT_LOGIN)
async def login(
    request: Request,
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[TokenResponse]:
    """Authenticate user and return a signed JWT token."""
    # Look up user
    stmt = select(User).where(User.username == body.username)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.hashed_password):
        logger.warning("Failed login attempt for user=%s", body.username)
        raise UnauthorizedError("Invalid username or password.")
    
    if not user.is_active:
        raise UnauthorizedError("Account is inactive.")

    # Generate JWT
    token = create_access_token(subject=user.username)
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
    db: AsyncSession = Depends(get_db),
) -> dict:
    """OAuth2 form-based login for Swagger UI Authorize button."""
    stmt = select(User).where(User.username == form_data.username)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.hashed_password):
        logger.warning("Failed login attempt for user=%s", form_data.username)
        raise UnauthorizedError("Invalid username or password.")

    token = create_access_token(subject=form_data.username)
    logger.info("User '%s' logged in via OAuth2 form", form_data.username)

    return {
        "access_token": token,
        "token_type": "bearer",
    }
