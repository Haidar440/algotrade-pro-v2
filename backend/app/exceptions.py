"""
Module: app/exceptions.py
Purpose: Custom exception hierarchy for the application.

Every exception type maps to a specific HTTP status code.
The global error handler in middleware.py catches these and returns
structured JSON responses — never leaking internal details to clients.
"""

from fastapi import status


class AlgoTradeError(Exception):
    """Base exception for all application errors.

    All custom exceptions inherit from this. The global middleware
    catches AlgoTradeError and returns a proper JSON response.

    Attributes:
        message: Human-readable error description.
        error_code: Machine-readable code for frontend handling.
        status_code: HTTP status code to return.
    """

    def __init__(
        self,
        message: str = "An unexpected error occurred.",
        error_code: str = "INTERNAL_ERROR",
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
    ) -> None:
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        super().__init__(self.message)


# ━━━━━━━━━━━━━━━ Auth Errors (401/403) ━━━━━━━━━━━━━━━


class UnauthorizedError(AlgoTradeError):
    """Raised when authentication fails (bad/expired JWT)."""

    def __init__(self, message: str = "Invalid or expired authentication token.") -> None:
        super().__init__(
            message=message,
            error_code="UNAUTHORIZED",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )


class ForbiddenError(AlgoTradeError):
    """Raised when user lacks permission for the requested action."""

    def __init__(self, message: str = "You do not have permission for this action.") -> None:
        super().__init__(
            message=message,
            error_code="FORBIDDEN",
            status_code=status.HTTP_403_FORBIDDEN,
        )


# ━━━━━━━━━━━━━━━ Resource Errors (404/409) ━━━━━━━━━━━━━━━


class NotFoundError(AlgoTradeError):
    """Raised when a requested resource does not exist."""

    def __init__(self, resource: str = "Resource", identifier: str = "") -> None:
        detail = f"{resource} not found"
        if identifier:
            detail = f"{resource} '{identifier}' not found"
        super().__init__(
            message=detail,
            error_code="NOT_FOUND",
            status_code=status.HTTP_404_NOT_FOUND,
        )


class ConflictError(AlgoTradeError):
    """Raised when a resource already exists (duplicate)."""

    def __init__(self, resource: str = "Resource", identifier: str = "") -> None:
        detail = f"{resource} already exists"
        if identifier:
            detail = f"{resource} '{identifier}' already exists"
        super().__init__(
            message=detail,
            error_code="CONFLICT",
            status_code=status.HTTP_409_CONFLICT,
        )


# ━━━━━━━━━━━━━━━ Validation Errors (400/422) ━━━━━━━━━━━━━━━


class ValidationError(AlgoTradeError):
    """Raised when input data fails validation rules."""

    def __init__(self, message: str = "Invalid input data.") -> None:
        super().__init__(
            message=message,
            error_code="VALIDATION_ERROR",
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )


# ━━━━━━━━━━━━━━━ Trading Errors (400) ━━━━━━━━━━━━━━━


class RiskCheckFailedError(AlgoTradeError):
    """Raised when an order fails pre-trade risk validation."""

    def __init__(self, reason: str = "Order failed risk check.") -> None:
        super().__init__(
            message=reason,
            error_code="RISK_CHECK_FAILED",
            status_code=status.HTTP_400_BAD_REQUEST,
        )


class KillSwitchActiveError(AlgoTradeError):
    """Raised when emergency kill switch is engaged — all trading halted."""

    def __init__(self) -> None:
        super().__init__(
            message="Kill switch is active. All trading operations are halted.",
            error_code="KILL_SWITCH_ACTIVE",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )


# ━━━━━━━━━━━━━━━ Broker Errors (502/503) ━━━━━━━━━━━━━━━


class BrokerConnectionError(AlgoTradeError):
    """Raised when broker API is unreachable or returns an error."""

    def __init__(self, broker: str = "broker", detail: str = "") -> None:
        message = f"Failed to connect to {broker}"
        if detail:
            message += f": {detail}"
        super().__init__(
            message=message,
            error_code="BROKER_ERROR",
            status_code=status.HTTP_502_BAD_GATEWAY,
        )


class BrokerNotConfiguredError(AlgoTradeError):
    """Raised when attempting to use a broker that has no credentials configured."""

    def __init__(self, broker: str = "broker") -> None:
        super().__init__(
            message=f"{broker} credentials are not configured. Check your .env file.",
            error_code="BROKER_NOT_CONFIGURED",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )


# ━━━━━━━━━━━━━━━ Service Errors (503) ━━━━━━━━━━━━━━━


class ServiceUnavailableError(AlgoTradeError):
    """Raised when an external service (AI, search, etc.) is unavailable."""

    def __init__(self, message: str = "Service is temporarily unavailable.") -> None:
        super().__init__(
            message=message,
            error_code="SERVICE_UNAVAILABLE",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
