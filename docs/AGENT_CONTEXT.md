# AlgoTrade Pro — Agent Context (Transferable)

> **Purpose:** Paste this entire file into ANY AI coding agent (Antigravity IDE, Claude, Gemini, ChatGPT, Cursor, etc.) so it can continue building this project from where we left off.
> **Last Updated:** 2026-02-15
> **Sprints Complete:** Sprint 1 + Sprint 2 + Sprint 3 + Sprint 4 (out of 6 total)

---

## ⚡ SYSTEM PROMPT FOR NEW AGENT

You are resuming work on **AlgoTrade Pro** — a production-grade algorithmic trading platform for Indian stock markets (NSE/BSE). The project was started in Google's Antigravity IDE (Gemini + Claude agents), migrated to VS Code (GitHub Copilot), and is now being handed to you.

**Your role:** Continue building from Sprint 4 onward. Follow all coding standards exactly. Never hardcode secrets. Update `docs/PROJECT_RECORD.md` after every file change.

---

## 📋 PROJECT SUMMARY

- **What:** AI-powered algorithmic trading platform for Indian NSE/BSE markets
- **Backend:** Python 3.11+ / FastAPI (async) — replaces old TypeScript/Express
- **Frontend:** React + TypeScript (Vite) — 31 existing components, will connect in Sprint 5
- **Database:** PostgreSQL (async via asyncpg + SQLAlchemy 2.0)
- **AI/ML:** LangChain + Google Gemini 2.0 Flash + Tavily Search
- **Brokers:** Angel One (smartapi-python) + Zerodha (kiteconnect) + Paper Trader
- **Auth:** JWT (HS256) + bcrypt + Fernet AES-256 credential vault
- **Server:** Uvicorn (ASGI), port 8000

---

## 🏗️ ARCHITECTURE

```
algotrade-pro/
├── backend/                        # Python FastAPI (ACTIVE)
│   ├── app/
│   │   ├── main.py                 # FastAPI entry point — wires 6 routers
│   │   ├── config.py               # ONLY env reader (Pydantic Settings)
│   │   ├── constants.py            # 13 Enums (zero magic strings)
│   │   ├── exceptions.py           # 11 custom exceptions
│   │   ├── logging_config.py       # 4 log handlers
│   │   ├── database.py             # Async PostgreSQL (SQLAlchemy 2.0)
│   │   ├── middleware.py           # CORS, request ID, error handler, timing
│   │   ├── dependencies.py         # DI container
│   │   ├── models/
│   │   │   ├── base.py             # Abstract ORM base (id, created_at, updated_at)
│   │   │   ├── trade.py            # Trade ORM (12 columns)
│   │   │   ├── watchlist.py        # Watchlist ORM (JSONB items)
│   │   │   ├── instrument.py       # Instrument ORM (NSE/BSE tokens)
│   │   │   ├── audit.py            # AuditLog ORM (append-only)
│   │   │   └── schemas.py          # 27 Pydantic schemas
│   │   ├── routers/
│   │   │   ├── health.py           # GET /api/health (no auth)
│   │   │   ├── auth.py             # POST /api/auth/login + /token
│   │   │   ├── trades.py           # CRUD — 5 endpoints
│   │   │   ├── watchlists.py       # CRUD — 5 endpoints
│   │   │   ├── broker.py           # 13 broker endpoints
│   │   │   └── ai.py               # 5 AI endpoints (Sprint 3)
│   │   ├── security/
│   │   │   ├── auth.py             # JWT + password hashing
│   │   │   └── vault.py            # Fernet AES-256 encrypt/decrypt
│   │   ├── services/               # ← Sprint 2 + Sprint 3 + Sprint 4
│   │   │   ├── broker_interface.py  # ABC + 4 dataclasses
│   │   │   ├── angel_broker.py      # Angel One SmartAPI
│   │   │   ├── zerodha_broker.py    # Zerodha KiteConnect
│   │   │   ├── paper_trader.py      # Virtual trading
│   │   │   ├── risk_manager.py      # 6 pre-trade checks
│   │   │   ├── broker_factory.py    # create_broker() factory
│   │   │   ├── technical.py         # TechnicalAnalyzer (pandas-ta)
│   │   │   ├── ai_engine.py         # AIEngine (LangChain + Gemini)
│   │   │   ├── tavily_search.py     # TavilySearchService
│   │   │   ├── stock_picker.py      # StockPicker (10-layer scoring)
│   │   │   ├── analytics.py         # PerformanceAnalytics
│   │   │   ├── data_provider.py     # Multi-tier data (Sprint 4)
│   │   │   └── backtest_engine.py   # BacktestEngine (Sprint 4)
│   │   └── strategies/              # ← Sprint 4: 6 strategies
│   │       ├── __init__.py          # Lazy strategy registry
│   │       ├── base.py              # StrategyBase (metadata + optimization)
│   │       ├── supertrend_rsi.py    # Supertrend + RSI (55-60%)
│   │       ├── vwap_orb.py          # VWAP ORB (60-70%)
│   │       ├── ema_adx.py           # EMA 9/21 + ADX (55-60%)
│   │       ├── rsi_macd.py          # RSI + MACD (65-73%)
│   │       ├── vcp_breakout.py      # VCP Minervini (55-65%)
│   │       └── volume_breakout.py   # Volume Breakout (52-58%)
│   ├── scripts/
│   │   ├── scan_hardcoded_secrets.py  # Pre-commit scanner (11 regex)
│   │   ├── verify_health.py
│   │   ├── quick_check.py             # Sprint 1+2 test (44/44 ✅)
│   │   ├── test_sprint2.py            # Import test (10/10 ✅)
│   │   ├── test_sprint2_live.py       # Live endpoint test ✅
│   │   ├── test_sprint3.py            # Sprint 3 full test (42/42 ✅)
│   │   └── test_tavily.py             # Tavily API key verification ✅
│   ├── .env                         # Secrets (NEVER in git) — has real Angel One creds
│   ├── .env.example                 # Template (in git)
│   ├── requirements.txt             # All Python deps
│   └── run.py                       # Uvicorn runner (port 8000, reload on app/ only)
├── docs/
│   ├── PROJECT_RECORD.md            # Master file registry + changelog (MUST update)
│   ├── AGENT_CONTEXT.md             # THIS FILE — transferable context
│   └── planning/
│       ├── implementation_plan.md   # Full 6-sprint plan (1214 lines)
│       ├── task_checklist.md
│       ├── file_registry.md
│       ├── cleanup_audit.md
│       └── walkthrough.md
├── components/                      # React (20 TSX files) — connects in Sprint 5
├── services/                        # React services (8 TS files) — connects in Sprint 5
├── App.tsx / index.tsx / index.html
├── package.json / tsconfig.json / vite.config.ts
```

---

## ✅ WHAT HAS BEEN BUILT & TESTED

### Sprint 1 — Foundation (24 files) ✅ COMPLETE

Built in Antigravity IDE (Gemini + Claude), then bug-fixed in VS Code:

- FastAPI app with async lifespan (startup: logging + DB init, shutdown: DB close)
- Pydantic Settings with absolute `.env` path, validators, fail-fast on missing vars
- 13 Enums in constants.py — zero magic strings anywhere
- 10 custom exceptions mapping to HTTP codes (401, 403, 404, 409, 422, 400, 502, 503)
- 4-handler logging (console, app.log, errors.log, trades.log with rotation)
- Async PostgreSQL: SQLAlchemy 2.0 engine, connection pooling (10+20 overflow), `get_db()` dependency
- Middleware stack: CORS, SlowAPI rate limiter, request ID, response timing, error handlers
- DI container with cached vault singleton
- 5 ORM models: BaseModel (abstract), Trade, Watchlist, Instrument, AuditLog — all using `Mapped[]` + `mapped_column()`
- 18 Pydantic schemas (generic ApiResponse[T], auth, trades, watchlists, instruments, health, broker)
- 5 routers: health (public), auth (rate-limited), trades CRUD, watchlists CRUD, broker
- JWT auth: HS256, 60min expiry, OAuth2PasswordBearer for Swagger integration
- Fernet AES-256 credential vault
- Pre-commit secret scanner (11 regex patterns)
- **26 total API endpoints** (2 public + 24 authenticated)

### Sprint 2 — Broker Integration (8 files) ✅ COMPLETE

Built in VS Code (GitHub Copilot), fully tested:

- `BrokerInterface` ABC with 10 abstract methods + 4 dataclasses
- `AngelOneBroker` — SmartAPI integration with TOTP auth
- `ZerodhaBroker` — KiteConnect integration with login URL flow
- `PaperTrader` — Virtual broker with ₹1,00,000 capital, hard wall assertion (`_real_broker is None`), buy/sell/P&L tracking, summary, reset
- `RiskManager` — 6 pre-trade checks: kill switch, order value (₹1L max), daily loss (₹5K max), max positions (10), concentration (20% max), market hours (9:15-15:30 IST)
- `broker_factory.py` — `create_broker(broker_name)` factory function (NOT a class)
- `broker.py` router — 13 endpoints for connect/disconnect/order/positions/holdings/risk
- All wired into main.py

**Testing results:**

- Import test: 10/10 passed
- Live endpoint test: Full paper trading flow verified
  - Login → Connect paper broker → Buy 5 RELIANCE @ ₹2,500 → Sell 5 @ ₹2,700 → ₹1,000 profit → Disconnect
  - Risk manager correctly blocked 10 shares @ ₹2,500 (₹25,000 = 25% > 20% limit)

---

## 🐛 BUGS FIXED (So You Don't Repeat Them)

| Bug                          | Root Cause                                                | Fix                                                                    |
| ---------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------- |
| SQLAlchemy `Column()` errors | SQLAlchemy 2.0 requires `Mapped[]` + `mapped_column()`    | Converted all 5 ORM models                                             |
| passlib + bcrypt crash       | passlib doesn't support bcrypt >= 4.1                     | Pinned `bcrypt==4.0.1`                                                 |
| `.env` not found             | Relative path failed when running from different dirs     | Used `Path(__file__).resolve().parent.parent / ".env"` in config.py    |
| Swagger "Authorize" broken   | OAuth2 needs `tokenUrl` to point to form-data endpoint    | Added `/api/auth/token` endpoint accepting `OAuth2PasswordRequestForm` |
| Server watcher crashes       | `reload=True` watched entire workspace                    | Added `reload_dirs=[os.path.join(base_dir, "app")]` in run.py          |
| Port 8000 zombie process     | Previous uvicorn not releasing port                       | Killed manually, tested on port 8001                                   |
| Missing transitive deps      | smartapi-python needs logzero + websocket-client          | Added to requirements.txt                                              |
| Risk manager test failure    | 10 shares × ₹2,500 = 25% > 20% concentration limit        | Used 5 shares instead — correct behavior, not a bug                    |
| Login response nesting       | Token at `body.data.access_token` not `body.access_token` | Fixed test script to use correct path                                  |
| PostgreSQL `@` in password   | `@` in password breaks URL parsing                        | URL-encoded as `%40` in DATABASE_URL                                   |

---

## 🔧 HOW TO RUN THE PROJECT

```bash
# 1. Activate virtual environment
cd e:\algotrade-pro\backend
.venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Ensure PostgreSQL is running with database "algotrade"
# Connection: postgresql+asyncpg://postgres:8980%40Haidar@localhost:5432/algotrade

# 4. Start the server
python run.py
# → Server at http://localhost:8000
# → Swagger docs at http://localhost:8000/docs

# 5. Login (temporary in-memory user)
# Username: admin
# Password: admin1234
# Token is at response body.data.access_token
```

---

## 📏 CODING STANDARDS (MUST FOLLOW)

1. **DRY** — No duplicated logic. Use base classes, shared utils.
2. **SOLID** — Each file/class does ONE thing.
3. **Zero Hardcoding** — ALL secrets via `app/config.py` Settings class. **NO `os.getenv()` anywhere else.**
4. **Type Safety** — All functions have type hints. All API schemas use Pydantic.
5. **Constants** — Use Enums from `constants.py` — zero magic strings.
6. **Exceptions** — Use custom exceptions from `exceptions.py` with proper HTTP codes.
7. **Security** — JWT on every route via `Depends(get_current_user)`. Rate limiting on auth.
8. **Naming** — `snake_case` for Python, `camelCase` for TypeScript/React.
9. **Docstrings** — On every class and public method.
10. **Async** — All database and broker operations must be `async def` / `await`.
11. **Base Model** — All ORM models inherit from `base.py` (auto id, created_at, updated_at).
12. **Audit** — All sensitive actions logged to append-only `audit_logs` table.
13. **Documentation** — **Every time a file is created, updated, or deleted → update `docs/PROJECT_RECORD.md`.**

---

## 🔒 SECURITY RULES

- NEVER hardcode API keys, passwords, tokens, or secrets in code
- ALL env vars read ONLY through `app/config.py` Settings class
- ALL API routes require JWT auth (except `/api/health` and `/api/auth/login`)
- Broker credentials encrypted with Fernet AES-256 via `security/vault.py`
- Rate limiting on login: 5 requests/minute
- Pre-commit scanner: `scripts/scan_hardcoded_secrets.py` (11 regex patterns)
- `.env` is gitignored. `.env.example` is committed (no values).

---

## 💰 RISK MANAGEMENT LIMITS

| Limit                              | Value     | Config Key                |
| ---------------------------------- | --------- | ------------------------- |
| Max single order value             | ₹1,00,000 | MAX_ORDER_VALUE           |
| Max daily loss                     | ₹5,000    | MAX_DAILY_LOSS            |
| Max concurrent positions           | 10        | MAX_POSITIONS             |
| Max single position % of portfolio | 20%       | MAX_POSITION_SIZE_PERCENT |
| Rate limit on login                | 5/minute  | RATE_LIMIT_LOGIN          |
| Rate limit on orders               | 30/minute | RATE_LIMIT_ORDERS         |

---

## 🔑 KEY PATTERNS YOU MUST KNOW

### How config.py works (THE ONLY env reader):

```python
from app.config import settings
# settings.DATABASE_URL, settings.JWT_SECRET_KEY, settings.GEMINI_API_KEY, etc.
# NEVER use os.getenv() anywhere else!
```

### How to add a new service file:

1. Create `app/services/your_service.py`
2. Add any new Pydantic schemas to `app/models/schemas.py`
3. Create router `app/routers/your_router.py`
4. Wire router in `app/main.py`: `app.include_router(your_router.router, prefix="/api/your-path", tags=["YourTag"])`
5. Add new Enums to `constants.py` if needed
6. Add dependencies to `requirements.txt`
7. **Update `docs/PROJECT_RECORD.md`**

### How broker integration works:

```python
# Factory creates the right broker
broker = create_broker(BrokerName.PAPER)  # or ANGEL, ZERODHA
await broker.connect(credentials)
# Risk check runs BEFORE every order
risk_result = await risk_manager.validate_order(order, portfolio_value, positions_count)
if not risk_result["allowed"]:
    raise RiskCheckFailedError(risk_result["reason"])
result = await broker.place_order(order)
```

### The BrokerInterface contract (10 methods):

```python
connect(credentials: dict) → bool
disconnect() → None
place_order(order: OrderRequest) → OrderResponse
cancel_order(order_id: str) → dict
get_positions() → list[Position]
get_holdings() → list[Holding]
get_order_book() → list[dict]
get_ltp(symbol: str, exchange: str) → float
get_historical_data(symbol, exchange, interval, from_date, to_date) → list[dict]
# Properties: broker_name (str), is_connected (bool)
```

---

## 🚀 WHAT TO BUILD NEXT

### Sprint 3 — AI Engine ✅ COMPLETE

Built in VS Code (GitHub Copilot), tested end-to-end:

- **TechnicalAnalyzer** — 15+ indicators via pandas-ta (RSI, MACD, EMA 9/21/50/200, Bollinger, ADX, Supertrend, ATR, MFI, OBV). Composite scoring 0-100, signals: STRONG_BUY/BUY/SELL/NO_TRADE.
- **AIEngine** — LangChain + Gemini 2.0 Flash analysis chain. JSON output enforced, sanitized text, fallback to pure technical when AI fails.
- **TavilySearchService** — Real-time news search (stock, sector, market). Graceful fallback when key not set. Combined text capped at 3000 chars for AI consumption.
- **StockPicker** — 10-layer scoring (Technical 40pts, Volume 20pts, Strength 15pts, Fundamentals 15pts, News 10pts). Capital-aware position sizing, 2:1 risk-reward.
- **PerformanceAnalytics** — Sharpe ratio, max drawdown, win rate, profit factor, expectancy, best/worst streaks.
- **AI Router** — 5 JWT-protected endpoints: `/api/ai/analyze/{symbol}`, `/api/ai/predict/{symbol}`, `/api/ai/news/{symbol}`, `/api/ai/picks`, `/api/ai/analytics`
- **Test:** ALL 42 CHECKS PASSED. Tavily API verified with real news results.

### Sprint 4 — Backtesting Engine + 6 Strategies ✅ COMPLETE

Built in VS Code (Antigravity IDE), all 6 strategies verified on real RELIANCE.NS data:

- **DataProvider** — Multi-tier data: Angel One → yfinance → demo. Cache (30min TTL). Timezone-naive output.
- **BacktestEngine** — Wraps backtesting.py. 0.2% commission (brokerage+STT+slippage). HTML charts. Optimization (200 combos).
- **6 Strategies** (all extend `StrategyBase`):
  - Supertrend + RSI (55-60%) — custom Supertrend via pandas-ta ATR
  - VWAP ORB (60-70%) — volume-confirmed breakouts, 66.67% win rate on real data
  - EMA 9/21 + ADX (55-60%) — ADX > 25 trend filter
  - RSI + MACD (65-73%) — best expected win rate
  - VCP Minervini (55-65%) — Trend Template + 3:1 R:R
  - Volume Breakout (52-58%) — institutional buying signal
- **3 API endpoints:** strategies list, run backtest, optimize params
- **Test:** VWAP ORB: 2.92% return, 6 trades, 66.67% win rate, chart generated ✅

### Sprint 5 — Frontend Connection + Telegram Bot

**Files:** `app/services/telegram_bot.py`, frontend API rewiring
**Connect:** React components → FastAPI endpoints
**Telegram:** `/start`, `/status`, `/picks`, `/balance`, `/trade`, `/alerts`, `/stop`, `/performance`

### Sprint 6 — AI Agents + ML Prediction + Real-time WebSocket

**Files:** `app/services/ai_agents.py`, `app/services/ml_predictor.py`, `app/services/ws_manager.py`, `app/services/live_pnl.py`, `app/services/auto_trader.py`
**6 AI agents:** Technical, Fundamental, Sentiment, Risk, Sector, Portfolio Manager
**ML:** GradientBoosting classifier — predict UP/DOWN in 5 days (~55-60% accuracy)
**WebSocket:** Self-healing connection with exponential backoff, heartbeat monitoring

---

## 📦 CURRENT DEPENDENCIES (requirements.txt)

```
fastapi==0.115.0
uvicorn[standard]==0.34.0
pydantic==2.10.0
pydantic-settings==2.6.0
python-dotenv==1.0.0
asyncpg==0.30.0
sqlalchemy[asyncio]==2.0.36
alembic==1.14.0
psycopg2-binary==2.9.10
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
bcrypt==4.0.1
cryptography>=42.0.0
slowapi==0.1.9
python-multipart>=0.0.9
httpx==0.28.0
python-json-logger==3.2.0
smartapi-python>=1.5.5
kiteconnect>=5.0.1
pyotp>=2.9.0
logzero>=1.7.0
websocket-client>=1.6.0
pandas>=2.2.0
numpy>=1.26.0
```

---

## 📁 LEGACY FILES TO CLEAN UP

These old Node.js files still exist and should be deleted:

| File                        | Why Delete                             |
| --------------------------- | -------------------------------------- |
| `backend/server.js`         | Replaced by FastAPI main.py            |
| `backend/db.js`             | Replaced by database.py                |
| `backend/seed.js`           | Old database seeder                    |
| `backend/debug_tokens.js`   | Old JWT debug script                   |
| `backend/package.json`      | Old Node deps                          |
| `backend/package-lock.json` | Old lock file                          |
| `backend/node_modules/`     | Old Node modules (heavy)               |
| `jwt_token.py` (root)       | Has hardcoded Angel One creds — DELETE |
| `market.db` (root)          | Old SQLite database                    |

---

## 🧪 VERIFIED API ENDPOINTS (31 total)

| Method | Path                                      | Auth | Purpose                         |
| ------ | ----------------------------------------- | ---- | ------------------------------- |
| GET    | `/`                                       | No   | Root — app info                 |
| GET    | `/api/health`                             | No   | Health check + DB ping          |
| POST   | `/api/auth/login`                         | No   | Login (JSON)                    |
| POST   | `/api/auth/token`                         | No   | Login (OAuth2 form for Swagger) |
| POST   | `/api/trades`                             | JWT  | Create trade                    |
| GET    | `/api/trades`                             | JWT  | List trades (paginated)         |
| GET    | `/api/trades/{id}`                        | JWT  | Get trade                       |
| PUT    | `/api/trades/{id}`                        | JWT  | Update trade                    |
| DELETE | `/api/trades/{id}`                        | JWT  | Delete trade                    |
| GET    | `/api/watchlists`                         | JWT  | List watchlists                 |
| GET    | `/api/watchlists/names`                   | JWT  | List names only                 |
| GET    | `/api/watchlists/{id}`                    | JWT  | Get watchlist                   |
| POST   | `/api/watchlists`                         | JWT  | Create/upsert watchlist         |
| DELETE | `/api/watchlists/{id}`                    | JWT  | Delete watchlist                |
| POST   | `/api/broker/connect`                     | JWT  | Connect broker                  |
| POST   | `/api/broker/disconnect`                  | JWT  | Disconnect broker               |
| GET    | `/api/broker/status`                      | JWT  | Broker status                   |
| POST   | `/api/broker/order`                       | JWT  | Place order (risk-checked)      |
| DELETE | `/api/broker/order/{id}`                  | JWT  | Cancel order                    |
| GET    | `/api/broker/positions`                   | JWT  | Open positions                  |
| GET    | `/api/broker/holdings`                    | JWT  | Holdings                        |
| GET    | `/api/broker/orders`                      | JWT  | Order book                      |
| GET    | `/api/broker/paper/summary`               | JWT  | Paper trading stats             |
| POST   | `/api/broker/paper/reset`                 | JWT  | Reset paper trading             |
| GET    | `/api/broker/risk/status`                 | JWT  | Risk manager status             |
| POST   | `/api/broker/risk/kill-switch/activate`   | JWT  | Emergency stop                  |
| POST   | `/api/broker/risk/kill-switch/deactivate` | JWT  | Resume trading                  |
| GET    | `/api/ai/analyze/{symbol}`                | JWT  | Technical analysis (pandas-ta)  |
| GET    | `/api/ai/predict/{symbol}`                | JWT  | AI prediction (Gemini)          |
| GET    | `/api/ai/news/{symbol}`                   | JWT  | Stock news search (Tavily)      |
| GET    | `/api/ai/picks`                           | JWT  | Smart stock picks (10-layer)    |
| GET    | `/api/ai/analytics`                       | JWT  | Portfolio performance metrics   |

---

## 💡 TIPS FOR THE NEXT AGENT

1. **Always read `docs/PROJECT_RECORD.md` first** — it's the source of truth for what exists.
2. **Read `docs/planning/implementation_plan.md`** — it has the full Sprint 4-6 implementation details with code samples.
3. **Virtual environment:** `e:\algotrade-pro\backend\.venv` — activate before running anything.
4. **Test login:** `admin / admin1234` → token at `data.access_token` (JSON body, not form data).
5. **The user's real trading capital is ₹13,500** — use this for stock picker defaults.
6. **The user has real Angel One credentials** in `.env` — never expose them.
7. **GEMINI_API_KEY is set** in `.env` — Gemini AI fully working.
8. **TAVILY_API_KEY is set** in `.env` — Tavily news search fully working.
9. **Don't change existing Sprint 1/2/3 files** unless fixing bugs — they're tested and working.
10. **The user prefers:** verbose output, detailed explanations, step-by-step testing.
11. **Update PROJECT_RECORD.md** after EVERY file change — this is a firm rule.

---

_This context file was generated from the full conversation history between the user and GitHub Copilot in VS Code. It contains everything needed to continue development seamlessly._
