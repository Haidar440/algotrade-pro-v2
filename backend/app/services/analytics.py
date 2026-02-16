"""
Module: app/services/analytics.py
Purpose: Performance analytics — Sharpe ratio, drawdown, streaks, win rate.

Analyzes trade history to provide portfolio-level performance metrics.
Used by the analytics dashboard and stock picker scoring.
"""

import logging
import math
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)


# ━━━━━━━━━━━━━━━ Data Classes ━━━━━━━━━━━━━━━


@dataclass
class PerformanceMetrics:
    """Comprehensive portfolio performance metrics."""

    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    win_rate: float = 0.0  # percentage

    total_pnl: float = 0.0
    average_pnl: float = 0.0
    average_win: float = 0.0
    average_loss: float = 0.0

    profit_factor: float = 0.0  # gross profit / gross loss
    sharpe_ratio: float = 0.0
    max_drawdown: float = 0.0   # percentage
    max_drawdown_amount: float = 0.0

    best_trade: float = 0.0
    worst_trade: float = 0.0
    best_streak: int = 0
    worst_streak: int = 0
    current_streak: int = 0  # positive = wins, negative = losses

    risk_reward_ratio: float = 0.0
    expectancy: float = 0.0  # average $ expected per trade

    # Time-based
    avg_holding_days: float = 0.0
    total_days: int = 0


@dataclass
class TradeRecord:
    """A single trade record for analytics calculation."""

    pnl: float = 0.0           # absolute P&L in currency
    pnl_percent: float = 0.0   # percentage return
    entry_price: float = 0.0
    exit_price: float = 0.0
    quantity: int = 0
    holding_days: int = 1
    symbol: str = ""


# ━━━━━━━━━━━━━━━ Performance Analytics ━━━━━━━━━━━━━━━


class PerformanceAnalytics:
    """Calculate portfolio performance metrics from trade history.

    Example:
        analytics = PerformanceAnalytics()
        metrics = analytics.calculate(trades)
        print(f"Win rate: {metrics.win_rate:.1f}%")
        print(f"Sharpe: {metrics.sharpe_ratio:.2f}")
    """

    # Risk-free rate for Sharpe calculation (Indian T-Bills ~6.5%)
    RISK_FREE_RATE_ANNUAL = 0.065
    TRADING_DAYS_PER_YEAR = 252

    def calculate(self, trades: list[TradeRecord]) -> PerformanceMetrics:
        """Calculate all performance metrics from a list of trades.

        Args:
            trades: List of TradeRecord objects with P&L data.

        Returns:
            PerformanceMetrics with all calculated values.
        """
        if not trades:
            return PerformanceMetrics()

        metrics = PerformanceMetrics()
        returns = [t.pnl_percent for t in trades]
        pnls = [t.pnl for t in trades]

        # Basic counts
        metrics.total_trades = len(trades)
        metrics.winning_trades = sum(1 for r in returns if r > 0)
        metrics.losing_trades = sum(1 for r in returns if r < 0)
        metrics.win_rate = (
            (metrics.winning_trades / metrics.total_trades) * 100
            if metrics.total_trades > 0
            else 0.0
        )

        # P&L stats
        metrics.total_pnl = sum(pnls)
        metrics.average_pnl = metrics.total_pnl / metrics.total_trades
        metrics.best_trade = max(pnls) if pnls else 0.0
        metrics.worst_trade = min(pnls) if pnls else 0.0

        # Average win/loss
        wins = [p for p in pnls if p > 0]
        losses = [p for p in pnls if p < 0]
        metrics.average_win = sum(wins) / len(wins) if wins else 0.0
        metrics.average_loss = sum(losses) / len(losses) if losses else 0.0

        # Profit factor
        gross_profit = sum(wins) if wins else 0.0
        gross_loss = abs(sum(losses)) if losses else 0.0
        metrics.profit_factor = (
            gross_profit / gross_loss if gross_loss > 0 else float("inf")
        )

        # Risk-reward ratio
        avg_win_pct = sum(r for r in returns if r > 0) / len(wins) if wins else 0.0
        avg_loss_pct = abs(sum(r for r in returns if r < 0) / len(losses)) if losses else 0.0
        metrics.risk_reward_ratio = (
            avg_win_pct / avg_loss_pct if avg_loss_pct > 0 else float("inf")
        )

        # Expectancy
        if metrics.total_trades > 0:
            win_prob = metrics.win_rate / 100
            loss_prob = 1 - win_prob
            metrics.expectancy = (
                (win_prob * metrics.average_win) + (loss_prob * metrics.average_loss)
            )

        # Sharpe ratio
        metrics.sharpe_ratio = self._sharpe_ratio(returns)

        # Max drawdown
        dd, dd_amt = self._max_drawdown(pnls)
        metrics.max_drawdown = dd
        metrics.max_drawdown_amount = dd_amt

        # Streaks
        best, worst, current = self._calculate_streaks(returns)
        metrics.best_streak = best
        metrics.worst_streak = worst
        metrics.current_streak = current

        # Time
        holding_days = [t.holding_days for t in trades if t.holding_days > 0]
        metrics.avg_holding_days = (
            sum(holding_days) / len(holding_days) if holding_days else 0.0
        )
        metrics.total_days = sum(holding_days)

        return metrics

    def calculate_from_dicts(self, trades: list[dict]) -> PerformanceMetrics:
        """Calculate metrics from a list of trade dictionaries.

        Convenience method for when trades come from API/DB as dicts.

        Args:
            trades: List of dicts with keys: pnl, pnl_percent, etc.

        Returns:
            PerformanceMetrics.
        """
        records = []
        for t in trades:
            records.append(
                TradeRecord(
                    pnl=t.get("pnl", 0.0),
                    pnl_percent=t.get("pnl_percent", 0.0),
                    entry_price=t.get("entry_price", 0.0),
                    exit_price=t.get("exit_price", 0.0),
                    quantity=t.get("quantity", 0),
                    holding_days=t.get("holding_days", 1),
                    symbol=t.get("symbol", ""),
                )
            )
        return self.calculate(records)

    # ━━━━━━━━━━━━ Private ━━━━━━━━━━━━

    def _sharpe_ratio(self, returns_pct: list[float]) -> float:
        """Calculate annualized Sharpe ratio.

        Uses Indian T-Bill rate as risk-free rate (~6.5%).

        Args:
            returns_pct: List of trade returns in percentage.

        Returns:
            Annualized Sharpe ratio.
        """
        if len(returns_pct) < 2:
            return 0.0

        mean_return = sum(returns_pct) / len(returns_pct)
        variance = sum((r - mean_return) ** 2 for r in returns_pct) / (len(returns_pct) - 1)
        std_dev = math.sqrt(variance) if variance > 0 else 0.0

        if std_dev == 0:
            return 0.0

        # Daily risk-free rate
        daily_rf = self.RISK_FREE_RATE_ANNUAL / self.TRADING_DAYS_PER_YEAR

        # Annualize
        excess_return = mean_return - daily_rf
        annualized_sharpe = (excess_return / std_dev) * math.sqrt(self.TRADING_DAYS_PER_YEAR)
        return round(annualized_sharpe, 2)

    @staticmethod
    def _max_drawdown(pnls: list[float]) -> tuple[float, float]:
        """Calculate maximum drawdown from cumulative P&L.

        Args:
            pnls: List of absolute P&L values per trade.

        Returns:
            Tuple of (max_drawdown_percent, max_drawdown_amount).
        """
        if not pnls:
            return 0.0, 0.0

        cumulative = []
        running = 0.0
        for p in pnls:
            running += p
            cumulative.append(running)

        peak = cumulative[0]
        max_dd = 0.0
        max_dd_amt = 0.0

        for value in cumulative:
            if value > peak:
                peak = value
            drawdown = peak - value
            if drawdown > max_dd_amt:
                max_dd_amt = drawdown
                max_dd = (drawdown / peak * 100) if peak > 0 else 0.0

        return round(max_dd, 2), round(max_dd_amt, 2)

    @staticmethod
    def _calculate_streaks(returns: list[float]) -> tuple[int, int, int]:
        """Calculate best winning streak, worst losing streak, and current streak.

        Args:
            returns: List of return percentages.

        Returns:
            Tuple of (best_win_streak, worst_lose_streak, current_streak).
        """
        if not returns:
            return 0, 0, 0

        best_win = 0
        worst_loss = 0
        current = 0

        for r in returns:
            if r > 0:
                if current > 0:
                    current += 1
                else:
                    current = 1
            elif r < 0:
                if current < 0:
                    current -= 1
                else:
                    current = -1
            else:
                current = 0

            if current > best_win:
                best_win = current
            if current < worst_loss:
                worst_loss = current

        return best_win, abs(worst_loss), current
