"""
Module: app/services/technical_analysis.py
Purpose: Breakout & Support/Resistance scanner using TradingView Scanner API.

Uses tradingview-screener to batch-fetch RSI, SMA, EMA, volume, price,
52-week high/low, etc. for ALL NSE stocks in a SINGLE API call.
Then scores each stock for breakout/reversal probability.

No per-stock API calls needed = fast, reliable, no rate limits.
"""

import logging
import math
import time
from typing import Optional

from app.services.cache import TTLCache
from app.services.screener_service import sanitize_for_json

logger = logging.getLogger(__name__)

_ta_cache = TTLCache(default_ttl=600)  # 10 min cache


def sf(val, default=0.0):
    """Safe float."""
    try:
        if val is None:
            return default
        v = float(val)
        return default if (math.isnan(v) or math.isinf(v)) else v
    except (TypeError, ValueError):
        return default


# ━━━━━━━━━━━━━━━ TradingView Batch Scanner ━━━━━━━━━━━━━━━

TV_COLUMNS = [
    "name", "description", "close", "change", "change_abs",
    "volume", "average_volume_10d_calc", "average_volume_30d_calc",
    "RSI", "RSI[1]",
    "SMA20", "SMA50", "SMA200",
    "EMA20", "EMA50",
    "BB.upper", "BB.lower",
    "High.All", "Low.All",   # 52-week high/low
    "price_52_week_high", "price_52_week_low",
    "high", "low",  # Today's high/low
    "Perf.W", "Perf.1M", "Perf.3M",   # Performance
    "Volatility.D",
    "ADX", "ADX+DI", "ADX-DI",
    "MACD.macd", "MACD.signal",
    "Stoch.K", "Stoch.D",
    "Pivot.M.Classic.S1", "Pivot.M.Classic.S2", "Pivot.M.Classic.S3",
    "Pivot.M.Classic.R1", "Pivot.M.Classic.R2", "Pivot.M.Classic.R3",
    "Pivot.M.Classic.Middle",
    "Recommend.All", "Recommend.MA", "Recommend.Other",
    "market_cap_basic",
    "sector",
]


def _fetch_tradingview_scan(min_price: float = 20, min_volume: int = 100000, limit: int = 200) -> list[dict]:
    """Fetch technical data for NSE stocks via TradingView Scanner API."""
    cache_key = "tv_scan_all"
    cached = _ta_cache.get(cache_key)
    if cached:
        logger.info("[TV] Using cached scan data (%d stocks)", len(cached))
        return cached

    try:
        from tradingview_screener import Query, Column

        # Build query: Indian market stocks with minimum price and volume
        query = (
            Query()
            .select(*TV_COLUMNS)
            .set_markets("india")
            .where(
                Column("close") > min_price,
                Column("volume") > min_volume,
                Column("is_primary") == True,
            )
            .order_by("volume", ascending=False)
            .limit(limit)
        )

        count, df = query.get_scanner_data()
        logger.info("[TV] Fetched %d stocks from TradingView (total: %d)", len(df), count)

        if df is None or df.empty:
            return []

        results = []
        for _, row in df.iterrows():
            stock = {}
            for col in df.columns:
                val = row[col]
                if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
                    stock[col] = 0
                else:
                    stock[col] = val
            results.append(stock)

        _ta_cache.set(cache_key, results, ttl=600)
        return results

    except Exception as e:
        logger.error("[TV] TradingView scan failed: %s", str(e)[:200])
        return []


# ━━━━━━━━━━━━━━━ Breakout Scoring ━━━━━━━━━━━━━━━

def _score_breakout(stock: dict) -> dict:
    """Score a stock for breakout/reversal potential using TradingView data."""
    name = stock.get("name", "")
    symbol = name.split(":")[-1] if ":" in str(name) else str(name)
    desc = stock.get("description", symbol)
    price = sf(stock.get("close"))
    if price <= 0:
        return None

    score = 0
    signals = []
    category = "BREAKOUT"  # or "REVERSAL" or "MOMENTUM"

    rsi = sf(stock.get("RSI"))
    rsi_prev = sf(stock.get("RSI[1]"))
    sma20 = sf(stock.get("SMA20"))
    sma50 = sf(stock.get("SMA50"))
    sma200 = sf(stock.get("SMA200"))
    ema20 = sf(stock.get("EMA20"))
    ema50 = sf(stock.get("EMA50"))
    bb_upper = sf(stock.get("BB.upper"))
    bb_lower = sf(stock.get("BB.lower"))
    vol = sf(stock.get("volume"))
    avg_vol_10 = sf(stock.get("average_volume_10d_calc"))
    avg_vol_30 = sf(stock.get("average_volume_30d_calc"))
    w52_high = sf(stock.get("price_52_week_high")) or sf(stock.get("High.All"))
    w52_low = sf(stock.get("price_52_week_low")) or sf(stock.get("Low.All"))
    perf_w = sf(stock.get("Perf.W"))
    perf_1m = sf(stock.get("Perf.1M"))
    adx = sf(stock.get("ADX"))
    adx_plus = sf(stock.get("ADX+DI"))
    adx_minus = sf(stock.get("ADX-DI"))
    macd = sf(stock.get("MACD.macd"))
    macd_signal = sf(stock.get("MACD.signal"))
    stoch_k = sf(stock.get("Stoch.K"))
    stoch_d = sf(stock.get("Stoch.D"))
    pivot_s1 = sf(stock.get("Pivot.M.Classic.S1"))
    pivot_s2 = sf(stock.get("Pivot.M.Classic.S2"))
    pivot_r1 = sf(stock.get("Pivot.M.Classic.R1"))
    pivot_r2 = sf(stock.get("Pivot.M.Classic.R2"))
    pivot_mid = sf(stock.get("Pivot.M.Classic.Middle"))
    recommend = sf(stock.get("Recommend.All"))
    mcap = sf(stock.get("market_cap_basic"))

    # ── 1. RSI Momentum (max 20 pts) ──
    if 55 <= rsi <= 70:
        score += 20
        signals.append(f"RSI {rsi:.1f} — Bullish momentum zone ✅")
    elif 45 <= rsi < 55:
        score += 8
        signals.append(f"RSI {rsi:.1f} — Neutral zone")
    elif rsi > 70:
        score += 5
        signals.append(f"RSI {rsi:.1f} — Overbought, caution")
    elif 30 <= rsi < 45:
        score += 12
        signals.append(f"RSI {rsi:.1f} — Approaching support bounce")
        category = "REVERSAL"
    elif rsi < 30 and rsi > 0:
        score += 15
        signals.append(f"RSI {rsi:.1f} — Oversold, reversal candidate 🔄")
        category = "REVERSAL"

    # RSI rising
    if rsi_prev > 0 and rsi > rsi_prev:
        score += 3
        signals.append(f"RSI rising ({rsi_prev:.0f} → {rsi:.0f})")

    # ── 2. Moving Average Alignment (max 20 pts) ──
    if sma20 > 0 and sma50 > 0:
        if price > ema20 > sma50:
            score += 20
            signals.append("Price > EMA20 > SMA50 — Bullish stack ✅")
        elif price > sma20:
            score += 10
            signals.append("Price above SMA20 — Short-term bullish")
        elif price < sma20 < sma50:
            signals.append("Below moving averages — Bearish")

    if sma200 > 0 and price > sma200:
        score += 5
        signals.append("Above 200 SMA — Long-term trend intact")

    # ── 3. Volume Surge (max 15 pts) ──
    vol_ratio = vol / avg_vol_10 if avg_vol_10 > 0 else 0
    if vol_ratio > 2.0:
        score += 15
        signals.append(f"Volume explosion {vol_ratio:.1f}x — Institutional interest 🔥")
    elif vol_ratio > 1.5:
        score += 10
        signals.append(f"Volume surge {vol_ratio:.1f}x avg 🔥")
    elif vol_ratio > 1.2:
        score += 5
        signals.append(f"Volume rising {vol_ratio:.1f}x")

    # ── 4. 52-Week High Proximity (max 15 pts) ──
    if w52_high > 0 and price > 0:
        from_high_pct = ((w52_high - price) / w52_high) * 100
        from_low_pct = ((price - w52_low) / w52_low) * 100 if w52_low > 0 else 0

        if from_high_pct < 3:
            score += 15
            signals.append(f"Within 3% of 52W High ₹{w52_high:.0f} — Breakout zone 🚀")
        elif from_high_pct < 8:
            score += 10
            signals.append(f"Within 8% of 52W High ₹{w52_high:.0f}")
        elif from_high_pct < 15:
            score += 5
            signals.append(f"Approaching 52W High ({from_high_pct:.0f}% away)")

        # Near 52W low = reversal candidate
        if from_low_pct < 10 and w52_low > 0:
            score += 8
            signals.append(f"Near 52W Low ₹{w52_low:.0f} — Support bounce? 🔄")
            category = "REVERSAL"

    # ── 5. Pivot Point Analysis (max 10 pts) ──
    if pivot_r1 > 0 and price > 0:
        dist_to_r1 = ((pivot_r1 - price) / price) * 100
        if dist_to_r1 < 2 and dist_to_r1 > 0:
            score += 10
            signals.append(f"At Pivot R1 ₹{pivot_r1:.0f} — Resistance test ⚡")
        elif dist_to_r1 < 0:
            score += 8
            signals.append(f"Above Pivot R1 ₹{pivot_r1:.0f} — Breakout confirmed")

    if pivot_s1 > 0 and price > 0:
        dist_to_s1 = ((price - pivot_s1) / price) * 100
        if dist_to_s1 < 2 and dist_to_s1 > 0:
            score += 7
            signals.append(f"At Pivot S1 ₹{pivot_s1:.0f} — Support test 🛡️")
            category = "REVERSAL"

    # ── 6. MACD & ADX (max 10 pts) ──
    if macd > macd_signal and macd_signal != 0:
        score += 5
        signals.append("MACD above signal — Bullish crossover")
    if adx > 25 and adx_plus > adx_minus:
        score += 5
        signals.append(f"ADX {adx:.0f} with +DI > -DI — Strong trend")

    # ── 7. Bollinger Band Squeeze (max 5 pts) ──
    if bb_upper > 0 and bb_lower > 0 and price > 0:
        bb_width = (bb_upper - bb_lower) / price * 100
        if bb_width < 5:
            score += 5
            signals.append(f"Bollinger squeeze ({bb_width:.1f}%) — Expansion imminent 🎯")
        if price > bb_upper:
            score += 3
            signals.append("Price above upper Bollinger — Strong momentum")

    # ── 8. TradingView Recommendation ──
    if recommend > 0.3:
        score += 3
        signals.append(f"TradingView: BUY signal ({recommend:.2f})")
    elif recommend < -0.3:
        signals.append(f"TradingView: SELL signal ({recommend:.2f})")

    # Direction
    if score >= 55:
        direction = "BULLISH"
    elif score < 20:
        direction = "BEARISH"
    else:
        direction = "NEUTRAL"

    # Build support/resistance from pivots
    support_levels = []
    resistance_levels = []
    if pivot_s1 > 0:
        support_levels.append({"price": round(pivot_s1, 2), "label": "Pivot S1"})
    if pivot_s2 > 0:
        support_levels.append({"price": round(pivot_s2, 2), "label": "Pivot S2"})
    if sma50 > 0 and sma50 < price:
        support_levels.append({"price": round(sma50, 2), "label": "SMA 50"})
    if sma200 > 0 and sma200 < price:
        support_levels.append({"price": round(sma200, 2), "label": "SMA 200"})

    if pivot_r1 > 0:
        resistance_levels.append({"price": round(pivot_r1, 2), "label": "Pivot R1"})
    if pivot_r2 > 0:
        resistance_levels.append({"price": round(pivot_r2, 2), "label": "Pivot R2"})
    if w52_high > 0 and w52_high > price:
        resistance_levels.append({"price": round(w52_high, 2), "label": "52W High"})

    support_levels.sort(key=lambda x: x["price"], reverse=True)
    resistance_levels.sort(key=lambda x: x["price"])

    return {
        "symbol": symbol,
        "name": desc,
        "price": round(price, 2),
        "change_pct": round(sf(stock.get("change")) * 100, 2) if sf(stock.get("change")) != 0 else 0,
        "breakout_score": min(max(score, 0), 100),
        "direction": direction,
        "category": category,
        "signals": signals[:6],
        "rsi": round(rsi, 1),
        "sma20": round(sma20, 2),
        "sma50": round(sma50, 2),
        "sma200": round(sma200, 2),
        "ema20": round(ema20, 2),
        "volume": vol,
        "vol_ratio": round(vol_ratio, 1),
        "w52_high": round(w52_high, 2),
        "w52_low": round(w52_low, 2),
        "perf_week": round(perf_w * 100, 1) if perf_w != 0 else 0,
        "perf_month": round(perf_1m * 100, 1) if perf_1m != 0 else 0,
        "adx": round(adx, 1),
        "macd": round(macd, 2),
        "recommend": round(recommend, 2),
        "support": support_levels[:3],
        "resistance": resistance_levels[:3],
        "market_cap": round(mcap / 1e7, 0) if mcap > 0 else 0,
        "sector": stock.get("sector", ""),
    }


# ━━━━━━━━━━━━━━━ Public API ━━━━━━━━━━━━━━━

def scan_breakouts(symbols: list[str] = None, top_n: int = 20) -> list[dict]:
    """Scan all NSE stocks for breakout candidates using TradingView data."""
    stocks = _fetch_tradingview_scan(min_price=20, min_volume=100000, limit=200)
    if not stocks:
        logger.warning("[TV] No data from TradingView scan")
        return []

    results = []
    for stock in stocks:
        scored = _score_breakout(stock)
        if scored and scored["breakout_score"] > 15 and scored["price"] > 0:
            results.append(scored)

    results.sort(key=lambda x: x["breakout_score"], reverse=True)
    logger.info("[TV] Breakout scan: %d candidates from %d stocks", len(results[:top_n]), len(stocks))
    return sanitize_for_json(results[:top_n])


def analyze_stock(symbol: str) -> dict:
    """Get TA for a single stock from the TradingView scan cache."""
    cache_key = f"ta_{symbol}"
    cached = _ta_cache.get(cache_key)
    if cached:
        return cached

    # Try to find in batch scan data
    stocks = _fetch_tradingview_scan(min_price=5, min_volume=10000, limit=500)
    for stock in stocks:
        # TV returns 'ticker' as 'NSE:RELIANCE' and 'name' as 'RELIANCE'
        name = stock.get("name", "")
        ticker = stock.get("ticker", "")
        sym = name.split(":")[-1] if ":" in str(name) else str(name)
        tick_sym = ticker.split(":")[-1] if ":" in str(ticker) else str(ticker)
        if sym.upper() == symbol.upper() or tick_sym.upper() == symbol.upper():
            result = _score_breakout(stock)
            if result:
                result = sanitize_for_json(result)
                _ta_cache.set(cache_key, result, ttl=600)
                return result

    return {"symbol": symbol, "error": "Not found in scan data"}


async def ensure_instruments_loaded():
    """No-op kept for backward compatibility."""
    pass
