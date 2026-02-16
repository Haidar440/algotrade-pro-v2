"""
Module: app/strategies/__init__.py
Purpose: Strategy registry — central place to discover all available strategies.

Import all strategies here and register them in STRATEGY_REGISTRY.
The backtest engine uses this registry to look up strategies by name.
"""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.strategies.base import StrategyBase

# Strategy registry: name → class
# Populated after imports to avoid circular dependencies
STRATEGY_REGISTRY: dict[str, type] = {}


def _register_strategies() -> None:
    """Import and register all strategy classes.

    Called lazily on first access to avoid import errors
    if backtesting library isn't installed yet.
    """
    global STRATEGY_REGISTRY

    if STRATEGY_REGISTRY:
        return  # Already registered

    from app.strategies.supertrend_rsi import SupertrendRSIStrategy
    from app.strategies.ema_adx import EMAAdxStrategy
    from app.strategies.rsi_macd import RSIMACDStrategy
    from app.strategies.vcp_breakout import VCPBreakoutStrategy
    from app.strategies.volume_breakout import VolumeBreakoutStrategy
    from app.strategies.vwap_orb import VWAPOrbStrategy

    STRATEGY_REGISTRY = {
        "supertrend_rsi": SupertrendRSIStrategy,
        "vwap_orb": VWAPOrbStrategy,
        "ema_adx": EMAAdxStrategy,
        "rsi_macd": RSIMACDStrategy,
        "vcp_breakout": VCPBreakoutStrategy,
        "volume_breakout": VolumeBreakoutStrategy,
    }


def get_strategy(name: str) -> type:
    """Get a strategy class by name.

    Args:
        name: Strategy identifier (e.g., "supertrend_rsi").

    Returns:
        Strategy class.

    Raises:
        KeyError: If strategy name not found.
    """
    _register_strategies()
    if name not in STRATEGY_REGISTRY:
        available = ", ".join(STRATEGY_REGISTRY.keys())
        raise KeyError(
            f"Strategy '{name}' not found. Available: {available}"
        )
    return STRATEGY_REGISTRY[name]


def list_strategies() -> list[dict]:
    """List all registered strategies with metadata.

    Returns:
        List of dicts with name, description, type, params, expected_win_rate.
    """
    _register_strategies()
    result = []
    for name, cls in STRATEGY_REGISTRY.items():
        result.append({
            "name": name,
            "description": getattr(cls, "description", ""),
            "strategy_type": getattr(cls, "strategy_type", "SWING"),
            "default_params": getattr(cls, "default_params", {}),
            "expected_win_rate": getattr(cls, "expected_win_rate", "N/A"),
            "source": getattr(cls, "source", ""),
        })
    return result
