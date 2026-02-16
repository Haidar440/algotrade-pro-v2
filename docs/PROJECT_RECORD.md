# AlgoTrade Pro — Project Record

> **Last Updated:** 2026-02-15
> **Purpose:** Complete record of every file in the project — what it does, why it exists, and what changed.
> **Rule:** Every time a file is created, updated, or deleted — this document MUST be updated.

---

## Table of Contents

1. [Project Structure](#project-structure)
2. [Sprint 1 Files — Foundation](#sprint-1--foundation-24-files)
3. [Sprint 2 Files — Broker Integration](#sprint-2--broker-integration-8-files)
4. [Sprint 3 Files — AI & Analysis Engine](#sprint-3--ai--analysis-engine-7-files)
5. [Frontend Files — React (Pre-existing)](#frontend-files--react-pre-existing)
6. [Documentation & Config Files](#documentation--config-files)
7. [Legacy Files — Pending Cleanup](#legacy-files--pending-cleanup)
8. [Changelog](#changelog)

---

## Project Structure

```
algotrade-pro/
├── .github/
│   └── copilot-instructions.md          # Auto-loaded by Copilot in every conversation
├── backend/
│   ├── app/
│   │   ├── __init__.py                  # Package init — app name + version
│   │   ├── main.py                      # FastAPI entry point — wires everything
│   │   ├── config.py                    # ONLY env var reader (Pydantic Settings)
│   │   ├── constants.py                 # 13 Enums — zero magic strings
│   │   ├── exceptions.py               # 10 custom exceptions with HTTP codes
│   │   ├── logging_config.py           # 4 log handlers (console, app, error, trade)
│   │   ├── database.py                 # Async PostgreSQL engine + session
│   │   ├── middleware.py               # CORS, request ID, error handler, timing
│   │   ├── dependencies.py            # DI container (vault, db session)
│   │   ├── models/
│   │   │   ├── __init__.py             # Package init
│   │   │   ├── base.py                 # Abstract ORM base (id, created_at, updated_at)
│   │   │   ├── trade.py                # Trade ORM model (12 columns)
│   │   │   ├── watchlist.py            # Watchlist ORM model (JSONB items)
│   │   │   ├── instrument.py           # Instrument ORM model (NSE/BSE tokens)
│   │   │   ├── audit.py                # AuditLog ORM model (append-only)
│   │   │   └── schemas.py             # 27 Pydantic request/response schemas
│   │   ├── routers/
│   │   │   ├── __init__.py             # Package init
│   │   │   ├── health.py               # GET /api/health (no auth)
│   │   │   ├── auth.py                 # POST /api/auth/login + /api/auth/token
│   │   │   ├── trades.py               # CRUD — 5 endpoints for trades
│   │   │   ├── watchlists.py           # CRUD — 5 endpoints for watchlists
│   │   │   ├── broker.py              # 13 endpoints for broker operations
│   │   │   └── ai.py                  # 5 endpoints for AI analysis
│   │   ├── security/
│   │   │   ├── __init__.py             # Package init
│   │   │   ├── auth.py                 # JWT create/decode + password hash/verify
│   │   │   └── vault.py               # Fernet AES-256 encrypt/decrypt
│   │   └── services/
│   │       ├── __init__.py             # Package init
│   │       ├── broker_interface.py     # ABC + 4 dataclasses
│   │       ├── angel_broker.py         # Angel One SmartAPI integration
│   │       ├── zerodha_broker.py       # Zerodha KiteConnect integration
│   │       ├── paper_trader.py         # Virtual trading engine
│   │       ├── risk_manager.py         # 6 pre-trade safety checks
│   │       ├── broker_factory.py       # create_broker() factory
│   │       ├── technical.py            # Technical analysis (pandas-ta)
│   │       ├── ai_engine.py            # LangChain + Gemini AI analysis
│   │       ├── tavily_search.py        # Tavily real-time news search
│   │       ├── stock_picker.py         # Smart stock scanner + scoring
│   │       └── analytics.py            # Performance metrics (Sharpe, etc.)
│   ├── scripts/
│   │   ├── scan_hardcoded_secrets.py   # Pre-commit secret scanner
│   │   ├── verify_health.py            # Quick health check
│   │   ├── quick_check.py             # 44-point end-to-end test
│   │   ├── final_check.py             # Self-contained 314-line test (starts own server on 8001)
│   │   ├── test_sprint3.py            # 42-point Sprint 3 AI test
│   │   └── test_tavily.py             # Tavily API key verification test
│   ├── start_server.bat                # Batch file to start Uvicorn
│   ├── .env                            # Secrets (NOT in git)
│   ├── .env.example                    # Template (in git)
│   ├── requirements.txt
│   └── run.py                          # Uvicorn runner
├── docs/
│   ├── PROJECT_RECORD.md               # THIS FILE — master project record
│   ├── AGENT_CONTEXT.md                 # Transferable context for AI agents
│   ├── CODE_GUIDE.md                    # Beginner "How it works" guide
│   └── planning/
│       ├── implementation_plan.md       # 6-sprint implementation plan
│       ├── task_checklist.md            # Sprint task checklist
│       ├── file_registry.md            # Original Antigravity file registry
│       ├── cleanup_audit.md            # Cleanup audit from Antigravity
│       └── walkthrough.md             # Architecture walkthrough
├── components/                          # React components (20 files)
├── services/                            # React services (8 files)
├── App.tsx                              # React app root
├── index.tsx                            # React entry point
├── index.html                           # HTML shell
├── package.json                         # Frontend dependencies
├── tsconfig.json                        # TypeScript config
└── vite.config.ts                       # Vite bundler config
```

---

## Sprint 1 — Foundation (24 files)

> **Status:** ✅ COMPLETE
> **Built in:** Antigravity IDE (Gemini + Claude), then fixed in VS Code

### Core Application

| #   | File                    | Purpose                | What It Does                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ----------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `app/__init__.py`       | Package identity       | Defines `__version__ = "1.0.0"` and `__app_name__ = "AlgoTrade Pro"`. Every module imports these for consistent naming.                                                                                                                                                                                                                                                                                                               |
| 2   | `app/main.py`           | Application assembly   | The ONLY file that wires everything together. Creates the FastAPI instance, registers middleware (CORS, error handlers), includes all routers (health, auth, trades, watchlists, broker), and manages the database lifecycle (init on startup, close on shutdown) via an async context manager.                                                                                                                                       |
| 3   | `app/config.py`         | Configuration reader   | The ONLY place in the entire app that reads environment variables. Uses Pydantic `BaseSettings` to load from `.env` with validation. Has 4 mandatory fields (DATABASE_URL, JWT_SECRET_KEY, MASTER_ENCRYPTION_KEY, GEMINI_API_KEY), optional broker/AI/telegram fields, and risk management limits. Validators block placeholder values. Crashes at import time if `.env` is missing or invalid — fail fast.                           |
| 4   | `app/constants.py`      | Enum definitions       | Defines 13 string Enums that eliminate ALL magic strings: `TradeStatus`, `TradeType`, `TradeSource`, `OrderSide`, `OrderType`, `Exchange`, `CandleInterval`, `MarketCondition`, `BrokerName`, `Signal`, `PickerRating`, `AuditAction`, `AuditCategory`. Every place in the code uses these instead of raw strings.                                                                                                                    |
| 5   | `app/exceptions.py`     | Custom error hierarchy | Defines 10 exception classes all inheriting from `AlgoTradeError`. Each maps to a specific HTTP status code: `UnauthorizedError` (401), `ForbiddenError` (403), `NotFoundError` (404), `ConflictError` (409), `ValidationError` (422), `RiskCheckFailedError` (400), `KillSwitchActiveError` (503), `BrokerConnectionError` (502), `BrokerNotConfiguredError` (503). The global middleware catches these and returns structured JSON. |
| 6   | `app/logging_config.py` | Log setup              | Configures 4 log handlers called once at startup: (1) Console — clean formatted output, (2) app.log — full debug, rotates at 10MB, keeps 5 files, (3) errors.log — ERROR+ only, rotates at 5MB, (4) trades.log — trade events only, rotates daily, keeps 30 days. All modules use `logging.getLogger(__name__)`.                                                                                                                      |
| 7   | `app/database.py`       | Database layer         | Creates async SQLAlchemy 2.0 engine with asyncpg driver. Configures connection pool (10 connections, 20 overflow, 5min recycle, pre-ping). Provides `get_db()` dependency that yields an `AsyncSession` per request with auto-commit/rollback. Also defines `Base(DeclarativeBase)` for ORM models, and `init_db()`/`close_db()` lifecycle functions.                                                                                 |
| 8   | `app/middleware.py`     | Request pipeline       | Registers CORS (configured origins from settings), SlowAPI rate limiter, and two handlers. The HTTP middleware adds a unique `X-Request-ID` header and `X-Response-Time` timing to every response. Exception handlers catch `AlgoTradeError` (returns structured JSON), `RateLimitExceeded` (429), and a catch-all `Exception` handler that logs the real error but returns a generic message to the client.                          |
| 9   | `app/dependencies.py`   | DI container           | Provides cached singletons via `@lru_cache`: `get_vault()` returns a `CredentialVault` initialized with the master encryption key. Re-exports `get_db` and `get_current_user` for convenient import in routers.                                                                                                                                                                                                                       |

### ORM Models

| #   | File                       | Purpose             | What It Does                                                                                                                                                                                                                                                                                                      |
| --- | -------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10  | `app/models/__init__.py`   | Package init        | Empty — allows `from app.models import ...`.                                                                                                                                                                                                                                                                      |
| 11  | `app/models/base.py`       | Abstract base model | Defines `BaseModel(Base)` with `__abstract__ = True`. Provides 3 auto-generated columns every model inherits: `id` (auto-increment BigInt primary key), `created_at` (UTC timestamp, set on insert), `updated_at` (UTC timestamp, set on every update). Uses SQLAlchemy 2.0 `Mapped[]` + `mapped_column()` style. |
| 12  | `app/models/trade.py`      | Trade model         | ORM model for the `trades` table. 12 columns: `symbol`, `entry_price`, `quantity`, `type` (SWING/INTRADAY), `status` (OPEN/CLOSED), `entry_date`, `exit_date`, `exit_price`, `pnl`, `strategy`, `notes`, `source` (MANUAL/AUTO/PAPER). Inherits id/timestamps from BaseModel.                                     |
| 13  | `app/models/watchlist.py`  | Watchlist model     | ORM model for the `watchlists` table. Uses a JSONB column for `items` to store flexible stock lists. Fields: `name` (unique), `items` (JSONB array of stock objects).                                                                                                                                             |
| 14  | `app/models/instrument.py` | Instrument model    | ORM model for the `instruments` table. Stores NSE/BSE instrument master data: `token`, `symbol`, `name`, `exch_seg`, `instrumenttype`, `tick_size`. Used for symbol → token mapping when placing broker orders.                                                                                                   |
| 15  | `app/models/audit.py`      | Audit log model     | ORM model for the `audit_logs` table. Append-only security log: `action` (from AuditAction enum), `category` (from AuditCategory enum), `details` (JSONB), `user_id`, `ip_address`. Every sensitive action (login, order, kill switch) gets recorded.                                                             |

### Pydantic Schemas

| #   | File                    | Purpose                  | What It Does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ----------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 16  | `app/models/schemas.py` | Request/Response schemas | Defines 18 Pydantic models for API validation: **Generic:** `ApiResponse[T]` (wraps all responses), `ApiErrorResponse`. **Auth:** `LoginRequest`, `TokenResponse`. **Trades:** `TradeCreate`, `TradeUpdate`, `TradeResponse`. **Watchlists:** `WatchlistCreate`, `WatchlistResponse`. **Instruments:** `InstrumentResponse`. **Health:** `HealthResponse`. **Broker (Sprint 2):** `BrokerConnectRequest`, `OrderCreateRequest`, `OrderResponseSchema`, `PositionSchema`, `HoldingSchema`, `PaperTradingSummary`, `RiskStatusSchema`. |

### API Routers

| #   | File                        | Purpose        | What It Does                                                                                                                                                                                                                                                                                                           |
| --- | --------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 17  | `app/routers/__init__.py`   | Package init   | Empty.                                                                                                                                                                                                                                                                                                                 |
| 18  | `app/routers/health.py`     | Health check   | `GET /api/health` — No auth required. Pings the database to verify connectivity, returns status, version, environment, and DB state. Used by monitoring systems.                                                                                                                                                       |
| 19  | `app/routers/auth.py`       | Authentication | Two endpoints: (1) `POST /api/auth/login` — accepts JSON `{username, password}`, validates against in-memory user store, returns JWT. Rate limited at 5/min. (2) `POST /api/auth/token` — same logic but accepts OAuth2 form data (for Swagger UI "Authorize" button). Temporary in-memory users: `admin / admin1234`. |
| 20  | `app/routers/trades.py`     | Trade CRUD     | 5 endpoints, all JWT-protected: `POST /api/trades` (create), `GET /api/trades` (list with pagination), `GET /api/trades/{id}` (get one), `PUT /api/trades/{id}` (update), `DELETE /api/trades/{id}` (delete). All use async DB sessions.                                                                               |
| 21  | `app/routers/watchlists.py` | Watchlist CRUD | 5 endpoints, all JWT-protected: `GET /api/watchlists` (list all), `GET /api/watchlists/names` (list names only), `GET /api/watchlists/{id}` (get one), `POST /api/watchlists` (create/upsert), `DELETE /api/watchlists/{id}` (delete).                                                                                 |

### Security

| #   | File                       | Purpose               | What It Does                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | -------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 22  | `app/security/__init__.py` | Package init          | Empty.                                                                                                                                                                                                                                                                                                                                                                                                  |
| 23  | `app/security/auth.py`     | JWT + password        | 5 functions: `hash_password()` — bcrypt hash. `verify_password()` — bcrypt verify. `create_access_token()` — creates HS256 JWT with sub/iat/exp claims. `decode_access_token()` — validates and decodes JWT. `get_current_user()` — FastAPI dependency that extracts user from `Authorization: Bearer <token>` header. Uses `OAuth2PasswordBearer(tokenUrl="/api/auth/token")` for Swagger integration. |
| 24  | `app/security/vault.py`    | Credential encryption | `CredentialVault` class using Fernet (AES-256-CBC). Two methods: `encrypt(data: dict) → str` — serializes dict to JSON, encrypts, returns base64 token. `decrypt(token: str) → dict` — reverses the process. Used to store broker credentials safely in the database. Master key comes from settings.                                                                                                   |

### Support Files

| #   | File                                | Purpose          | What It Does                                                                                                                                                                                                                                                                                                                                                   |
| --- | ----------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 25  | `run.py`                            | Server runner    | Starts Uvicorn with the FastAPI app. Configures host (0.0.0.0), port (8000), reload mode (watches `backend/app/` directory only), and log level. The `reload_dirs` uses absolute path from `__file__` to prevent file watcher from monitoring the entire workspace.                                                                                            |
| 26  | `requirements.txt`                  | Dependencies     | Lists all Python packages with versions. Core: fastapi, uvicorn, pydantic, pydantic-settings, python-dotenv. DB: asyncpg, sqlalchemy, alembic, psycopg2-binary. Auth: python-jose, passlib, cryptography, slowapi, python-multipart. Broker: smartapi-python, kiteconnect, pyotp, logzero, websocket-client. Data: pandas, numpy. Logging: python-json-logger. |
| 27  | `.env.example`                      | Config template  | Template with all environment variable names but NO values. Committed to git so new developers know which variables to set.                                                                                                                                                                                                                                    |
| 28  | `scripts/scan_hardcoded_secrets.py` | Security scanner | Pre-commit script that scans all `.py` files for hardcoded secrets using 11 regex patterns (API keys, passwords, tokens, connection strings). Exits with code 1 if any found.                                                                                                                                                                                  |
| 29  | `scripts/verify_health.py`          | Health verifier  | Quick script that hits `GET /api/health` and reports the response. Used for post-deployment verification.                                                                                                                                                                                                                                                      |

---

## Sprint 2 — Broker Integration (8 files)

> **Status:** ✅ COMPLETE
> **Built in:** VS Code (GitHub Copilot)
> **Tested:** Import test (10/10), Live endpoint test (full paper trading flow verified)

| #   | File                               | Purpose                | What It Does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ---------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `app/services/__init__.py`         | Package init           | Empty — allows `from app.services import ...`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2   | `app/services/broker_interface.py` | Abstract base class    | Defines the contract ALL brokers must follow. Contains 4 dataclasses: `OrderRequest` (symbol, exchange, side, type, qty, price), `OrderResponse` (order_id, status, message), `Position` (symbol, qty, avg_price, pnl), `Holding` (symbol, qty, avg_price, ltp). The `BrokerInterface` ABC defines 10 abstract methods: `connect()`, `disconnect()`, `place_order()`, `cancel_order()`, `get_positions()`, `get_holdings()`, `get_order_book()`, `get_ltp()`, `get_historical_data()`, plus properties `broker_name` and `is_connected`.                                                                                       |
| 3   | `app/services/angel_broker.py`     | Angel One integration  | `AngelOneBroker(BrokerInterface)` — connects to Angel One via `smartapi-python`. `connect()` authenticates using API key, client ID, password, and TOTP (pyotp). Maps our Enums to Angel's exchange/order codes. Implements all 10 interface methods. Credentials come from settings (never hardcoded).                                                                                                                                                                                                                                                                                                                        |
| 4   | `app/services/zerodha_broker.py`   | Zerodha integration    | `ZerodhaBroker(BrokerInterface)` — connects to Zerodha via `kiteconnect`. `connect()` generates a login URL, accepts request_token for session creation. Maps our Enums to Kite's exchange/order/product constants. Implements all 10 interface methods.                                                                                                                                                                                                                                                                                                                                                                       |
| 5   | `app/services/paper_trader.py`     | Virtual trading engine | `PaperTrader(BrokerInterface)` — simulated broker that NEVER touches real APIs. Starts with ₹1,00,000 virtual capital. **Hard wall:** `_real_broker` attribute is ALWAYS `None`, asserted before every order. Tracks positions, trade history, P&L, portfolio value. `get_summary()` returns starting capital, current capital, total P&L, P&L %, open positions count, total trades. `reset()` restores to initial state. Buy orders deduct cash and create/update positions. Sell orders add cash, calculate realized P&L, and remove closed positions.                                                                      |
| 6   | `app/services/risk_manager.py`     | Pre-trade safety       | `RiskManager` — runs 6 checks BEFORE every order: (1) **Kill switch** — if active, blocks ALL orders (503). (2) **Order value** — rejects orders exceeding MAX_ORDER_VALUE (₹1,00,000). (3) **Daily loss** — blocks trading if daily P&L exceeds MAX_DAILY_LOSS (₹5,000). (4) **Max positions** — limits concurrent open positions to MAX_POSITIONS (10). (5) **Concentration** — rejects if single order > MAX_POSITION_SIZE_PERCENT (20%) of portfolio. (6) **Market hours** — warns outside 9:15-15:30 IST. All limits from `config.py` settings. `activate_kill_switch()` / `deactivate_kill_switch()` for emergency stop. |
| 7   | `app/services/broker_factory.py`   | Factory pattern        | Single function `create_broker(broker_name: BrokerName) → BrokerInterface`. Takes a `BrokerName` enum (ANGEL, ZERODHA, PAPER) and returns the correct broker instance. Uses lazy imports to avoid loading unused broker SDKs. Raises `BrokerNotConfiguredError` for unknown broker names.                                                                                                                                                                                                                                                                                                                                      |
| 8   | `app/routers/broker.py`            | Broker API             | 13 JWT-protected endpoints: `POST /connect` (create broker + connect), `POST /disconnect`, `GET /status` (broker name + connected state), `POST /order` (place order with risk check), `DELETE /order/{id}` (cancel), `GET /positions`, `GET /holdings`, `GET /orders` (order book), `GET /paper/summary`, `POST /paper/reset`, `GET /risk/status`, `POST /risk/kill-switch/activate`, `POST /risk/kill-switch/deactivate`. The order endpoint runs risk validation BEFORE submitting to broker. Stores active broker + risk manager as module-level state.                                                                    |

### Sprint 2 Test Scripts

| #   | File                           | Purpose            | What It Does                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9   | `scripts/test_sprint2.py`      | Import test        | Tests all Sprint 2 modules can be imported without errors. Validates 10 things: broker_interface classes, angel_broker, zerodha_broker, paper_trader, risk_manager, broker_factory, schemas, router endpoints, PaperTrader functionality (capital, P&L, hard wall), RiskManager functionality (kill switch, limits). |
| 10  | `scripts/test_sprint2_live.py` | Live endpoint test | Tests actual HTTP endpoints against a running server. Full flow: health → login → connect paper → status → summary → buy order → positions → risk status → sell order → final P&L → disconnect.                                                                                                                      |

---

## Sprint 3 — AI & Analysis Engine (7 files)

> **Status:** ✅ COMPLETE
> **Built in:** VS Code (GitHub Copilot)
> **Test:** 42/42 checks passed (technical analysis, AI prediction, news, picks, analytics)

| #   | File                            | Role                | Details                                                                                                                                                                                                                                                                         |
| --- | ------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `app/services/technical.py`     | Technical analysis  | `TechnicalAnalyzer` class using pandas-ta. Calculates 15+ indicators: RSI, MACD, EMA (9/21/50/200), ADX, Supertrend, Bollinger Bands, ATR, MFI, OBV, Volume ratio. Interprets signals and generates composite BUY/SELL score (0-100). Support/resistance via pivot points.      |
| 2   | `app/services/ai_engine.py`     | AI analysis engine  | `AIEngine` class using LangChain + Gemini 2.0 Flash. Builds analysis chain: stock data + indicators → AI reasoning → BUY/SELL/HOLD recommendation with confidence, target, SL, reasoning. Includes sentiment analysis. Sanitizes all AI output. Graceful fallback on failure.   |
| 3   | `app/services/tavily_search.py` | News search service | `TavilySearchService` for real-time market intelligence. Searches stock news, sector news, market overview. Gracefully disabled if TAVILY_API_KEY not set. Results combined for AI sentiment analysis.                                                                          |
| 4   | `app/services/stock_picker.py`  | Stock scanner       | `StockPicker` with 10-layer scoring algorithm (100 pts). Technical (40), Volume (20), Strength (15), Fundamentals (15), News (10). Scores → rates (GOLDEN/STRONG/MODERATE/SKIP) → capital-aware position sizing with entry/SL/target. Placeholders for NSE bhavcopy + yfinance. |
| 5   | `app/services/analytics.py`     | Performance metrics | `PerformanceAnalytics` calculator: Sharpe ratio (annualized, Indian T-Bill rate), max drawdown, win rate, profit factor, risk-reward ratio, expectancy, best/worst streaks, avg holding days. Works with TradeRecord objects or plain dicts.                                    |
| 6   | `app/routers/ai.py`             | AI API endpoints    | 5 endpoints: `GET /api/ai/analyze/{symbol}` (technical), `GET /api/ai/predict/{symbol}` (AI), `GET /api/ai/news/{symbol}` (news), `GET /api/ai/picks` (stock picks), `GET /api/ai/analytics` (performance). All JWT-protected. Demo data generator for testing.                 |
| 7   | `scripts/test_sprint3.py`       | Sprint 3 test       | 42-point test: health, auth, technical indicators, AI prediction, news search, stock picks (scoring/rating/SL/target), analytics (Sharpe/drawdown/win rate), auth rejection, all 6 module imports.                                                                              |
| 8   | `scripts/test_tavily.py`        | Tavily API test     | Verifies Tavily API key is working — logs in via JSON, fetches `/api/ai/news/RELIANCE`, checks real news articles returned. Confirmed 5 articles fetched successfully.                                                                                                          |

### Sprint 3 — Updated Files

| File                    | Changes                                                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app/main.py`           | Imported and wired `ai.router` — `app.include_router(ai.router)`                                                                                                                                                                                 |
| `app/models/schemas.py` | Added 9 new Pydantic schemas: `TechnicalIndicatorsSchema`, `TechnicalSignalsSchema`, `TechnicalAnalysisSchema`, `AIAnalysisSchema`, `StockPickSchema`, `StockPicksResponse`, `NewsArticleSchema`, `NewsSearchSchema`, `PerformanceMetricsSchema` |
| `app/exceptions.py`     | Added `ServiceUnavailableError` (HTTP 503) for unavailable external services                                                                                                                                                                     |
| `requirements.txt`      | Added: `langchain>=0.3.0`, `langchain-google-genai>=2.0.0`, `langchain-community>=0.3.0`, `tavily-python>=0.5.0`, `pandas-ta>=0.3.14`                                                                                                            |

---

## Sprint 4 — Backtesting Engine & 6 Strategies (10 new files)

> **Status:** ✅ COMPLETE
> **Built in:** VS Code (Antigravity IDE)
> **Test:** All 6 strategies pass on real RELIANCE.NS data via yfinance

| #   | File                                    | Role                    | Details                                                                                                                                                                                                       |
| --- | --------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `app/services/data_provider.py`         | Multi-tier data         | `DataProvider` class: Angel One → yfinance → demo data fallback. In-memory cache (30min TTL). Timezone-naive output for backtesting.py. Realistic GBM-based demo data generator for 15 NSE stocks.            |
| 2   | `app/services/backtest_engine.py`       | Backtest engine         | `BacktestEngine` wrapping backtesting.py. 0.2% commission (brokerage + STT + slippage). Interactive HTML chart generation (base64). Strategy optimization (200 combos). `_safe_get()` for pandas Series stats. |
| 3   | `app/strategies/__init__.py`            | Strategy registry       | Lazy-loading `STRATEGY_REGISTRY`. Functions: `get_strategy()`, `list_strategies()`. Auto-imports all 6 strategy modules.                                                                                       |
| 4   | `app/strategies/base.py`               | Strategy base class     | `StrategyBase` extending `backtesting.Strategy`. Metadata attrs: name, description, strategy_type, default_params, expected_win_rate. `get_info()` and `get_optimization_ranges()` class methods.              |
| 5   | `app/strategies/supertrend_rsi.py`     | Supertrend + RSI        | Custom Supertrend calculation via pandas-ta ATR. RSI > 50 filter on buy, RSI < 50 filter on sell. Expected win rate: 55-60%.                                                                                  |
| 6   | `app/strategies/vwap_orb.py`           | VWAP ORB (Intraday)     | EMA-based VWAP proxy, 20-period rolling range, volume-confirmed breakouts with SL/TP. Expected win rate: 60-70%.                                                                                              |
| 7   | `app/strategies/ema_adx.py`            | EMA 9/21 + ADX          | EMA crossover with ADX > 25 trend filter. Eliminates false signals in sideways markets. Expected win rate: 55-60%.                                                                                             |
| 8   | `app/strategies/rsi_macd.py`           | RSI + MACD Confirmation | RSI mean reversion (< 35 oversold / > 65 overbought) confirmed by MACD histogram direction. Highest expected win rate: 65-73%.                                                                                |
| 9   | `app/strategies/vcp_breakout.py`       | VCP Minervini           | Volatility Contraction Pattern with Minervini Trend Template (price > 150 & 200 SMA). Volume spike on breakout. 3:1 R:R. Expected win rate: 55-65%.                                                           |
| 10  | `app/strategies/volume_breakout.py`    | Volume Breakout         | 2× average volume spike with price breakout above 20-day high. Institutional buying signal. Expected win rate: 52-58%.                                                                                         |

### Sprint 4 — Updated Files

| File                    | Changes                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `requirements.txt`      | Added `Backtesting>=0.3.3`, `yfinance>=0.2.31`                                                           |
| `app/constants.py`      | Added `StrategyType` (SWING/INTRADAY/BOTH), `BacktestStatus` (COMPLETED/FAILED) enums                   |
| `app/models/schemas.py` | Added 5 schemas: `BacktestRequest`, `BacktestResult`, `StrategyInfo`, `OptimizeRequest`, `OptimizeResult` |
| `app/main.py`           | Imported and wired `backtest.router` — `app.include_router(backtest.router)`                              |

### Sprint 4 — API Endpoints (3 new)

| Method | Endpoint                    | Auth | Purpose                                      |
| ------ | --------------------------- | ---- | -------------------------------------------- |
| GET    | `/api/backtest/strategies`  | JWT  | List all 6 strategies with metadata           |
| POST   | `/api/backtest/run`         | JWT  | Run backtest → stats + HTML chart             |
| POST   | `/api/backtest/optimize`    | JWT  | Find optimal params (up to 200 combinations)  |

---

## Frontend Files — React (Pre-existing)

> These files existed before the Python migration. They will be connected in Sprint 5.

### Components (20 files)

| File                                   | Purpose                             |
| -------------------------------------- | ----------------------------------- |
| `components/AiPredictionCard.tsx`      | AI prediction display card          |
| `components/BacktestDashboard.tsx`     | Backtesting results dashboard       |
| `components/BottomNav.tsx`             | Mobile bottom navigation bar        |
| `components/DhanSettingsModal.tsx`     | Dhan broker settings modal          |
| `components/InteractiveChart.tsx`      | TradingView-style interactive chart |
| `components/MarketStatusTicker.tsx`    | Live market status ticker           |
| `components/Navbar.tsx`                | Top navigation bar                  |
| `components/NewsAnalysisDashboard.tsx` | News analysis with AI               |
| `components/PaperTradingDashboard.tsx` | Paper trading UI                    |
| `components/PythonLab.tsx`             | Python code execution lab           |
| `components/SettingsModal.tsx`         | App settings modal                  |
| `components/Sidebar.tsx`               | Side navigation panel               |
| `components/SignalFeedCard.tsx`        | Trading signal feed                 |
| `components/Sparkline.tsx`             | Mini sparkline chart                |
| `components/StockDetailView.tsx`       | Detailed stock view                 |
| `components/StrategyCard.tsx`          | Strategy display card               |
| `components/StrategyGuide.tsx`         | Strategy guide/tutorial             |
| `components/TechnicalPanel.tsx`        | Technical indicators panel          |
| `components/TradePlanCard.tsx`         | Trade plan display                  |
| `components/WatchlistRow.tsx`          | Single watchlist row                |

### Services (8 files)

| File                            | Purpose                           |
| ------------------------------- | --------------------------------- |
| `services/angel.ts`             | Angel One API client (TypeScript) |
| `services/backtestEngine.ts`    | Backtesting computation engine    |
| `services/dhan.ts`              | Dhan broker API client            |
| `services/gemini.ts`            | Google Gemini AI client           |
| `services/mockSignals.ts`       | Mock trading signals for dev      |
| `services/stockData.ts`         | Stock data fetching service       |
| `services/streaming.ts`         | WebSocket streaming client        |
| `services/technicalAnalysis.ts` | Technical indicator calculations  |

### Other Frontend

| File             | Purpose                                  |
| ---------------- | ---------------------------------------- |
| `App.tsx`        | React app root — routes and layout       |
| `index.tsx`      | React entry point — renders App into DOM |
| `index.html`     | HTML shell with Vite entry               |
| `types.ts`       | Shared TypeScript type definitions       |
| `package.json`   | Frontend npm dependencies                |
| `tsconfig.json`  | TypeScript compiler config               |
| `vite.config.ts` | Vite bundler configuration               |
| `server.cjs`     | Express dev server (Node.js)             |
| `sync-db.cjs`    | SQLite database sync utility             |

---

## Documentation & Config Files

| File                                   | Purpose                                                                                                                                                                            |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/copilot-instructions.md`      | Auto-loaded by Copilot in every conversation. Contains project overview, tech stack, architecture, coding standards, security rules, risk limits, sprint status, and known issues. |
| `docs/planning/implementation_plan.md` | 6-sprint implementation plan from Antigravity IDE. Defines scope, files, and acceptance criteria for each sprint.                                                                  |
| `docs/planning/task_checklist.md`      | Sprint-level task checklist with completion tracking.                                                                                                                              |
| `docs/planning/file_registry.md`       | Original file registry from Antigravity — lists all planned files.                                                                                                                 |
| `docs/planning/cleanup_audit.md`       | Audit of cleanup tasks (remove old Node.js files, etc.).                                                                                                                           |
| `docs/planning/walkthrough.md`         | Architecture walkthrough explaining design decisions.                                                                                                                              |
| `docs/PROJECT_RECORD.md`               | **THIS FILE** — master record of every file, purpose, and changelog.                                                                                                               |
| `docs/AGENT_CONTEXT.md`                | Transferable context file — paste into any AI agent to continue work. Contains full project state, build history, what to build next.                                              |
| `docs/CODE_GUIDE.md`                   | Beginner-friendly "How it works" guide with 7 real-world use cases (login, broker connect, order flow, paper trading, config, constants). Created by Antigravity agent.            |
| `backend/scripts/quick_check.py`       | 44-point end-to-end test: health, auth, JWT, trades, watchlists, paper trading, risk manager, imports, docs. Runs against port 8000.                                               |
| `backend/scripts/final_check.py`       | Self-contained 314-line test: starts its own server on port 8001, runs comprehensive checks (health, auth, CRUD, broker, AI endpoints), then shuts down. No external server needed. |
| `backend/start_server.bat`             | Batch file to start FastAPI server (cmd /c uvicorn on port 8000).                                                                                                                  |

---

## Legacy Files — Pending Cleanup

> These are old Node.js/Express files from the original TypeScript backend.
> They should be deleted once the Python migration is fully verified.

| File                        | Status    | Notes                                                                               |
| --------------------------- | --------- | ----------------------------------------------------------------------------------- |
| `backend/server.js`         | ❌ DELETE | Old Express server — replaced by FastAPI `main.py`                                  |
| `backend/db.js`             | ❌ DELETE | Old SQLite/Knex DB layer — replaced by `database.py`                                |
| `backend/seed.js`           | ❌ DELETE | Old database seeder                                                                 |
| `backend/debug_tokens.js`   | ❌ DELETE | Old JWT debugging script                                                            |
| `backend/package.json`      | ❌ DELETE | Old Node.js dependencies                                                            |
| `backend/package-lock.json` | ❌ DELETE | Old Node.js lock file                                                               |
| `backend/node_modules/`     | ❌ DELETE | Old Node.js modules (heavy)                                                         |
| `backend/models/`           | ❌ DELETE | Old Sequelize/Knex models (if exists)                                               |
| `jwt_token.py`              | ⚠️ REVIEW | Root-level script with Angel One credentials — should be deleted or secrets removed |
| `tempCodeRunnerFile.py`     | ❌ DELETE | VS Code temp file                                                                   |
| `market.db`                 | ❌ DELETE | Old SQLite database file                                                            |

---

## Changelog

### 2026-02-15 — Sprint 4 Complete: Backtesting Engine + 6 Strategies

| Action       | File                                    | Details                                                                                      |
| ------------ | --------------------------------------- | -------------------------------------------------------------------------------------------- |
| **CREATED**  | `app/services/data_provider.py`         | Multi-tier data: Angel One → yfinance → demo. 30min cache. Timezone-naive output             |
| **CREATED**  | `app/services/backtest_engine.py`       | BacktestEngine — 0.2% commission, HTML charts (base64), optimization (200 combos)             |
| **CREATED**  | `app/strategies/__init__.py`            | Lazy-loading strategy registry — `get_strategy()`, `list_strategies()`                        |
| **CREATED**  | `app/strategies/base.py`               | StrategyBase — metadata, optimization ranges, `get_info()` class method                       |
| **CREATED**  | `app/strategies/supertrend_rsi.py`     | Supertrend + RSI filter strategy (55-60% expected win rate)                                    |
| **CREATED**  | `app/strategies/vwap_orb.py`           | VWAP Opening Range Breakout — 6 trades on RELIANCE, 66.67% win rate                           |
| **CREATED**  | `app/strategies/ema_adx.py`            | EMA 9/21 crossover + ADX > 25 trend filter                                                    |
| **CREATED**  | `app/strategies/rsi_macd.py`           | RSI mean reversion + MACD confirmation (65-73%)                                                |
| **CREATED**  | `app/strategies/vcp_breakout.py`       | VCP Minervini method — Trend Template + 3:1 R:R                                                |
| **CREATED**  | `app/strategies/volume_breakout.py`    | Volume spike breakout — 2× avg volume detection                                                |
| **CREATED**  | `app/routers/backtest.py`              | 3 JWT endpoints: strategies list, run backtest, optimize params                                |
| **CREATED**  | `scripts/verify_sprint4.py`            | 6-step verification — all passed ✅                                                            |
| **UPDATED**  | `requirements.txt`                      | Added `Backtesting>=0.3.3`, `yfinance>=0.2.31`                                                |
| **UPDATED**  | `app/constants.py`                      | Added `StrategyType`, `BacktestStatus` enums                                                   |
| **UPDATED**  | `app/models/schemas.py`                | Added 5 schemas: BacktestRequest, BacktestResult, StrategyInfo, OptimizeRequest, OptimizeResult |
| **UPDATED**  | `app/main.py`                          | Wired `backtest.router`                                                                        |
| **UPDATED**  | `AGENT_CONTEXT.md`                      | Sprint 4 marked COMPLETE, architecture tree updated                                            |
| **UPDATED**  | `CODE_GUIDE.md`                         | Complete rewrite — architecture, all endpoints, data flows, coding patterns                    |
| **UPDATED**  | `copilot-instructions.md`              | Sprint 4 status → COMPLETE, added Sprint 3+4 file tables                                      |
| **UPDATED**  | `docs/planning/file_registry.md`       | Extended from Sprint 1 only → all 4 sprints                                                    |
| **DELETED**  | `scripts/_debug_bt.py`                 | Temp debug script — no longer needed                                                           |
| **DELETED**  | `scripts/_debug_output.txt`            | Debug output — no longer needed                                                                |
| **DELETED**  | `scripts/_install_sprint4.bat`         | One-time pip install batch — no longer needed                                                  |
| **DELETED**  | `scripts/_sprint4_output.txt`          | Verification output — no longer needed                                                         |
| **DELETED**  | `scripts/_verify_now.py`               | Temp verify script — no longer needed                                                          |

### 2026-02-15 — API Keys Verified + Documentation Updates

| Action       | File                      | Details                                                                                 |
| ------------ | ------------------------- | --------------------------------------------------------------------------------------- |
| **CREATED**  | `scripts/test_tavily.py`  | Tavily API verification test — confirms real news articles are returned                 |
| **UPDATED**  | `scripts/test_tavily.py`  | Fixed: `data=` → `json=` for login, `status` → `success` for response check             |
| **UPDATED**  | `AGENT_CONTEXT.md`        | Sprint 3 marked COMPLETE, tree updated, API table expanded, tips refreshed for Sprint 4 |
| **UPDATED**  | `copilot-instructions.md` | Sprint 3 status changed from ❌ NOT STARTED → ✅ COMPLETE                               |
| **VERIFIED** | `.env`                    | Angel One Client ID (S1029255) added, Tavily API key added and verified working         |

### 2026-02-14 — Sprint 3 Complete: AI & Analysis Engine

| Action      | File                            | Details                                                                                              |
| ----------- | ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **CREATED** | `app/services/technical.py`     | Sprint 3 — TechnicalAnalyzer with 15+ pandas-ta indicators, signal interpretation, composite scoring |
| **CREATED** | `app/services/ai_engine.py`     | Sprint 3 — AIEngine with LangChain + Gemini 2.0 Flash, analysis chain + sentiment analysis           |
| **CREATED** | `app/services/tavily_search.py` | Sprint 3 — TavilySearchService for real-time market news, graceful fallback when disabled            |
| **CREATED** | `app/services/stock_picker.py`  | Sprint 3 — StockPicker with 10-layer scoring (100 pts), capital-aware position sizing                |
| **CREATED** | `app/services/analytics.py`     | Sprint 3 — PerformanceAnalytics: Sharpe ratio, drawdown, streaks, win rate, expectancy               |
| **CREATED** | `app/routers/ai.py`             | Sprint 3 — 5 AI endpoints (analyze, predict, news, picks, analytics). All JWT-protected.             |
| **CREATED** | `scripts/test_sprint3.py`       | Sprint 3 — 42-point test suite. ALL PASSED.                                                          |
| **UPDATED** | `app/main.py`                   | Wired ai router — `app.include_router(ai.router)`                                                    |
| **UPDATED** | `app/models/schemas.py`         | Added 9 new Pydantic schemas for AI/analysis responses                                               |
| **UPDATED** | `app/exceptions.py`             | Added `ServiceUnavailableError` (HTTP 503)                                                           |
| **UPDATED** | `requirements.txt`              | Added langchain, langchain-google-genai, langchain-community, tavily-python, pandas-ta               |

### 2026-02-14 — Pre-Sprint 3 Verification + Documentation

| Action       | File                             | Details                                                                                              |
| ------------ | -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **CREATED**  | `docs/CODE_GUIDE.md`             | Beginner-friendly "How it works" guide with 7 use cases. Created by Antigravity agent.               |
| **CREATED**  | `backend/scripts/quick_check.py` | 44-point end-to-end test script (health → auth → trading → imports → docs). Runs against port 8000.  |
| **FIXED**    | `backend/scripts/quick_check.py` | Fixed response parsing: `d["body"]["data"]` → `d["data"]` (ApiResponse has no `body` wrapper).       |
| **CREATED**  | `backend/start_server.bat`       | Batch file to start FastAPI server for manual testing.                                               |
| **VERIFIED** | All Sprint 1 + 2 files           | Full 44-check verification: ALL PASSED. Server, auth, CRUD, paper trading, risk manager all working. |

### 2026-02-12 — Sprint 2 Complete + Documentation

| Action      | File                               | Details                                                                                               |
| ----------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **CREATED** | `app/services/__init__.py`         | Sprint 2 — services package init                                                                      |
| **CREATED** | `app/services/broker_interface.py` | Sprint 2 — ABC with 4 dataclasses + 10 abstract methods                                               |
| **CREATED** | `app/services/angel_broker.py`     | Sprint 2 — Angel One SmartAPI integration                                                             |
| **CREATED** | `app/services/zerodha_broker.py`   | Sprint 2 — Zerodha KiteConnect integration                                                            |
| **CREATED** | `app/services/paper_trader.py`     | Sprint 2 — Virtual trading engine with ₹1,00,000 capital                                              |
| **CREATED** | `app/services/risk_manager.py`     | Sprint 2 — 6 pre-trade safety checks + kill switch                                                    |
| **CREATED** | `app/services/broker_factory.py`   | Sprint 2 — create_broker() factory function                                                           |
| **CREATED** | `app/routers/broker.py`            | Sprint 2 — 13 REST endpoints for broker ops                                                           |
| **UPDATED** | `app/models/schemas.py`            | Added 7 new Pydantic schemas for broker/order/position/risk                                           |
| **UPDATED** | `app/main.py`                      | Wired broker router — `app.include_router(broker.router)`                                             |
| **UPDATED** | `requirements.txt`                 | Added smartapi-python, kiteconnect, pyotp, logzero, websocket-client, pandas, numpy, python-multipart |
| **UPDATED** | `run.py`                           | Added `reload_dirs` with absolute path to prevent watcher crashes. Added `import os`.                 |
| **CREATED** | `scripts/test_sprint2.py`          | Sprint 2 import validation test (10/10 checks)                                                        |
| **CREATED** | `scripts/test_sprint2_live.py`     | Sprint 2 live endpoint test                                                                           |
| **UPDATED** | `.github/copilot-instructions.md`  | Updated Sprint 2 status to COMPLETE, added Sprint 2 file table                                        |
| **CREATED** | `docs/PROJECT_RECORD.md`           | THIS FILE — master project record                                                                     |
| **CREATED** | `docs/AGENT_CONTEXT.md`            | Transferable context file for switching between AI agents/IDEs                                        |

### 2026-02-11 — Sprint 1 Bug Fixes

| Action      | File                                    | Details                                                                                                  |
| ----------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **FIXED**   | `app/models/base.py`                    | Converted from `Column()` to `Mapped[]` + `mapped_column()` for SQLAlchemy 2.0                           |
| **FIXED**   | `app/models/trade.py`                   | Same Mapped[] conversion                                                                                 |
| **FIXED**   | `app/models/watchlist.py`               | Same Mapped[] conversion                                                                                 |
| **FIXED**   | `app/models/instrument.py`              | Same Mapped[] conversion                                                                                 |
| **FIXED**   | `app/config.py`                         | Changed `.env` path from relative `".env"` to absolute `Path(__file__).resolve().parent.parent / ".env"` |
| **FIXED**   | `app/security/auth.py`                  | Changed `tokenUrl` from `"/api/auth/login"` to `"/api/auth/token"` for Swagger OAuth2                    |
| **CREATED** | `app/routers/auth.py` `/api/auth/token` | Added OAuth2 form endpoint for Swagger "Authorize" button                                                |
| **FIXED**   | bcrypt version                          | Pinned `bcrypt==4.0.1` to fix passlib compatibility                                                      |

### 2026-02-11 — Initial Setup in VS Code

| Action      | File                                   | Details                                 |
| ----------- | -------------------------------------- | --------------------------------------- |
| **CREATED** | `.github/copilot-instructions.md`      | Auto-loaded project context for Copilot |
| **CREATED** | `docs/planning/implementation_plan.md` | Copied from Antigravity IDE brain files |
| **CREATED** | `docs/planning/task_checklist.md`      | Copied from Antigravity                 |
| **CREATED** | `docs/planning/file_registry.md`       | Copied from Antigravity                 |
| **CREATED** | `docs/planning/cleanup_audit.md`       | Copied from Antigravity                 |
| **CREATED** | `docs/planning/walkthrough.md`         | Copied from Antigravity                 |

### Pre-2026-02-11 — Sprint 1 (Built in Antigravity IDE)

| Action      | File                  | Details                                                                                             |
| ----------- | --------------------- | --------------------------------------------------------------------------------------------------- |
| **CREATED** | All 24 Sprint 1 files | Foundation: FastAPI + PostgreSQL + Auth + CRUD. Built by Gemini + Claude agents in Antigravity IDE. |

---

## API Endpoint Summary

### No Auth Required

| Method | Path          | Router    | Purpose                 |
| ------ | ------------- | --------- | ----------------------- |
| GET    | `/`           | main.py   | Root — app info + links |
| GET    | `/api/health` | health.py | Health check + DB ping  |

### Auth Required (JWT)

| Method | Path                                      | Router        | Purpose                             |
| ------ | ----------------------------------------- | ------------- | ----------------------------------- |
| POST   | `/api/auth/login`                         | auth.py       | Login (JSON body)                   |
| POST   | `/api/auth/token`                         | auth.py       | Login (OAuth2 form for Swagger)     |
| POST   | `/api/trades`                             | trades.py     | Create trade                        |
| GET    | `/api/trades`                             | trades.py     | List trades (paginated)             |
| GET    | `/api/trades/{id}`                        | trades.py     | Get single trade                    |
| PUT    | `/api/trades/{id}`                        | trades.py     | Update trade                        |
| DELETE | `/api/trades/{id}`                        | trades.py     | Delete trade                        |
| GET    | `/api/watchlists`                         | watchlists.py | List all watchlists                 |
| GET    | `/api/watchlists/names`                   | watchlists.py | List watchlist names                |
| GET    | `/api/watchlists/{id}`                    | watchlists.py | Get single watchlist                |
| POST   | `/api/watchlists`                         | watchlists.py | Create/upsert watchlist             |
| DELETE | `/api/watchlists/{id}`                    | watchlists.py | Delete watchlist                    |
| POST   | `/api/broker/connect`                     | broker.py     | Connect to broker                   |
| POST   | `/api/broker/disconnect`                  | broker.py     | Disconnect broker                   |
| GET    | `/api/broker/status`                      | broker.py     | Broker connection status            |
| POST   | `/api/broker/order`                       | broker.py     | Place order (with risk check)       |
| DELETE | `/api/broker/order/{id}`                  | broker.py     | Cancel order                        |
| GET    | `/api/broker/positions`                   | broker.py     | Get open positions                  |
| GET    | `/api/broker/holdings`                    | broker.py     | Get holdings                        |
| GET    | `/api/broker/orders`                      | broker.py     | Get order book                      |
| GET    | `/api/broker/paper/summary`               | broker.py     | Paper trading summary               |
| POST   | `/api/broker/paper/reset`                 | broker.py     | Reset paper trading                 |
| GET    | `/api/broker/risk/status`                 | broker.py     | Risk manager status                 |
| POST   | `/api/broker/risk/kill-switch/activate`   | broker.py     | Activate kill switch                |
| POST   | `/api/broker/risk/kill-switch/deactivate` | broker.py     | Deactivate kill switch              |
| GET    | `/api/ai/analyze/{symbol}`                | ai.py         | Technical analysis (15+ indicators) |
| GET    | `/api/ai/predict/{symbol}`                | ai.py         | AI prediction (Gemini)              |
| GET    | `/api/ai/news/{symbol}`                   | ai.py         | Stock news search (Tavily)          |
| GET    | `/api/ai/picks`                           | ai.py         | Smart stock picks                   |
| GET    | `/api/ai/analytics`                       | ai.py         | Performance analytics               |

**Total: 31 endpoints** (2 public + 29 authenticated)

---

## Dependencies (requirements.txt)

| Package                   | Version  | Purpose                              |
| ------------------------- | -------- | ------------------------------------ |
| fastapi                   | 0.115.0  | Web framework                        |
| uvicorn[standard]         | 0.34.0   | ASGI server                          |
| pydantic                  | 2.10.0   | Data validation                      |
| pydantic-settings         | 2.6.0    | Settings from .env                   |
| python-dotenv             | 1.0.0    | .env file loader                     |
| asyncpg                   | 0.30.0   | PostgreSQL async driver              |
| sqlalchemy[asyncio]       | 2.0.36   | ORM + async engine                   |
| alembic                   | 1.14.0   | Database migrations                  |
| psycopg2-binary           | 2.9.10   | PostgreSQL sync driver (for Alembic) |
| python-jose[cryptography] | 3.3.0    | JWT tokens                           |
| passlib[bcrypt]           | 1.7.4    | Password hashing                     |
| bcrypt                    | 4.0.1    | Explicit pin — passlib crashes with bcrypt >=4.1 |
| cryptography              | >=42.0.0 | Fernet encryption                    |
| slowapi                   | 0.1.9    | Rate limiting                        |
| python-multipart          | >=0.0.9  | Form data parsing (OAuth2)           |
| httpx                     | 0.28.0   | Async HTTP client                    |
| smartapi-python           | >=1.5.5  | Angel One SDK                        |
| kiteconnect               | >=5.0.1  | Zerodha SDK                          |
| pyotp                     | >=2.9.0  | TOTP codes for Angel                 |
| logzero                   | >=1.7.0  | Logging (smartapi dep)               |
| websocket-client          | >=1.6.0  | WebSocket (smartapi dep)             |
| pandas                    | >=2.2.0  | Data analysis                        |
| numpy                     | >=1.26.0 | Numerical computing                  |
| python-json-logger        | 3.2.0    | Structured JSON logging              |
| langchain                 | >=0.3.0  | LLM orchestration framework          |
| langchain-google-genai    | >=2.0.0  | Gemini LLM integration               |
| langchain-community       | >=0.3.0  | Community LLM tools                  |
| tavily-python             | >=0.5.0  | Real-time news search API            |
| pandas-ta                 | >=0.3.14 | 130+ technical analysis indicators   |
