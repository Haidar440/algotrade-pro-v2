"""
Module: app/strategies/base.py
Purpose: Abstract base for all trading strategies.

All strategies must extend StrategyBase and define:
- Class attributes: name, description, strategy_type, default_params, expected_win_rate
- init(): Precompute indicators using self.I()
- next(): Trading logic executed on each bar

Strategies are designed for the backtesting.py library and use pandas-ta
for indicator calculations.
"""

from backtesting import Strategy


class StrategyBase(Strategy):
    """Abstract base class for all AlgoTrade Pro strategies.

    Subclasses MUST define these class attributes:
        name: Human-readable strategy name.
        description: What this strategy does.
        strategy_type: "SWING", "INTRADAY", or "BOTH".
        default_params: Dict of default parameter values.
        expected_win_rate: Expected win rate from research (e.g., "55-60%").
        source: Research source/citation.

    Subclasses MUST implement:
        init(): Precompute indicators.
        next(): Trading logic per bar.
    """

    # ── Metadata (override in subclasses) ──
    name: str = "base"
    description: str = "Base strategy — do not use directly."
    strategy_type: str = "SWING"
    default_params: dict = {}
    expected_win_rate: str = "N/A"
    source: str = ""

    @classmethod
    def get_optimization_ranges(cls) -> dict:
        """Return parameter ranges for optimizer.

        Override in subclasses for strategy-specific ranges.

        Returns:
            Dict of param_name → range/list for backtesting.py optimizer.
        """
        return {}

    @classmethod
    def get_info(cls) -> dict:
        """Get strategy metadata as dict."""
        return {
            "name": cls.name,
            "description": cls.description,
            "strategy_type": cls.strategy_type,
            "default_params": cls.default_params,
            "expected_win_rate": cls.expected_win_rate,
            "source": cls.source,
            "optimization_ranges": {
                k: list(v) if hasattr(v, "__iter__") else v
                for k, v in cls.get_optimization_ranges().items()
            },
        }
