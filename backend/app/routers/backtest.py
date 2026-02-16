"""
Module: app/routers/backtest.py
Purpose: Backtesting API endpoints — run, list, and optimize strategies.

Endpoints:
    GET  /api/backtest/strategies — List all 6 available strategies
    POST /api/backtest/run        — Run a backtest with real data
    POST /api/backtest/optimize   — Find optimal strategy parameters

All endpoints require JWT authentication (same as other routers).
Uses BacktestEngine service with DataProvider for market data.
"""

import logging

from fastapi import APIRouter, Depends

from app.models.schemas import (
    ApiResponse,
    BacktestRequest,
    BacktestResult,
    OptimizeRequest,
    OptimizeResult,
    StrategyInfo,
)
from app.security.auth import get_current_user
from app.services.backtest_engine import BacktestEngine

logger = logging.getLogger("algotrade.backtest_router")

router = APIRouter(
    prefix="/api/backtest",
    tags=["Backtesting"],
)

# Shared engine instance (lazy-initialized)
_engine: BacktestEngine | None = None


def _get_engine() -> BacktestEngine:
    """Get or create the backtest engine (singleton)."""
    global _engine
    if _engine is None:
        _engine = BacktestEngine()
    return _engine


@router.get(
    "/strategies",
    response_model=ApiResponse,
    summary="List available strategies",
    description="Returns metadata for all 6 research-backed trading strategies.",
)
async def list_strategies(
    user: dict = Depends(get_current_user),
) -> ApiResponse:
    """List all available backtesting strategies.

    Returns strategy name, description, type, default params, and expected win rate.

    Returns:
        ApiResponse with list of StrategyInfo objects.
    """
    engine = _get_engine()
    strategies = engine.list_strategies()
    return ApiResponse(
        data=strategies,
        message=f"Found {len(strategies)} strategies",
    )


@router.post(
    "/run",
    response_model=ApiResponse,
    summary="Run backtest",
    description=(
        "Run a backtest for a strategy on a stock. Uses real market data "
        "(Angel One → yfinance → demo fallback). Returns statistics and "
        "an interactive HTML chart (base64 encoded)."
    ),
)
async def run_backtest(
    request: BacktestRequest,
    user: dict = Depends(get_current_user),
) -> ApiResponse:
    """Run a backtest for a given strategy.

    Uses multi-tier data: Angel One → yfinance → demo data.
    Applies Indian market cost model (0.2% commission by default).

    Args:
        request: BacktestRequest with strategy, symbol, params.
        user: Authenticated user (from JWT).

    Returns:
        ApiResponse with BacktestResult (stats + chart).
    """
    engine = _get_engine()
    result = await engine.run_backtest(
        strategy_name=request.strategy_name,
        symbol=request.symbol,
        cash=request.cash,
        commission=request.commission,
        days=request.days,
        params=request.params,
    )

    if not result.get("success"):
        return ApiResponse(
            success=False,
            data=result,
            message=result.get("error", "Backtest failed"),
        )

    return ApiResponse(
        data=result,
        message=(
            f"Backtest complete: {request.strategy_name} on {request.symbol} — "
            f"Return: {result['stats'].get('return_pct', 'N/A')}%, "
            f"Win Rate: {result['stats'].get('win_rate_pct', 'N/A')}%"
        ),
    )


@router.post(
    "/optimize",
    response_model=ApiResponse,
    summary="Optimize strategy parameters",
    description=(
        "Find optimal parameters for a strategy by testing multiple combinations. "
        "Uses backtesting.py optimizer with up to 200 parameter combinations."
    ),
)
async def optimize_strategy(
    request: OptimizeRequest,
    user: dict = Depends(get_current_user),
) -> ApiResponse:
    """Optimize strategy parameters for best performance.

    Tests up to 200 parameter combinations to find the best set.

    Args:
        request: OptimizeRequest with strategy, metric to maximize.
        user: Authenticated user (from JWT).

    Returns:
        ApiResponse with OptimizeResult (best params + stats).
    """
    engine = _get_engine()
    result = await engine.optimize_strategy(
        strategy_name=request.strategy_name,
        symbol=request.symbol,
        cash=request.cash,
        commission=request.commission,
        days=request.days,
        maximize=request.maximize,
    )

    if not result.get("success"):
        return ApiResponse(
            success=False,
            data=result,
            message=result.get("error", "Optimization failed"),
        )

    return ApiResponse(
        data=result,
        message=(
            f"Optimized {request.strategy_name}: "
            f"Return: {result['stats'].get('return_pct', 'N/A')}%, "
            f"Best params: {result.get('best_params', {})}"
        ),
    )
