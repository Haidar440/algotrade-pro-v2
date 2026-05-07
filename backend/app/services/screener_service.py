"""
Module: app/services/screener_service.py
Purpose: Stock screener — fetches ALL NSE stocks (Nifty 500) with KPIs.

Strategy:
  1. NSE India API for bulk price data (500 stocks, 1 call each for Nifty indices)
  2. yfinance threaded for fundamentals (PE, ROE, Market Cap) — cached 30 min
  3. Hybrid: fast price data first, fundamentals loaded in background
"""

import asyncio
import logging
import time
import json
import os
from dataclasses import dataclass, field, asdict
from typing import Optional
from concurrent.futures import ThreadPoolExecutor

import math
import requests

from app.services.cache import TTLCache

logger = logging.getLogger(__name__)

_screener_cache = TTLCache(default_ttl=1800)  # 30 min cache
_executor = ThreadPoolExecutor(max_workers=5)


def sanitize_for_json(obj):
    """Recursively replace NaN/Inf with 0 in any nested structure."""
    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize_for_json(v) for v in obj]
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return 0
    return obj

# NSE headers to bypass bot detection
NSE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nseindia.com/",
}

# NSE index endpoints — each returns 50-200 stocks
NSE_INDICES = [
    "NIFTY 50", "NIFTY NEXT 50", "NIFTY MIDCAP 150", "NIFTY SMALLCAP 250",
    "NIFTY BANK", "NIFTY IT", "NIFTY PHARMA", "NIFTY AUTO",
    "NIFTY METAL", "NIFTY ENERGY", "NIFTY FMCG", "NIFTY REALTY",
]


@dataclass
class StockKPI:
    symbol: str = ""
    name: str = ""
    sector: str = ""
    industry: str = ""
    price: float = 0.0
    change_pct: float = 0.0
    open_price: float = 0.0
    day_high: float = 0.0
    day_low: float = 0.0
    volume: int = 0
    avg_volume: int = 0
    market_cap: float = 0.0
    pe_ratio: float = 0.0
    pb_ratio: float = 0.0
    ev_ebitda: float = 0.0
    roe: float = 0.0
    roce: float = 0.0
    profit_margin: float = 0.0
    operating_margin: float = 0.0
    revenue_growth: float = 0.0
    earnings_growth: float = 0.0
    eps: float = 0.0
    dividend_yield: float = 0.0
    book_value: float = 0.0
    debt_to_equity: float = 0.0
    current_ratio: float = 0.0
    week_52_high: float = 0.0
    week_52_low: float = 0.0
    from_52w_high_pct: float = 0.0
    promoter_holding: float = 0.0
    beta: float = 0.0
    pchange_30d: float = 0.0
    pchange_365d: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)


PRESET_SCREENS = {
    "undervalued": {
        "label": "Undervalued Stocks",
        "desc": "Low PE, high ROE, profitable companies",
        "filters": {"pe_ratio": {"min": 1, "max": 20}, "roe": {"min": 12}},
        "icon": "gem",
    },
    "high_growth": {
        "label": "High Growth",
        "desc": "Strong revenue and earnings growth",
        "filters": {"revenue_growth": {"min": 15}, "earnings_growth": {"min": 15}},
        "icon": "rocket",
    },
    "dividend_yield": {
        "label": "Dividend Champions",
        "desc": "High dividend yield stocks",
        "filters": {"dividend_yield": {"min": 2}},
        "icon": "banknote",
    },
    "low_debt": {
        "label": "Debt-Free / Low Debt",
        "desc": "Minimal leverage, strong balance sheets",
        "filters": {"debt_to_equity": {"max": 0.3}, "roe": {"min": 10}},
        "icon": "shield",
    },
    "near_52w_low": {
        "label": "Near 52-Week Low",
        "desc": "Quality stocks near yearly lows",
        "filters": {"from_52w_high_pct": {"min": 20}, "market_cap": {"min": 2000}},
        "icon": "arrow-down",
    },
    "large_cap_quality": {
        "label": "Large Cap Quality",
        "desc": "Blue-chip stocks with strong fundamentals",
        "filters": {"market_cap": {"min": 50000}, "roe": {"min": 15}},
        "icon": "crown",
    },
    "momentum": {
        "label": "Momentum Runners",
        "desc": "Stocks near 52-week highs with volume",
        "filters": {"from_52w_high_pct": {"max": 5}, "market_cap": {"min": 3000}},
        "icon": "zap",
    },
    "small_cap_gems": {
        "label": "Small Cap Gems",
        "desc": "High-growth small caps",
        "filters": {"market_cap": {"max": 10000, "min": 500}, "revenue_growth": {"min": 20}},
        "icon": "sparkles",
    },
}


class ScreenerService:
    """Fetches stock data from NSE + yfinance hybrid approach."""

    def __init__(self):
        self._session: Optional[requests.Session] = None

    def _get_session(self) -> requests.Session:
        """Create a requests session with NSE cookies."""
        if self._session is None:
            self._session = requests.Session()
            self._session.headers.update(NSE_HEADERS)
            try:
                # Get cookies from NSE homepage first
                self._session.get("https://www.nseindia.com", timeout=10)
            except Exception:
                pass
        return self._session

    async def get_all_stocks(self, page: int = 1, per_page: int = 50, sort_by: str = "market_cap", sort_dir: str = "desc") -> dict:
        stocks = await self._get_cached_kpis()
        reverse = sort_dir == "desc"
        stocks.sort(key=lambda s: getattr(s, sort_by, 0) or 0, reverse=reverse)
        total = len(stocks)
        start = (page - 1) * per_page
        page_stocks = stocks[start:start + per_page]
        return sanitize_for_json({
            "stocks": [s.to_dict() for s in page_stocks],
            "total": total, "page": page, "per_page": per_page,
            "total_pages": (total + per_page - 1) // per_page,
        })

    async def filter_stocks(self, filters: dict, sort_by: str = "market_cap", sort_dir: str = "desc") -> dict:
        stocks = await self._get_cached_kpis()
        filtered = self._apply_filters(stocks, filters)
        reverse = sort_dir == "desc"
        filtered.sort(key=lambda s: getattr(s, sort_by, 0) or 0, reverse=reverse)
        return sanitize_for_json({"stocks": [s.to_dict() for s in filtered], "total": len(filtered), "filters_applied": filters})

    async def get_stock_detail(self, symbol: str) -> dict:
        cache_key = f"detail_{symbol}"
        cached = _screener_cache.get(cache_key)
        if cached:
            return cached
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(_executor, self._fetch_single_detail, symbol)
        result = sanitize_for_json(result)
        _screener_cache.set(cache_key, result)
        return result

    async def get_presets(self) -> dict:
        return {"presets": PRESET_SCREENS}

    async def _get_cached_kpis(self) -> list[StockKPI]:
        cached = _screener_cache.get("all_kpis")
        if cached:
            return cached
        loop = asyncio.get_event_loop()
        stocks = await loop.run_in_executor(_executor, self._fetch_all_stocks)
        if stocks:
            _screener_cache.set("all_kpis", stocks)
        return stocks

    def _fetch_nse_index(self, index_name: str) -> list[dict]:
        """Fetch all stocks from one NSE index."""
        try:
            session = self._get_session()
            url = f"https://www.nseindia.com/api/equity-stockIndices?index={requests.utils.quote(index_name)}"
            resp = session.get(url, timeout=15)
            if resp.status_code == 200:
                data = resp.json()
                return data.get("data", [])
        except Exception as e:
            logger.warning("[screener] NSE index '%s' fetch failed: %s", index_name, str(e)[:100])
        return []

    def _fetch_all_stocks(self) -> list[StockKPI]:
        """Fetch all stocks — NSE first, then enrich with yfinance fundamentals."""
        start = time.time()

        # Step 1: Get price data from NSE (fast, covers 500+ stocks)
        all_nse_data: dict[str, dict] = {}
        for index in NSE_INDICES:
            try:
                stocks_data = self._fetch_nse_index(index)
                for s in stocks_data:
                    sym = s.get("symbol", "")
                    if sym and sym != "NIFTY 50" and not sym.startswith("NIFTY"):
                        all_nse_data[sym] = s
                time.sleep(0.3)  # Rate limit
            except Exception as e:
                logger.warning("[screener] Index %s failed: %s", index, str(e)[:100])

        logger.info("[screener] NSE returned %d unique stocks from %d indices", len(all_nse_data), len(NSE_INDICES))

        # Step 2: Build StockKPI from NSE data
        symbols = list(all_nse_data.keys())
        stocks: list[StockKPI] = []

        for sym in symbols:
            d = all_nse_data[sym]
            price = d.get("lastPrice", 0) or 0
            w52h = d.get("yearHigh", 0) or 0
            w52l = d.get("yearLow", 0) or 0
            from_high = ((w52h - price) / w52h * 100) if w52h > 0 else 0

            stocks.append(StockKPI(
                symbol=sym,
                name=d.get("meta", {}).get("companyName", "") or d.get("identifier", sym) or sym,
                sector=d.get("meta", {}).get("industry", "") or "",
                industry=d.get("meta", {}).get("industry", "") or "",
                price=round(price, 2),
                change_pct=round(d.get("pChange", 0) or 0, 2),
                open_price=round(d.get("open", 0) or 0, 2),
                day_high=round(d.get("dayHigh", 0) or 0, 2),
                day_low=round(d.get("dayLow", 0) or 0, 2),
                volume=int(d.get("totalTradedVolume", 0) or 0),
                week_52_high=round(w52h, 2),
                week_52_low=round(w52l, 2),
                from_52w_high_pct=round(from_high, 1),
                pchange_30d=round(d.get("perChange30d", 0) or 0, 1),
                pchange_365d=round(d.get("perChange365d", 0) or 0, 1),
                pe_ratio=round(d.get("meta", {}).get("pdSymbolPe", 0) or 0, 1),
            ))

        # Step 3: Enrich top 200 stocks with yfinance fundamentals (threaded)
        if stocks:
            stocks.sort(key=lambda s: s.volume, reverse=True)
            top_symbols = [s.symbol for s in stocks[:100]]
            symbol_map = {s.symbol: s for s in stocks}

            logger.info("[screener] Enriching %d stocks with yfinance fundamentals...", len(top_symbols))
            self._enrich_with_yfinance(top_symbols, symbol_map)

        elapsed = time.time() - start
        logger.info("[screener] Total: %d stocks fetched in %.1fs", len(stocks), elapsed)
        return stocks

    def _enrich_with_yfinance(self, symbols: list[str], symbol_map: dict[str, StockKPI]):
        """Enrich stocks with fundamental data from yfinance (threaded)."""
        import yfinance as yf

        def fetch_fundamentals(sym: str):
            try:
                import time as _time
                ticker = yf.Ticker(f"{sym}.NS")
                info = ticker.info or {}
                stock = symbol_map.get(sym)
                if not stock:
                    return
                _time.sleep(0.3)  # Rate limit

                mcap = info.get("marketCap", 0) or 0
                stock.market_cap = round(mcap / 1e7, 0)  # Crores
                stock.pe_ratio = round(info.get("trailingPE", stock.pe_ratio) or stock.pe_ratio, 1)
                stock.pb_ratio = round(info.get("priceToBook", 0) or 0, 1)
                stock.ev_ebitda = round(info.get("enterpriseToEbitda", 0) or 0, 1)

                # ROE from info, fallback to calculation from statements
                roe = (info.get("returnOnEquity", 0) or 0) * 100
                roce = 0.0
                try:
                    if roe == 0 or True:  # Always try calculating from statements
                        fin = ticker.financials
                        bs = ticker.balance_sheet
                        if fin is not None and not fin.empty and bs is not None and not bs.empty:
                            lf = fin.iloc[:, 0]
                            lb = bs.iloc[:, 0]
                            ni = float(lf.get("Net Income", 0) or 0) if "Net Income" in lf.index else 0
                            ebit = float(lf.get("EBIT", lf.get("Operating Income", 0)) or 0) if ("EBIT" in lf.index or "Operating Income" in lf.index) else 0
                            eq = float(lb.get("Stockholders Equity", 0) or 0) if "Stockholders Equity" in lb.index else 0
                            ta = float(lb.get("Total Assets", 0) or 0) if "Total Assets" in lb.index else 0
                            cl = float(lb.get("Current Liabilities", 0) or 0) if "Current Liabilities" in lb.index else 0
                            ce = ta - cl
                            if eq > 0 and ni != 0:
                                roe = round((ni / eq) * 100, 1)
                            if ce > 0 and ebit != 0:
                                roce = round((ebit / ce) * 100, 1)
                except Exception:
                    pass

                stock.roe = round(roe, 1)
                stock.roce = round(roce, 1)
                stock.profit_margin = round((info.get("profitMargins", 0) or 0) * 100, 1)
                stock.operating_margin = round((info.get("operatingMargins", 0) or 0) * 100, 1)
                stock.revenue_growth = round((info.get("revenueGrowth", 0) or 0) * 100, 1)
                stock.earnings_growth = round((info.get("earningsGrowth", 0) or 0) * 100, 1)
                stock.eps = round(info.get("trailingEps", 0) or 0, 2)
                # Cap dividend yield at 20%
                raw_div = (info.get("dividendYield", 0) or 0) * 100
                stock.dividend_yield = round(min(raw_div, 20.0), 2) if raw_div > 0 else 0.0
                stock.book_value = round(info.get("bookValue", 0) or 0, 2)
                stock.debt_to_equity = round((info.get("debtToEquity", 0) or 0) / 100, 2)
                stock.current_ratio = round(info.get("currentRatio", 0) or 0, 2)
                stock.beta = round(info.get("beta", 0) or 0, 2)
                stock.avg_volume = info.get("averageVolume", 0) or 0
                stock.name = info.get("shortName", stock.name) or stock.name
                stock.sector = info.get("sector", stock.sector) or stock.sector
                stock.industry = info.get("industry", stock.industry) or stock.industry
            except Exception:
                pass  # Keep NSE data if yfinance fails

        # Run threaded — 15 workers, ~15 stocks/sec
        from concurrent.futures import as_completed
        with ThreadPoolExecutor(max_workers=5) as pool:
            futures = {pool.submit(fetch_fundamentals, sym): sym for sym in symbols}
            for f in as_completed(futures, timeout=120):
                try:
                    f.result()
                except Exception:
                    pass

    def _fetch_single_detail(self, symbol: str) -> dict:
        """Fetch comprehensive screener.in-style detail for a single stock."""
        import yfinance as yf
        import math

        def sf(val, default=0):
            """Safe float — handles None, NaN, inf."""
            try:
                if val is None:
                    return default
                v = float(val)
                if math.isnan(v) or math.isinf(v):
                    return default
                return v
            except (TypeError, ValueError):
                return default

        def safe_row_get(row, key, default=0):
            """Safely get a value from a pandas Series."""
            try:
                if key in row.index:
                    return sf(row[key], default)
            except Exception:
                pass
            return default

        nse = f"{symbol}.NS"
        try:
            ticker = yf.Ticker(nse)
            info = ticker.info or {}
        except Exception as e:
            logger.error("[screener] yfinance Ticker failed for %s: %s", symbol, str(e)[:100])
            return {"symbol": symbol, "name": symbol, "error": str(e)[:200], "key_metrics": {}, "quarterly_results": [], "annual_pl": [], "balance_sheet": [], "cashflow": [], "shareholding": {}}

        # ── Key Metrics (Header) ──
        mcap = (info.get("marketCap", 0) or 0) / 1e7
        price = info.get("currentPrice", info.get("regularMarketPrice", 0)) or 0
        prev_close = info.get("previousClose", 0) or 0
        change_pct = ((price - prev_close) / prev_close * 100) if prev_close > 0 else 0
        w52h = info.get("fiftyTwoWeekHigh", 0) or 0
        w52l = info.get("fiftyTwoWeekLow", 0) or 0

        # Calculate ROE & ROCE from financials (more reliable than info dict)
        roe_val = sf(info.get("returnOnEquity")) * 100
        roce_val = 0.0
        try:
            fin = ticker.financials
            bs = ticker.balance_sheet
            if fin is not None and not fin.empty and bs is not None and not bs.empty:
                latest_fin = fin.iloc[:, 0]
                latest_bs = bs.iloc[:, 0]

                net_income = sf(safe_row_get(latest_fin, "Net Income"))
                ebit = sf(safe_row_get(latest_fin, "EBIT")) or sf(safe_row_get(latest_fin, "Operating Income"))
                equity = sf(safe_row_get(latest_bs, "Stockholders Equity")) or sf(safe_row_get(latest_bs, "Total Stockholder Equity"))
                total_assets = sf(safe_row_get(latest_bs, "Total Assets"))
                current_liab = sf(safe_row_get(latest_bs, "Current Liabilities")) or sf(safe_row_get(latest_bs, "Total Current Liabilities"))
                capital_employed = total_assets - current_liab

                # ROE = Net Income / Equity
                if roe_val == 0 and equity > 0 and net_income != 0:
                    roe_val = round((net_income / equity) * 100, 1)

                # ROCE = EBIT / Capital Employed
                if capital_employed > 0 and ebit != 0:
                    roce_val = round((ebit / capital_employed) * 100, 1)
        except Exception as e:
            logger.warning("[screener] ROE/ROCE calc failed for %s: %s", symbol, str(e)[:80])

        # Dividend yield — cap at 20% (yfinance sometimes returns garbage)
        raw_div = sf(info.get("dividendYield")) * 100
        div_yield = round(min(raw_div, 20.0), 2) if raw_div > 0 else 0.0

        key_metrics = {
            "price": round(sf(price), 2),
            "change_pct": round(sf(change_pct), 2),
            "market_cap": round(sf(mcap), 0),
            "pe_ratio": round(sf(info.get("trailingPE")), 1),
            "pb_ratio": round(sf(info.get("priceToBook")), 1),
            "book_value": round(sf(info.get("bookValue")), 2),
            "dividend_yield": div_yield,
            "roce": roce_val,
            "roe": round(roe_val, 1),
            "eps": round(sf(info.get("trailingEps")), 2),
            "face_value": sf(info.get("faceValue")),
            "week_52_high": round(sf(w52h), 2),
            "week_52_low": round(sf(w52l), 2),
            "debt_to_equity": round(sf(info.get("debtToEquity")) / 100, 2) if sf(info.get("debtToEquity")) > 0 else 0,
            "profit_margin": round(sf(info.get("profitMargins")) * 100, 1),
            "operating_margin": round(sf(info.get("operatingMargins")) * 100, 1),
            "revenue_growth": round(sf(info.get("revenueGrowth")) * 100, 1),
            "earnings_growth": round(sf(info.get("earningsGrowth")) * 100, 1),
            "beta": round(sf(info.get("beta")), 2),
        }

        # ── Quarterly Results ──
        quarterly = []
        try:
            qr = ticker.quarterly_financials
            if qr is not None and not qr.empty:
                for col in qr.columns[:8]:
                    row = qr[col]
                    rev = sf(safe_row_get(row, "Total Revenue")) / 1e7
                    op = sf(safe_row_get(row, "Operating Income")) / 1e7
                    ni = sf(safe_row_get(row, "Net Income")) / 1e7
                    opm = (op / rev * 100) if rev > 0 else 0
                    quarterly.append({
                        "period": col.strftime("%b %Y"),
                        "revenue": round(rev, 0),
                        "operating_profit": round(op, 0),
                        "opm_pct": round(opm, 1),
                        "net_profit": round(ni, 0),
                    })
        except Exception as e:
            logger.warning("[screener] quarterly failed for %s: %s", symbol, str(e)[:80])

        # ── Annual P&L (5 years) ──
        annual_pl = []
        try:
            fin = ticker.financials
            if fin is not None and not fin.empty:
                for col in fin.columns[:5]:
                    row = fin[col]
                    rev = sf(safe_row_get(row, "Total Revenue")) / 1e7
                    op = sf(safe_row_get(row, "Operating Income")) / 1e7
                    ni = sf(safe_row_get(row, "Net Income")) / 1e7
                    opm = (op / rev * 100) if rev > 0 else 0
                    annual_pl.append({
                        "year": col.strftime("%b %Y"),
                        "revenue": round(rev, 0),
                        "operating_profit": round(op, 0),
                        "opm_pct": round(opm, 1),
                        "net_profit": round(ni, 0),
                    })
        except Exception as e:
            logger.warning("[screener] annual P&L failed for %s: %s", symbol, str(e)[:80])

        # ── Balance Sheet (5 years) ──
        balance_sheet = []
        try:
            bs = ticker.balance_sheet
            if bs is not None and not bs.empty:
                for col in bs.columns[:5]:
                    row = bs[col]
                    balance_sheet.append({
                        "year": col.strftime("%b %Y"),
                        "total_assets": round(sf(safe_row_get(row, "Total Assets")) / 1e7, 0),
                        "total_debt": round(sf(safe_row_get(row, "Total Debt")) / 1e7, 0),
                        "equity": round(sf(safe_row_get(row, "Stockholders Equity")) / 1e7, 0),
                        "cash": round(sf(safe_row_get(row, "Cash And Cash Equivalents")) / 1e7, 0),
                    })
        except Exception as e:
            logger.warning("[screener] balance sheet failed for %s: %s", symbol, str(e)[:80])

        # ── Cash Flow (5 years) ──
        cashflow = []
        try:
            cf = ticker.cashflow
            if cf is not None and not cf.empty:
                for col in cf.columns[:5]:
                    row = cf[col]
                    cfo = safe_row_get(row, "Operating Cash Flow") or safe_row_get(row, "Total Cash From Operating Activities")
                    cfi = safe_row_get(row, "Investing Cash Flow") or safe_row_get(row, "Total Cashflows From Investing Activities")
                    cff = safe_row_get(row, "Financing Cash Flow") or safe_row_get(row, "Total Cash From Financing Activities")
                    cashflow.append({
                        "year": col.strftime("%b %Y"),
                        "cfo": round(sf(cfo) / 1e7, 0),
                        "cfi": round(sf(cfi) / 1e7, 0),
                        "cff": round(sf(cff) / 1e7, 0),
                    })
        except Exception as e:
            logger.warning("[screener] cashflow failed for %s: %s", symbol, str(e)[:80])

        # ── Shareholding ──
        shareholding = {}
        try:
            shareholding = {
                "promoters": round((info.get("heldPercentInsiders", 0) or 0) * 100, 1),
                "institutions": round((info.get("heldPercentInstitutions", 0) or 0) * 100, 1),
            }
            shareholding["public"] = round(100 - shareholding["promoters"] - shareholding["institutions"], 1)
        except Exception:
            pass

        return {
            "symbol": symbol,
            "name": info.get("shortName", info.get("longName", symbol)) or symbol,
            "sector": info.get("sector", "") or "",
            "industry": info.get("industry", "") or "",
            "description": (info.get("longBusinessSummary", "") or "")[:600],
            "website": info.get("website", "") or "",
            "key_metrics": key_metrics,
            "quarterly_results": quarterly,
            "annual_pl": annual_pl,
            "balance_sheet": balance_sheet,
            "cashflow": cashflow,
            "shareholding": shareholding,
            "analyst_target": info.get("targetMeanPrice", 0) or 0,
            "analyst_count": info.get("numberOfAnalystOpinions", 0) or 0,
            "recommendation": info.get("recommendationKey", "") or "",
        }

    def _apply_filters(self, stocks: list[StockKPI], filters: dict) -> list[StockKPI]:
        filtered = []
        for s in stocks:
            match = True
            for key, condition in filters.items():
                val = getattr(s, key, None)
                if val is None:
                    match = False
                    break
                if "min" in condition and val < condition["min"]:
                    match = False
                    break
                if "max" in condition and val > condition["max"]:
                    match = False
                    break
            if match:
                filtered.append(s)
        return filtered


_instance: Optional[ScreenerService] = None


def get_screener() -> ScreenerService:
    global _instance
    if _instance is None:
        _instance = ScreenerService()
    return _instance
