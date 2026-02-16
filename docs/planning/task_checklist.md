# AlgoTrade Pro — Master Task Checklist

## Sprint 1: Foundation (Current)

### Coding Standards & Project Setup
- [x] Create coding standards document
- [x] Set up Python project structure
- [x] Create [.gitignore](file:///e:/algotrade-pro/.gitignore) (security-safe)
- [x] Create [.env.example](file:///e:/algotrade-pro/backend/.env.example) (template)
- [x] Create [requirements.txt](file:///e:/algotrade-pro/backend/requirements.txt)
- [x] Create [run.py](file:///e:/algotrade-pro/backend/run.py) (uvicorn runner)

### Core Framework Files
- [x] [app/__init__.py](file:///e:/algotrade-pro/backend/app/__init__.py) — Package init with version
- [x] [app/constants.py](file:///e:/algotrade-pro/backend/app/constants.py) — Enums, status codes, magic strings (13 enums)
- [x] [app/exceptions.py](file:///e:/algotrade-pro/backend/app/exceptions.py) — Custom exception hierarchy (10 types)
- [x] [app/config.py](file:///e:/algotrade-pro/backend/app/config.py) — Settings class (pydantic-settings)
- [x] [app/logging_config.py](file:///e:/algotrade-pro/backend/app/logging_config.py) — Structured logging setup (4 handlers)
- [x] [app/database.py](file:///e:/algotrade-pro/backend/app/database.py) — Async PostgreSQL engine + session
- [x] [app/middleware.py](file:///e:/algotrade-pro/backend/app/middleware.py) — CORS, request ID, error handler, timing
- [x] [app/dependencies.py](file:///e:/algotrade-pro/backend/app/dependencies.py) — DI container (vault, db)

### Security Layer
- [x] [app/security/__init__.py](file:///e:/algotrade-pro/backend/app/security/__init__.py)
- [x] [app/security/vault.py](file:///e:/algotrade-pro/backend/app/security/vault.py) — Credential vault (Fernet AES-256)
- [x] [app/security/auth.py](file:///e:/algotrade-pro/backend/app/security/auth.py) — JWT auth + password hashing

### Models (ORM + Pydantic)
- [x] [app/models/__init__.py](file:///e:/algotrade-pro/backend/app/models/__init__.py)
- [x] [app/models/base.py](file:///e:/algotrade-pro/backend/app/models/base.py) — Base model with common fields (id, timestamps)
- [x] [app/models/trade.py](file:///e:/algotrade-pro/backend/app/models/trade.py) — Trade ORM model
- [x] [app/models/watchlist.py](file:///e:/algotrade-pro/backend/app/models/watchlist.py) — Watchlist ORM model
- [x] [app/models/instrument.py](file:///e:/algotrade-pro/backend/app/models/instrument.py) — Instrument ORM model
- [x] [app/models/audit.py](file:///e:/algotrade-pro/backend/app/models/audit.py) — Audit log ORM model
- [x] [app/models/schemas.py](file:///e:/algotrade-pro/backend/app/models/schemas.py) — Pydantic request/response schemas

### Routers (API)
- [x] [app/routers/__init__.py](file:///e:/algotrade-pro/backend/app/routers/__init__.py)
- [x] [app/routers/health.py](file:///e:/algotrade-pro/backend/app/routers/health.py) — Health check endpoint
- [x] [app/routers/auth.py](file:///e:/algotrade-pro/backend/app/routers/auth.py) — Login (rate-limited)
- [x] [app/routers/trades.py](file:///e:/algotrade-pro/backend/app/routers/trades.py) — CRUD trades (JWT-protected)
- [x] [app/routers/watchlists.py](file:///e:/algotrade-pro/backend/app/routers/watchlists.py) — CRUD watchlists (JWT-protected)

### App Assembly
- [x] [app/main.py](file:///e:/algotrade-pro/backend/app/main.py) — FastAPI app (assembles everything)

### Utilities
- [x] [scripts/scan_hardcoded_secrets.py](file:///e:/algotrade-pro/backend/scripts/scan_hardcoded_secrets.py) — Pre-commit hook

### Verification
- [x] Test import chain works
- [x] Run hardcode scanner on new code
- [x] Verify file structure is correct

---

## Sprint 2: Broker Integration ✅ COMPLETE

### Services
- [x] `app/services/__init__.py` — Package init
- [x] `app/services/broker_interface.py` — ABC + 4 dataclasses + 10 abstract methods
- [x] `app/services/angel_broker.py` — Angel One SmartAPI integration
- [x] `app/services/zerodha_broker.py` — Zerodha KiteConnect integration
- [x] `app/services/paper_trader.py` — Virtual trading engine (₹1,00,000 capital)
- [x] `app/services/risk_manager.py` — 6 pre-trade safety checks + kill switch
- [x] `app/services/broker_factory.py` — `create_broker()` factory function

### Router
- [x] `app/routers/broker.py` — 13 endpoints for broker operations

### Updated Files
- [x] `app/models/schemas.py` — Added 7 broker/order/position/risk schemas
- [x] `app/main.py` — Wired broker router
- [x] `requirements.txt` — Added smartapi-python, kiteconnect, pyotp, logzero, websocket-client

### Testing
- [x] `scripts/test_sprint2.py` — Import test (10/10 ✅)
- [x] `scripts/test_sprint2_live.py` — Live endpoint test (full paper trading flow ✅)

---

## Sprint 3: AI & Analysis Engine ✅ COMPLETE

### Services
- [x] `app/services/technical.py` — TechnicalAnalyzer (15+ pandas-ta indicators)
- [x] `app/services/ai_engine.py` — AIEngine (LangChain + Gemini 2.0 Flash)
- [x] `app/services/tavily_search.py` — TavilySearchService (real-time news)
- [x] `app/services/stock_picker.py` — StockPicker (10-layer scoring)
- [x] `app/services/analytics.py` — PerformanceAnalytics (Sharpe, drawdown, streaks)

### Router
- [x] `app/routers/ai.py` — 5 AI endpoints (analyze, predict, news, picks, analytics)

### Updated Files
- [x] `app/models/schemas.py` — Added 9 AI/analysis schemas (total now 27)
- [x] `app/exceptions.py` — Added `ServiceUnavailableError` (HTTP 503)
- [x] `app/main.py` — Wired AI router
- [x] `requirements.txt` — Added langchain, langchain-google-genai, langchain-community, tavily-python, pandas-ta

### Testing
- [x] `scripts/test_sprint3.py` — 42-point test (42/42 ✅)
- [x] `scripts/test_tavily.py` — Tavily API key verification ✅

---

## Sprint 4: Backtesting Engine + 6 Strategies — NEXT
- [ ] `app/services/backtest_engine.py` — Visual backtesting (backtesting.py)
- [ ] `app/routers/backtest.py` — Backtest endpoints
- [ ] `app/strategies/base.py` — Strategy base class
- [ ] `app/strategies/orb.py` — Opening Range Breakout
- [ ] `app/strategies/vcp.py` — VCP Breakout
- [ ] `app/strategies/rsi_reversion.py` — RSI Mean Reversion
- [ ] `app/strategies/ema_crossover.py` — EMA 9/21 Crossover
- [ ] `app/strategies/supertrend.py` — Supertrend
- [ ] `app/strategies/volume_breakout.py` — Volume Breakout
