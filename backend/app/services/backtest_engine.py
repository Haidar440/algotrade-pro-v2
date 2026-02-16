"""
Module: app/services/backtest_engine.py
Purpose: Production-grade backtesting engine wrapping backtesting.py.

Features:
- Run strategies against real or demo data
- Indian market cost modeling (0.2% commission covers brokerage + STT + slippage)
- Generate interactive HTML charts (base64 encoded)
- Optimize strategy parameters
- List available strategies with metadata

Uses DataProvider for market data and strategy registry for strategy lookup.
"""

import base64
import logging
import os
import tempfile
from typing import Any, Optional

import pandas as pd
from backtesting import Backtest

from app.services.data_provider import DataProvider
from app.strategies import get_strategy, list_strategies as _list_strategies

logger = logging.getLogger("algotrade.backtest_engine")

# Indian market cost model:
# Brokerage (intraday): 0.03% or ₹20/order
# STT: 0.1% on sell (delivery), 0.025% on sell (intraday)
# Transaction charges: 0.00345% (NSE)
# GST: 18% on brokerage
# Stamp duty: 0.015% (buy side)
# Slippage: ~0.05-0.1% for liquid stocks
# Total ≈ 0.15-0.2% per round trip
DEFAULT_COMMISSION = 0.002  # 0.2% — conservative, covers all costs
DEFAULT_CASH = 1_000_000    # ₹10 lakh starting capital


class BacktestEngine:
    """Production-grade backtesting engine.

    Wraps the backtesting.py library with:
    - Multi-tier data fetching (Angel One / yfinance / demo)
    - Realistic Indian market cost modeling
    - Interactive HTML chart generation
    - Strategy parameter optimization
    """

    def __init__(self, data_provider: Optional[DataProvider] = None):
        """Initialize the backtest engine.

        Args:
            data_provider: DataProvider instance. Creates one if not provided.
        """
        self._data_provider = data_provider or DataProvider()

    async def run_backtest(
        self,
        strategy_name: str,
        symbol: str = "RELIANCE",
        cash: float = DEFAULT_CASH,
        commission: float = DEFAULT_COMMISSION,
        days: int = 365,
        params: Optional[dict] = None,
    ) -> dict[str, Any]:
        """Run a backtest for a given strategy on a symbol.

        Args:
            strategy_name: Strategy identifier (e.g., "supertrend_rsi").
            symbol: Stock symbol (e.g., "RELIANCE", "TCS").
            cash: Starting capital (default: ₹10 lakh).
            commission: Round-trip commission (default: 0.2%).
            days: Number of historical days to test.
            params: Override default strategy parameters.

        Returns:
            Dict with:
                stats: Performance statistics dict.
                chart_html: Base64-encoded interactive HTML chart.
                strategy_info: Strategy metadata.
                data_info: Info about data source and period.
        """
        # Get strategy class
        strategy_cls = get_strategy(strategy_name)

        # Fetch data
        df = await self._data_provider.get_ohlcv(symbol, days=days)

        if df is None or len(df) < 30:
            return {
                "success": False,
                "error": f"Insufficient data for {symbol} ({len(df) if df is not None else 0} rows)",
                "stats": {},
                "chart_html": "",
            }

        # Override params if provided
        if params:
            # Create a dynamic subclass with overridden params
            strategy_cls = type(
                strategy_cls.__name__,
                (strategy_cls,),
                params,
            )

        # Run backtest
        bt = Backtest(
            df,
            strategy_cls,
            cash=cash,
            commission=commission,
            exclusive_orders=True,
        )

        stats = bt.run()

        # Generate chart HTML
        chart_html = self._generate_chart(bt, symbol, strategy_name)

        # Extract key stats
        stats_dict = self._extract_stats(stats)

        # Data info
        data_info = {
            "symbol": symbol,
            "days": days,
            "candles": len(df),
            "from_date": str(df.index[0].date()) if hasattr(df.index[0], "date") else str(df.index[0]),
            "to_date": str(df.index[-1].date()) if hasattr(df.index[-1], "date") else str(df.index[-1]),
            "is_demo": df.attrs.get("is_demo", False),
        }

        logger.info(
            "Backtest %s on %s: Return=%.1f%%, Win Rate=%.1f%%, Trades=%d",
            strategy_name,
            symbol,
            stats_dict.get("return_pct", 0),
            stats_dict.get("win_rate_pct", 0),
            stats_dict.get("total_trades", 0),
        )

        return {
            "success": True,
            "stats": stats_dict,
            "chart_html": chart_html,
            "strategy_info": strategy_cls.get_info() if hasattr(strategy_cls, "get_info") else {},
            "data_info": data_info,
        }

    def list_strategies(self) -> list[dict]:
        """List all available strategies with metadata.

        Returns:
            List of strategy info dicts.
        """
        return _list_strategies()

    async def optimize_strategy(
        self,
        strategy_name: str,
        symbol: str = "RELIANCE",
        cash: float = DEFAULT_CASH,
        commission: float = DEFAULT_COMMISSION,
        days: int = 365,
        maximize: str = "Return [%]",
        constraint: Optional[Any] = None,
    ) -> dict[str, Any]:
        """Optimize strategy parameters to find the best combination.

        Uses backtesting.py's built-in optimizer to search param space.

        Args:
            strategy_name: Strategy identifier.
            symbol: Stock symbol.
            cash: Starting capital.
            commission: Commission rate.
            days: Historical days to test.
            maximize: Metric to maximize (e.g., "Return [%]", "Sharpe Ratio").
            constraint: Optional constraint function.

        Returns:
            Dict with best params and optimized stats.
        """
        strategy_cls = get_strategy(strategy_name)
        df = await self._data_provider.get_ohlcv(symbol, days=days)

        if df is None or len(df) < 30:
            return {
                "success": False,
                "error": f"Insufficient data for {symbol}",
            }

        bt = Backtest(
            df,
            strategy_cls,
            cash=cash,
            commission=commission,
            exclusive_orders=True,
        )

        # Get optimization ranges from strategy
        opt_ranges = strategy_cls.get_optimization_ranges()

        if not opt_ranges:
            return {
                "success": False,
                "error": f"Strategy '{strategy_name}' has no optimization ranges defined.",
            }

        try:
            stats = bt.optimize(
                **opt_ranges,
                maximize=maximize,
                max_tries=200,  # Limit search space for speed
            )

            optimized_params = {}
            for param_name in opt_ranges:
                value = getattr(stats._strategy, param_name, None)
                if value is not None:
                    optimized_params[param_name] = value

            stats_dict = self._extract_stats(stats)

            logger.info(
                "Optimized %s on %s: Return=%.1f%%, Best params=%s",
                strategy_name,
                symbol,
                stats_dict.get("return_pct", 0),
                optimized_params,
            )

            return {
                "success": True,
                "best_params": optimized_params,
                "stats": stats_dict,
                "maximize": maximize,
                "symbol": symbol,
            }

        except Exception as exc:
            logger.error("Optimization failed for %s: %s", strategy_name, exc)
            return {
                "success": False,
                "error": str(exc),
            }

    def _generate_chart(
        self,
        bt: Backtest,
        symbol: str,
        strategy_name: str,
    ) -> str:
        """Generate interactive HTML chart and return as base64 string.

        Args:
            bt: Backtest instance (already ran).
            symbol: Stock symbol for chart title.
            strategy_name: Strategy name for chart title.

        Returns:
            Base64-encoded HTML string, or empty string on error.
        """
        try:
            # Create temp file for the chart
            with tempfile.NamedTemporaryFile(
                suffix=".html",
                delete=False,
                prefix=f"bt_{symbol}_{strategy_name}_",
            ) as tmp:
                tmp_path = tmp.name

            # backtesting.py plot() saves to file
            bt.plot(
                filename=tmp_path,
                open_browser=False,
            )

            # Read and encode
            with open(tmp_path, "r", encoding="utf-8") as f:
                html_content = f.read()

            # Clean up temp file
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

            # Encode to base64
            encoded = base64.b64encode(html_content.encode("utf-8")).decode("ascii")
            return encoded

        except Exception as exc:
            logger.warning("Chart generation failed: %s", exc)
            return ""

    def _extract_stats(self, stats) -> dict:
        """Extract key statistics from backtesting.py Stats object.

        Args:
            stats: Stats object from bt.run() or bt.optimize().

        Returns:
            Flat dict with human-readable stat names.
        """
        try:
            def _safe_get(key, default=0):
                """Safely get value from Stats (pandas Series)."""
                try:
                    val = stats[key]
                    if val is None or (isinstance(val, float) and val != val):  # NaN check
                        return default
                    return val
                except (KeyError, TypeError):
                    return default

            return {
                # Returns
                "return_pct": round(float(_safe_get("Return [%]")), 2),
                "buy_hold_return_pct": round(float(_safe_get("Buy & Hold Return [%]")), 2),
                "return_annual_pct": round(float(_safe_get("Return (Ann.) [%]")), 2),

                # Risk metrics
                "sharpe_ratio": round(float(_safe_get("Sharpe Ratio")), 2),
                "sortino_ratio": round(float(_safe_get("Sortino Ratio")), 2),
                "max_drawdown_pct": round(float(_safe_get("Max. Drawdown [%]")), 2),
                "calmar_ratio": round(float(_safe_get("Calmar Ratio")), 2),

                # Trade statistics
                "total_trades": int(_safe_get("# Trades")),
                "win_rate_pct": round(float(_safe_get("Win Rate [%]")), 2),
                "best_trade_pct": round(float(_safe_get("Best Trade [%]")), 2),
                "worst_trade_pct": round(float(_safe_get("Worst Trade [%]")), 2),
                "avg_trade_pct": round(float(_safe_get("Avg. Trade [%]")), 2),

                # Duration
                "avg_trade_duration": str(_safe_get("Avg. Trade Duration", "N/A")),
                "exposure_pct": round(float(_safe_get("Exposure Time [%]")), 2),

                # Final values
                "equity_final": round(float(_safe_get("Equity Final [$]")), 2),
                "equity_peak": round(float(_safe_get("Equity Peak [$]")), 2),

                # Profit factor
                "profit_factor": round(float(_safe_get("Profit Factor")), 2),
                "expectancy_pct": round(float(_safe_get("Expectancy [%]")), 2),
            }
        except Exception as exc:
            logger.warning("Stats extraction error: %s", exc)
            return {"error": str(exc)}
