"""
Module: app/services/risk_manager.py
Purpose: Pre-trade safety checks — runs BEFORE every order.

Validates orders against configurable risk limits:
- Max order value
- Max daily loss
- Max concurrent positions
- Position concentration limit
- Market hours check

All limits come from app.config.settings — NEVER hardcoded.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from app.config import settings
from app.constants import AuditAction, AuditCategory
from app.exceptions import KillSwitchActiveError, RiskCheckFailedError
from app.services.broker_interface import OrderRequest, Position

logger = logging.getLogger(__name__)


@dataclass
class RiskCheckResult:
    """Result of a pre-trade risk validation.

    Attributes:
        allowed: Whether the order passed all checks.
        reason: Human-readable explanation.
        check_name: Which check produced this result.
    """

    allowed: bool
    reason: str
    check_name: str = ""


class RiskManager:
    """Pre-trade safety validation engine.

    Runs a battery of checks before any order is submitted to a broker.
    All limits are loaded from settings (environment variables).

    Attributes:
        max_order_value: Maximum value for a single order in ₹.
        max_daily_loss: Maximum daily loss before kill switch in ₹.
        max_positions: Maximum concurrent open positions.
        max_position_pct: Maximum % of portfolio in a single position.
        _daily_pnl: Running total of today's realized P&L.
        _kill_switch_active: Emergency stop flag.
    """

    def __init__(
        self,
        max_order_value: int = settings.MAX_ORDER_VALUE,
        max_daily_loss: int = settings.MAX_DAILY_LOSS,
        max_positions: int = settings.MAX_POSITIONS,
        max_position_pct: int = settings.MAX_POSITION_SIZE_PERCENT,
    ) -> None:
        """Initialize risk manager with limits from settings.

        Args:
            max_order_value: Max single order value in ₹ (default from settings).
            max_daily_loss: Max daily loss in ₹ before kill switch (default from settings).
            max_positions: Max concurrent positions (default from settings).
            max_position_pct: Max % of portfolio in one position (default from settings).
        """
        self.max_order_value = max_order_value
        self.max_daily_loss = max_daily_loss
        self.max_positions = max_positions
        self.max_position_pct = max_position_pct
        self._daily_pnl: float = 0.0
        self._kill_switch_active: bool = False
        self._daily_trades_count: int = 0

        logger.info(
            "RiskManager initialized — max_order=₹%s, max_loss=₹%s, max_pos=%d, max_pct=%d%%",
            f"{self.max_order_value:,}", f"{self.max_daily_loss:,}",
            self.max_positions, self.max_position_pct,
        )

    async def validate_order(
        self,
        order: OrderRequest,
        current_positions: list[Position],
        portfolio_value: float = 0.0,
    ) -> RiskCheckResult:
        """Run all pre-trade safety checks on an order.

        Args:
            order: The order to validate.
            current_positions: List of currently open positions.
            portfolio_value: Total portfolio value for concentration check.

        Returns:
            RiskCheckResult — allowed=True if all checks pass.

        Raises:
            KillSwitchActiveError: If kill switch is engaged.
            RiskCheckFailedError: If any check fails.
        """
        checks = [
            self._check_kill_switch(),
            self._check_order_value(order),
            self._check_daily_loss(),
            self._check_max_positions(order, current_positions),
            self._check_concentration(order, portfolio_value),
            self._check_market_hours(),
        ]

        for check in checks:
            result = await check
            if not result.allowed:
                logger.warning(
                    "Risk check FAILED — check=%s, reason=%s, symbol=%s",
                    result.check_name, result.reason, order.symbol,
                )
                return result

        logger.info(
            "Risk checks PASSED — symbol=%s, qty=%d, value=₹%.2f",
            order.symbol, order.quantity, order.quantity * order.price,
        )
        return RiskCheckResult(
            allowed=True,
            reason="All safety checks passed ✅",
            check_name="all",
        )

    def record_trade_pnl(self, pnl: float) -> None:
        """Record a completed trade's P&L for daily tracking.

        If daily loss exceeds limit, kill switch is auto-activated.

        Args:
            pnl: Realized P&L in ₹ (positive = profit, negative = loss).
        """
        self._daily_pnl += pnl
        self._daily_trades_count += 1

        if self._daily_pnl <= -self.max_daily_loss:
            self._kill_switch_active = True
            logger.critical(
                "🚨 KILL SWITCH AUTO-ACTIVATED — daily loss ₹%.2f exceeds limit ₹%s",
                abs(self._daily_pnl), f"{self.max_daily_loss:,}",
            )

    def activate_kill_switch(self, reason: str = "Manual activation") -> None:
        """Manually activate the emergency kill switch.

        Args:
            reason: Why the kill switch was activated.
        """
        self._kill_switch_active = True
        logger.critical("🚨 KILL SWITCH ACTIVATED — reason: %s", reason)

    def deactivate_kill_switch(self) -> None:
        """Deactivate the kill switch (manual reset only)."""
        self._kill_switch_active = False
        logger.warning("⚠️ Kill switch DEACTIVATED — trading resumed")

    def reset_daily_counters(self) -> None:
        """Reset daily P&L and trade count — call at market open."""
        self._daily_pnl = 0.0
        self._daily_trades_count = 0
        logger.info("Daily risk counters reset")

    def get_status(self) -> dict:
        """Get current risk manager status.

        Returns:
            Dict with all current limits and states.
        """
        return {
            "kill_switch_active": self._kill_switch_active,
            "daily_pnl": self._daily_pnl,
            "daily_trades": self._daily_trades_count,
            "max_order_value": self.max_order_value,
            "max_daily_loss": self.max_daily_loss,
            "max_positions": self.max_positions,
            "max_position_pct": self.max_position_pct,
            "daily_loss_remaining": self.max_daily_loss + self._daily_pnl,
        }

    # ━━━━━━━━━━━━━━━ Individual Checks ━━━━━━━━━━━━━━━

    async def _check_kill_switch(self) -> RiskCheckResult:
        """Check if kill switch is active."""
        if self._kill_switch_active:
            return RiskCheckResult(
                allowed=False,
                reason="Kill switch is ACTIVE — all trading halted. Deactivate manually to resume.",
                check_name="kill_switch",
            )
        return RiskCheckResult(allowed=True, reason="OK", check_name="kill_switch")

    async def _check_order_value(self, order: OrderRequest) -> RiskCheckResult:
        """Check if order value exceeds maximum allowed."""
        order_value = order.quantity * order.price

        if order_value > self.max_order_value:
            return RiskCheckResult(
                allowed=False,
                reason=(
                    f"Order value ₹{order_value:,.2f} exceeds maximum ₹{self.max_order_value:,}. "
                    f"Reduce quantity or price."
                ),
                check_name="order_value",
            )
        return RiskCheckResult(allowed=True, reason="OK", check_name="order_value")

    async def _check_daily_loss(self) -> RiskCheckResult:
        """Check if daily loss has reached the limit."""
        if self._daily_pnl <= -self.max_daily_loss:
            return RiskCheckResult(
                allowed=False,
                reason=(
                    f"Daily loss ₹{abs(self._daily_pnl):,.2f} has reached limit ₹{self.max_daily_loss:,}. "
                    f"No more trades allowed today."
                ),
                check_name="daily_loss",
            )
        return RiskCheckResult(allowed=True, reason="OK", check_name="daily_loss")

    async def _check_max_positions(
        self, order: OrderRequest, current_positions: list[Position],
    ) -> RiskCheckResult:
        """Check if max concurrent positions would be exceeded."""
        # Only check for BUY orders (new positions)
        from app.constants import OrderSide
        if order.side != OrderSide.BUY:
            return RiskCheckResult(allowed=True, reason="OK", check_name="max_positions")

        # Check if this is a new position or adding to existing
        existing_symbols = {pos.symbol for pos in current_positions}
        if order.symbol in existing_symbols:
            return RiskCheckResult(allowed=True, reason="OK", check_name="max_positions")

        if len(current_positions) >= self.max_positions:
            return RiskCheckResult(
                allowed=False,
                reason=(
                    f"Already have {len(current_positions)} positions (max {self.max_positions}). "
                    f"Close a position before opening a new one."
                ),
                check_name="max_positions",
            )
        return RiskCheckResult(allowed=True, reason="OK", check_name="max_positions")

    async def _check_concentration(
        self, order: OrderRequest, portfolio_value: float,
    ) -> RiskCheckResult:
        """Check if a single position would be too large relative to portfolio."""
        if portfolio_value <= 0:
            return RiskCheckResult(allowed=True, reason="OK", check_name="concentration")

        order_value = order.quantity * order.price
        concentration_pct = (order_value / portfolio_value) * 100

        if concentration_pct > self.max_position_pct:
            return RiskCheckResult(
                allowed=False,
                reason=(
                    f"Order is {concentration_pct:.1f}% of portfolio (max {self.max_position_pct}%). "
                    f"Order: ₹{order_value:,.2f}, Portfolio: ₹{portfolio_value:,.2f}"
                ),
                check_name="concentration",
            )
        return RiskCheckResult(allowed=True, reason="OK", check_name="concentration")

    async def _check_market_hours(self) -> RiskCheckResult:
        """Check if current time is within market hours (9:15 AM - 3:30 PM IST).

        Note: This is a soft check — can be bypassed for paper trading.
        """
        from datetime import timezone, timedelta

        ist = timezone(timedelta(hours=5, minutes=30))
        now = datetime.now(ist)

        # Skip check on weekends
        if now.weekday() >= 5:  # Saturday=5, Sunday=6
            return RiskCheckResult(
                allowed=False,
                reason="Market is closed on weekends.",
                check_name="market_hours",
            )

        market_open = now.replace(hour=9, minute=15, second=0, microsecond=0)
        market_close = now.replace(hour=15, minute=30, second=0, microsecond=0)

        if not (market_open <= now <= market_close):
            return RiskCheckResult(
                allowed=False,
                reason=f"Outside market hours (9:15 AM - 3:30 PM IST). Current: {now.strftime('%I:%M %p')}",
                check_name="market_hours",
            )

        return RiskCheckResult(allowed=True, reason="OK", check_name="market_hours")
