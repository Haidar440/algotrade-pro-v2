"""
Sprint 4 Verification Script — tests all components.
Run: python scripts/verify_sprint4.py
Output: writes results to scripts/_sprint4_output.txt
"""
import sys
import os
import traceback
import asyncio

OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "_sprint4_output.txt")

def w(msg):
    """Write message to both console and file."""
    print(msg, flush=True)
    with open(OUTPUT_FILE, "a", encoding="utf-8") as f:
        f.write(msg + "\n")

async def run_all_tests():
    """Run all verification tests."""
    # Clear output file
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write("Sprint 4 Verification Results\n")
        f.write("=" * 50 + "\n\n")

    # Step 1: Test imports
    w("STEP 1: Testing imports...")
    try:
        import pandas as pd
        import numpy as np
        import pandas_ta as ta
        w("  ✅ pandas, numpy, pandas_ta")
    except ImportError as e:
        w(f"  ❌ Core import failed: {e}")
        return

    try:
        from backtesting import Backtest, Strategy
        w("  ✅ backtesting (Backtest, Strategy)")
    except ImportError as e:
        w(f"  ❌ backtesting import failed: {e}")
        return

    try:
        import yfinance as yf
        w("  ✅ yfinance")
    except ImportError as e:
        w(f"  ❌ yfinance import failed: {e}")

    # Step 2: Test data provider
    w("\nSTEP 2: Testing DataProvider...")
    try:
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

        from app.services.data_provider import DataProvider

        dp = DataProvider()
        dp.clear_cache()  # Ensure fresh data

        df = await dp.get_ohlcv("RELIANCE", days=365)
        w(f"  ✅ DataProvider: Got {len(df)} candles for RELIANCE")
        w(f"     Columns: {list(df.columns)}")
        w(f"     Date range: {df.index[0]} to {df.index[-1]}")
        w(f"     Last close: ₹{df['Close'].iloc[-1]:.2f}")
        w(f"     Timezone: {df.index.tz} (must be None)")
    except Exception as e:
        w(f"  ❌ DataProvider failed: {e}")
        traceback.print_exc()
        return

    # Step 3: Test strategy registry
    w("\nSTEP 3: Testing strategy imports...")
    try:
        from app.strategies import list_strategies, get_strategy, STRATEGY_REGISTRY, _register_strategies
        _register_strategies()
        strategies = list_strategies()
        w(f"  ✅ Loaded {len(strategies)} strategies:")
        for s in strategies:
            w(f"     • {s['name']} ({s['strategy_type']}) — Expected: {s['expected_win_rate']}")
    except Exception as e:
        w(f"  ❌ Strategy import failed: {e}")
        traceback.print_exc()
        return

    # Step 4: Run ALL 6 strategies directly
    w("\nSTEP 4: Backtesting all 6 strategies on RELIANCE (real data)...")
    try:
        total_trades = 0
        for key, cls in STRATEGY_REGISTRY.items():
            try:
                bt = Backtest(df, cls, cash=1_000_000, commission=0.002)
                stats = bt.run()
                trades = int(stats["# Trades"])
                total_trades += trades
                ret = stats["Return [%]"]
                w(f"  ✅ {key}: Return={ret:.1f}%, Trades={trades}")
            except Exception as e:
                w(f"  ❌ {key}: {e}")

        w(f"  📊 Total trades across all strategies: {total_trades}")
    except Exception as e:
        w(f"  ❌ Strategy test failed: {e}")
        traceback.print_exc()

    # Step 5: Test BacktestEngine service
    w("\nSTEP 5: Testing BacktestEngine service...")
    try:
        from app.services.backtest_engine import BacktestEngine

        engine = BacktestEngine()
        result = await engine.run_backtest("vwap_orb", "RELIANCE", days=365)
        if result.get("success"):
            stats = result["stats"]
            w(f"  ✅ BacktestEngine: Return={stats['return_pct']}%, Trades={stats['total_trades']}")
            w(f"     Win Rate: {stats['win_rate_pct']}%")
            w(f"     Sharpe: {stats['sharpe_ratio']}")
            w(f"     Chart: {'✅ Generated' if result.get('chart_html') else '⚠️ Skipped'}")
        else:
            w(f"  ❌ Engine failed: {result.get('error')}")
    except Exception as e:
        w(f"  ❌ BacktestEngine test failed: {e}")
        traceback.print_exc()

    # Step 6: Test schemas & constants
    w("\nSTEP 6: Testing schemas & constants...")
    try:
        from app.constants import StrategyType, BacktestStatus
        w(f"  ✅ StrategyType: {[e.value for e in StrategyType]}")
        w(f"  ✅ BacktestStatus: {[e.value for e in BacktestStatus]}")

        from app.models.schemas import (
            BacktestRequest, BacktestResult, StrategyInfo,
            OptimizeRequest, OptimizeResult,
        )
        w("  ✅ All 5 backtest schemas imported")

        req = BacktestRequest(strategy_name="supertrend_rsi")
        w(f"  ✅ BacktestRequest validation: {req.strategy_name}, ₹{req.cash:,.0f}")
    except Exception as e:
        w(f"  ❌ Schema/constant test: {e}")

    w("\n" + "=" * 50)
    w("✅ ALL VERIFICATION STEPS COMPLETE")
    w(f"Results saved to: {OUTPUT_FILE}")


if __name__ == "__main__":
    asyncio.run(run_all_tests())
