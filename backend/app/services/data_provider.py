"""
Module: app/services/data_provider.py
Purpose: Multi-tier market data provider for backtesting.

Fetches OHLCV data from multiple sources in priority order:
1. Angel One SmartAPI (real broker data — requires connection)
2. yfinance (free NSE data via Yahoo Finance — ".NS" suffix)
3. Demo data generator (realistic synthetic data for offline testing)

The DataFrame returned has columns: Open, High, Low, Close, Volume
(capitalized — required by backtesting.py library).
"""

import logging
from datetime import datetime, timedelta
from typing import Optional

import numpy as np
import pandas as pd

logger = logging.getLogger("algotrade.data_provider")


class DataProvider:
    """Multi-tier market data provider.

    Fetches OHLCV data for backtesting with fallback chain:
    Angel One → yfinance → demo data.

    All methods return DataFrames with columns:
        Open, High, Low, Close, Volume (capitalized for backtesting.py)
    """

    # In-memory cache: {cache_key: (timestamp, DataFrame)}
    _cache: dict[str, tuple[datetime, pd.DataFrame]] = {}
    _CACHE_TTL_MINUTES: int = 30

    def __init__(self, angel_broker=None):
        """Initialize data provider.

        Args:
            angel_broker: Optional AngelOneBroker instance for real data.
        """
        self._angel_broker = angel_broker

    async def get_ohlcv(
        self,
        symbol: str,
        days: int = 365,
        interval: str = "ONE_DAY",
        use_cache: bool = True,
    ) -> pd.DataFrame:
        """Fetch OHLCV data using fallback chain.

        Args:
            symbol: Stock symbol (e.g., "RELIANCE", "TCS").
            days: Number of historical days to fetch.
            interval: Candle interval (default: daily).
            use_cache: Whether to use cached data.

        Returns:
            DataFrame with columns: Open, High, Low, Close, Volume.
            Index is DatetimeIndex.
        """
        cache_key = f"{symbol}_{days}_{interval}"

        # Check cache
        if use_cache and cache_key in self._cache:
            cached_time, cached_df = self._cache[cache_key]
            age_minutes = (datetime.now() - cached_time).total_seconds() / 60
            if age_minutes < self._CACHE_TTL_MINUTES:
                logger.debug("Cache hit for %s (age: %.1f min)", symbol, age_minutes)
                return cached_df.copy()

        # Tier 1: Angel One (if connected)
        df = await self._fetch_from_angel(symbol, days, interval)

        # Tier 2: yfinance (free fallback)
        if df is None or df.empty:
            df = self._fetch_from_yfinance(symbol, days)

        # Tier 3: Demo data (always works)
        if df is None or df.empty:
            logger.warning("Using demo data for %s (no real data available)", symbol)
            df = self._generate_demo_data(symbol, days)

        # Cache the result
        self._cache[cache_key] = (datetime.now(), df.copy())

        logger.info(
            "Fetched %d candles for %s (%s)",
            len(df),
            symbol,
            "real" if not df.attrs.get("is_demo", False) else "demo",
        )
        return df

    async def _fetch_from_angel(
        self,
        symbol: str,
        days: int,
        interval: str,
    ) -> Optional[pd.DataFrame]:
        """Fetch data from Angel One SmartAPI.

        Uses existing AngelOneBroker.get_historical() method.

        Returns:
            DataFrame or None if broker not available/connected.
        """
        if self._angel_broker is None:
            return None

        try:
            from app.constants import Exchange

            to_date = datetime.now()
            from_date = to_date - timedelta(days=days)

            df = await self._angel_broker.get_historical(
                symbol=symbol,
                exchange=Exchange.NSE,
                interval=interval,
                from_date=from_date,
                to_date=to_date,
            )

            if df is None or df.empty:
                return None

            # Standardize columns for backtesting.py
            df = df.rename(columns={
                "open": "Open",
                "high": "High",
                "low": "Low",
                "close": "Close",
                "volume": "Volume",
            })

            if "timestamp" in df.columns:
                df.index = pd.to_datetime(df["timestamp"])
                df = df.drop(columns=["timestamp"])
            elif "date" in df.columns:
                df.index = pd.to_datetime(df["date"])
                df = df.drop(columns=["date"])

            df.index.name = None
            return df[["Open", "High", "Low", "Close", "Volume"]]

        except Exception as exc:
            logger.warning("Angel One data fetch failed for %s: %s", symbol, exc)
            return None

    def _fetch_from_yfinance(
        self,
        symbol: str,
        days: int,
    ) -> Optional[pd.DataFrame]:
        """Fetch data from Yahoo Finance (free, no API key needed).

        Appends ".NS" suffix for NSE stocks (e.g., RELIANCE → RELIANCE.NS).

        Returns:
            DataFrame or None if fetch fails.
        """
        try:
            import yfinance as yf

            # Add .NS suffix for NSE if not already present
            yf_symbol = symbol if "." in symbol else f"{symbol}.NS"

            period = "1y" if days <= 365 else f"{min(days // 365 + 1, 10)}y"
            if days <= 30:
                period = "1mo"
            elif days <= 90:
                period = "3mo"
            elif days <= 180:
                period = "6mo"

            ticker = yf.Ticker(yf_symbol)
            df = ticker.history(period=period)

            if df is None or df.empty:
                logger.warning("yfinance returned no data for %s", yf_symbol)
                return None

            # yfinance returns: Open, High, Low, Close, Volume, Dividends, Stock Splits
            # Keep only OHLCV columns
            df = df[["Open", "High", "Low", "Close", "Volume"]].copy()

            # CRITICAL: backtesting.py requires timezone-naive DatetimeIndex.
            # yfinance returns timezone-aware dates (e.g., +05:30 IST).
            if df.index.tz is not None:
                df.index = df.index.tz_localize(None)

            # Remove any rows with NaN
            df = df.dropna()

            if len(df) < 20:
                logger.warning("yfinance returned only %d rows for %s", len(df), yf_symbol)
                return None

            logger.info("Fetched %d candles from yfinance for %s", len(df), yf_symbol)
            return df

        except ImportError:
            logger.warning("yfinance not installed — skipping")
            return None
        except Exception as exc:
            logger.warning("yfinance fetch failed for %s: %s", symbol, exc)
            return None

    def _generate_demo_data(
        self,
        symbol: str,
        days: int = 365,
    ) -> pd.DataFrame:
        """Generate realistic synthetic OHLCV data.

        Uses geometric Brownian motion with realistic Indian stock parameters.
        This data is for testing only — never for real trading decisions.

        Args:
            symbol: Stock symbol (used to seed the random generator for consistency).
            days: Number of trading days to generate.

        Returns:
            DataFrame with realistic OHLCV data.
        """
        # Seed based on symbol for reproducible data
        seed = sum(ord(c) for c in symbol) % 10000
        rng = np.random.default_rng(seed)

        # Realistic Indian stock parameters
        base_prices = {
            "RELIANCE": 2500.0,
            "TCS": 3800.0,
            "INFY": 1500.0,
            "HDFCBANK": 1600.0,
            "ICICIBANK": 1100.0,
            "SBIN": 750.0,
            "WIPRO": 450.0,
            "ITC": 450.0,
            "BHARTIARTL": 1400.0,
            "LT": 3500.0,
            "TATAMOTORS": 900.0,
            "MARUTI": 11000.0,
            "KOTAKBANK": 1700.0,
            "AXISBANK": 1100.0,
            "BAJFINANCE": 6800.0,
        }
        base_price = base_prices.get(symbol.upper(), 1000.0 + rng.random() * 2000)

        # Generate daily returns using geometric Brownian motion
        # Indian market: ~12% annual return, ~18% annual volatility
        annual_return = 0.12
        annual_volatility = 0.18
        daily_return = annual_return / 252
        daily_vol = annual_volatility / np.sqrt(252)

        returns = rng.normal(daily_return, daily_vol, days)

        # Add some trend and mean-reversion characteristics
        # (makes strategies more testable)
        trend = np.cumsum(returns)
        mean_reversion = -0.02 * (trend - np.mean(trend))
        returns = returns + mean_reversion / days

        # Build price series
        prices = np.zeros(days)
        prices[0] = base_price
        for i in range(1, days):
            prices[i] = prices[i - 1] * (1 + returns[i])

        # Generate OHLCV from close prices
        dates = pd.bdate_range(
            end=datetime.now().date(),
            periods=days,
        )

        opens = prices * (1 + rng.uniform(-0.005, 0.005, days))
        highs = np.maximum(opens, prices) * (1 + rng.uniform(0.001, 0.02, days))
        lows = np.minimum(opens, prices) * (1 - rng.uniform(0.001, 0.02, days))
        closes = prices

        # Volume: realistic pattern with occasional spikes
        base_volume = rng.integers(500_000, 5_000_000, size=1)[0]
        volume = rng.integers(
            int(base_volume * 0.5),
            int(base_volume * 1.5),
            size=days,
        ).astype(float)

        # Add volume spikes on big move days
        big_moves = np.abs(returns) > daily_vol * 1.5
        volume[big_moves] *= rng.uniform(1.5, 3.0, np.sum(big_moves))

        df = pd.DataFrame(
            {
                "Open": np.round(opens, 2),
                "High": np.round(highs, 2),
                "Low": np.round(lows, 2),
                "Close": np.round(closes, 2),
                "Volume": volume.astype(int),
            },
            index=dates[:days],
        )

        # Mark as demo data
        df.attrs["is_demo"] = True
        df.attrs["symbol"] = symbol

        return df

    def clear_cache(self) -> None:
        """Clear the data cache."""
        self._cache.clear()
        logger.info("Data cache cleared")

    def get_cache_info(self) -> dict:
        """Get cache statistics."""
        return {
            "cached_symbols": len(self._cache),
            "entries": [
                {
                    "key": key,
                    "rows": len(df),
                    "age_minutes": round(
                        (datetime.now() - ts).total_seconds() / 60, 1,
                    ),
                }
                for key, (ts, df) in self._cache.items()
            ],
        }
