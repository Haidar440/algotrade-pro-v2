"""Quick test: Run all 6 strategies on RELIANCE and SBIN to verify signals."""
import asyncio
from app.services.backtest_engine import BacktestEngine
from app.services.data_provider import DataProvider
import pandas_ta as ta


async def main():
    engine = BacktestEngine()
    strategies = [
        "supertrend_rsi",
        "ema_adx",
        "vwap_orb",
        "rsi_macd",
        "vcp_breakout",
        "volume_breakout",
    ]
    symbols = ["RELIANCE", "SBIN", "TCS", "INFY", "HDFCBANK"]

    # Quick diagnosis of RSI+MACD requirements
    dp = DataProvider()
    df = await dp.get_ohlcv("RELIANCE", days=700)
    print(f"RELIANCE candles (700 days): {len(df)}")
    rsi = ta.rsi(df["Close"], length=14)
    oversold = rsi[rsi < 35].dropna()
    print(f"RSI < 35 occurrences: {len(oversold)}")
    if len(oversold) > 0:
        print(f"  Dates: {list(oversold.index[:5])}")
    print()

    for symbol in symbols:
        print(f"\n{'='*60}")
        print(f"  {symbol}")
        print(f"{'='*60}")
        for strat in strategies:
            result = await engine.run_backtest(strat, symbol, days=365)
            stats = result.get("stats", {})
            trades = stats.get("total_trades", 0)
            ret = stats.get("return_pct", 0)
            wr = stats.get("win_rate_pct", 0)
            data_info = result.get("data_info", {})
            candles = data_info.get("candles", "?")
            print(f"  {strat:<20s}  Trades={trades:>3d}  Return={ret:>7.1f}%  WinRate={wr:>5.1f}%  (candles={candles})")


if __name__ == "__main__":
    asyncio.run(main())
