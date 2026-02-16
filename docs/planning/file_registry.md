# File Registry — All Sprints (1-4)

This document records every file created or updated across all sprints.

## 📂 Backend Core (`backend/app/`)

| File | Sprint | Purpose |
|---|---|---|
| `__init__.py` | 1 | Package init — `__version__ = "1.0.0"` |
| `config.py` | 1 | **Only** env var reader. Pydantic Settings → `settings` singleton. Crashes if `.env` invalid |
| `constants.py` | 1+4 | 15 Enums (zero magic strings). Sprint 4 added `StrategyType`, `BacktestStatus` |
| `exceptions.py` | 1+3 | 11 custom exceptions → HTTP codes. Sprint 3 added `ServiceUnavailableError` |
| `logging_config.py` | 1 | 4 handlers: console, `app.log`, `errors.log`, `trades.log` |
| `database.py` | 1 | Async PostgreSQL — SQLAlchemy 2.0, pool(10+20), `get_db()` |
| `middleware.py` | 1 | CORS + SlowAPI rate limit + request ID + timing + error handler |
| `dependencies.py` | 1 | DI container — cached vault singleton, DB session |
| `main.py` | 1-4 | Entry point — wires 7 routers, lifespan (startup/shutdown) |

## 🔒 Security (`backend/app/security/`)

| File | Sprint | Purpose |
|---|---|---|
| `vault.py` | 1 | Fernet AES-256 encrypt/decrypt for broker credentials |
| `auth.py` | 1 | JWT (HS256, 60min) + bcrypt. `get_current_user()` dependency |

## 🗄️ Models (`backend/app/models/`)

| File | Sprint | Purpose |
|---|---|---|
| `base.py` | 1 | Abstract parent → auto `id`, `created_at`, `updated_at` |
| `trade.py` | 1 | Trade table — symbol, side, qty, price, status, pnl, broker |
| `watchlist.py` | 1 | Watchlist table — JSONB items |
| `instrument.py` | 1 | Instrument table — NSE/BSE symbol tokens |
| `audit.py` | 1 | AuditLog — append-only action log |
| `schemas.py` | 1-4 | 32 Pydantic schemas (Sprint 3: +9 AI, Sprint 4: +5 backtest) |

## 🌐 Routers (`backend/app/routers/`)

| File | Sprint | Endpoints | Purpose |
|---|---|---|---|
| `health.py` | 1 | 1 | `GET /api/health` — DB check |
| `auth.py` | 1 | 2 | Login (JSON + OAuth2) → JWT |
| `trades.py` | 1 | 5 | CRUD for trades |
| `watchlists.py` | 1 | 5 | CRUD for watchlists |
| `broker.py` | 2 | 13 | Connect, orders, positions, risk, kill switch |
| `ai.py` | 3 | 5 | Analyze, predict, news, picks, analytics |
| `backtest.py` | 4 | 3 | Strategies list, run backtest, optimize |

## ⚙️ Services — Broker (`backend/app/services/`)

| File | Sprint | Class | Purpose |
|---|---|---|---|
| `broker_interface.py` | 2 | `BrokerInterface` (ABC) | 10 abstract methods |
| `angel_broker.py` | 2 | `AngelOneBroker` | SmartAPI + TOTP auth |
| `zerodha_broker.py` | 2 | `ZerodhaBroker` | KiteConnect SDK |
| `paper_trader.py` | 2 | `PaperTrader` | Virtual ₹1L capital |
| `broker_factory.py` | 2 | — | `create_broker()` factory |
| `risk_manager.py` | 2 | `RiskManager` | 6 pre-trade checks + kill switch |

## 🧠 Services — AI & Analysis (`backend/app/services/`)

| File | Sprint | Class | Purpose |
|---|---|---|---|
| `technical.py` | 3 | `TechnicalAnalyzer` | 15+ indicators via pandas-ta |
| `ai_engine.py` | 3 | `AIEngine` | LangChain + Gemini AI analysis |
| `tavily_search.py` | 3 | `TavilySearchService` | Real-time market news |
| `stock_picker.py` | 3 | `StockPicker` | 10-layer scoring → stock picks |
| `analytics.py` | 3 | `PerformanceAnalytics` | Sharpe, drawdown, win rate |

## 📈 Services — Backtesting (`backend/app/services/`)

| File | Sprint | Class | Purpose |
|---|---|---|---|
| `data_provider.py` | 4 | `DataProvider` | Angel → yfinance → demo. 30min cache |
| `backtest_engine.py` | 4 | `BacktestEngine` | 0.2% costs, HTML charts, optimization |

## 📊 Strategies (`backend/app/strategies/`)

| File | Sprint | Strategy | Win Rate |
|---|---|---|---|
| `__init__.py` | 4 | Lazy registry | — |
| `base.py` | 4 | `StrategyBase` — metadata + optimization | — |
| `supertrend_rsi.py` | 4 | Supertrend + RSI filter | 55-60% |
| `vwap_orb.py` | 4 | VWAP ORB breakout | 60-70% |
| `ema_adx.py` | 4 | EMA 9/21 + ADX filter | 55-60% |
| `rsi_macd.py` | 4 | RSI + MACD confirm | 65-73% |
| `vcp_breakout.py` | 4 | VCP Minervini method | 55-65% |
| `volume_breakout.py` | 4 | Volume spike breakout | 52-58% |

## 🛠️ Scripts (`backend/scripts/`)

| File | Sprint | Purpose |
|---|---|---|
| `scan_hardcoded_secrets.py` | 1 | Pre-commit scanner — 11 regex patterns |
| `verify_health.py` | 1 | Quick health check |
| `quick_check.py` | 1 | 44-point end-to-end test |
| `final_check.py` | 1 | Self-contained 314-line test (starts own server) |
| `test_sprint2.py` | 2 | Sprint 2 broker integration tests |
| `test_sprint2_live.py` | 2 | Sprint 2 live broker tests |
| `test_sprint3.py` | 3 | 42-point AI engine test |
| `test_tavily.py` | 3 | Tavily API key verification |
| `verify_sprint4.py` | 4 | 6-step backtest verification |

## ⚙️ Config (`backend/`)

| File | Purpose |
|---|---|
| `.env` | Secrets — **NEVER in git** |
| `.env.example` | Template (in git) |
| `requirements.txt` | All Python deps (47 packages) |
| `run.py` | Uvicorn starter — port 8000 |
| `start_server.bat` | Windows batch to start server |
