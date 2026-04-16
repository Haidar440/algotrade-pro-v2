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

import json
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
from app.services.data_provider import DataProvider

logger = logging.getLogger("algotrade.backtest_router")

router = APIRouter(
    prefix="/api/backtest",
    tags=["Backtesting"],
)


def _numpy_safe(obj):
    """JSON default handler for numpy types from backtesting.py results."""
    import numpy as np
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    return str(obj)


def _get_engine() -> BacktestEngine:
    """Get backtest engine with the active broker (if connected).

    Checks if a broker is connected via the broker router and passes
    it to DataProvider so Angel One live data can be used for backtesting.
    """
    # Import here to avoid circular imports
    from app.routers.broker import _active_broker

    angel_broker = None
    if _active_broker is not None and _active_broker.is_connected:
        angel_broker = _active_broker

    data_provider = DataProvider(angel_broker=angel_broker)
    return BacktestEngine(data_provider=data_provider)


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
        data_source=request.data_source,
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


# Module-level storage keyed by task_id — each request gets isolated params
_pending_optimize_params: dict[str, dict] = {}


@router.post(
    "/optimize",
    status_code=202,
    summary="Start strategy optimization (background)",
    description=(
        "Starts background optimization for a strategy (30-120s). Returns 202 Accepted "
        "with a task_id immediately. Poll GET /backtest/optimize/status/{task_id} "
        "for progress and results. Prevents browser/proxy timeouts."
    ),
)
async def optimize_strategy(
    request: OptimizeRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    """Start strategy optimization as a background task."""
    from app.workers.intelligence_worker import get_task_manager

    tm = get_task_manager()

    # Register handler once — it reads params keyed by task_info.task_id
    if "backtest_optimize" not in tm._handlers:
        async def _optimize_handler(task_info, on_progress):
            # Pop this task's params (isolated per task_id, auto-cleans up)
            params = _pending_optimize_params.pop(task_info.task_id, None)
            if not params:
                raise RuntimeError("No optimization parameters found for this task")

            symbol = params.get("symbol", "RELIANCE")
            await on_progress(5, "Initializing backtest engine...")
            engine = _get_engine()
            await on_progress(10, f"Fetching data for {symbol}...")

            result = await engine.optimize_strategy(
                strategy_name=params["strategy_name"],
                symbol=symbol,
                cash=params.get("cash", 1_000_000),
                commission=params.get("commission", 0.002),
                days=params.get("days", 365),
                maximize=params.get("maximize", "Return [%]"),
            )

            await on_progress(95, "Finalizing results...")
            return result

        tm.register_handler("backtest_optimize", _optimize_handler)

    await tm.start()

    try:
        task_id = await tm.submit_task("backtest_optimize")
    except RuntimeError as e:
        return {"success": False, "error": str(e), "message": "System busy — try again later"}

    # Store params keyed by unique task_id (NOT a shared "current" key)
    _pending_optimize_params[task_id] = {
        "strategy_name": request.strategy_name,
        "symbol": request.symbol,
        "cash": request.cash,
        "commission": request.commission,
        "days": request.days,
        "maximize": request.maximize,
    }

    logger.info(
        "Optimization started: %s on %s (task=%s) by user=%s",
        request.strategy_name, request.symbol, task_id, user.get("sub"),
    )

    return {
        "task_id": task_id,
        "status": "queued",
        "message": f"Optimization started for {request.strategy_name} on {request.symbol}",
    }


@router.get(
    "/optimize/status/{task_id}",
    summary="Check optimization progress",
    description="Poll this endpoint to get progress and results of a background optimization.",
)
async def get_optimize_status(
    task_id: str,
    user: dict = Depends(get_current_user),
) -> dict:
    """Get status of a background optimization task.

    Args:
        task_id: Task ID from the POST /optimize response.
        user: Authenticated user (from JWT).

    Returns:
        Dict with status, progress, stage, and result (when completed).
    """
    from app.workers.intelligence_worker import get_task_manager

    tm = get_task_manager()

    # get_task_status() returns a DICT (via TaskInfo.to_dict()), not a TaskInfo object
    status_dict = tm.get_task_status(task_id)

    if status_dict is None:
        return {
            "task_id": task_id,
            "status": "not_found",
            "error": f"No task found with id '{task_id}'",
        }

    # status_dict has: task_id, task_type, status, progress, stage, error, elapsed_ms
    # If completed, it also has a "result" key with the optimization output
    if status_dict.get("status") == "completed" and status_dict.get("result"):
        result = status_dict["result"]
        # Do NOT set status_dict["data"] = result, because frontend secureGet() aggressively 
        # unboxes JSON if a "data" key is present, which strips the "status" key away.
        if isinstance(result, dict):
            if result.get("success"):
                status_dict["message"] = (
                    f"Optimized: Return {result.get('stats', {}).get('return_pct', 'N/A')}%, "
                    f"Best params: {result.get('best_params', {})}"
                )
            else:
                status_dict["message"] = result.get("error", "Optimization failed")

    # Sanitize numpy types (int64, float64) → native Python types for JSON serialization
    # backtesting.py returns numpy types in stats that Pydantic can't serialize
    return json.loads(json.dumps(status_dict, default=_numpy_safe))
