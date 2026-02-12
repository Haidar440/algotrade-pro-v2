# AlgoTrade Pro — Copilot Instructions

> Auto-loaded by GitHub Copilot in every conversation.
> Source: Migrated from Antigravity IDE (Gemini + Claude Agent) sessions.

---

## Project Overview

AlgoTrade Pro is a **production-grade algorithmic trading platform** for Indian stock markets (NSE/BSE).  
Originally built in TypeScript/Express — now being **incrementally migrated to Python/FastAPI**.

---

## Tech Stack (Confirmed)

| Layer                  | Technology                                                   |
| ---------------------- | ------------------------------------------------------------ |
| **Backend**            | FastAPI (Python 3.11+)                                       |
| **Frontend**           | React + TypeScript (Vite) — keeping existing 31 components   |
| **Database**           | PostgreSQL (async via asyncpg + SQLAlchemy 2.0)              |
| **AI/ML**              | LangChain + Google Gemini + Tavily Search                    |
| **Brokers**            | Angel One (smartapi-python) + Zerodha (kiteconnect)          |
| **Auth**               | JWT (python-jose) + bcrypt + Fernet AES-256 credential vault |
| **Technical Analysis** | pandas-ta (130+ indicators)                                  |
| **Backtesting**        | backtesting.py (interactive HTML charts)                     |
| **Notifications**      | Telegram Bot (python-telegram-bot)                           |
| **Server**             | Uvicorn (ASGI)                                               |

---

## Architecture

```
algotrade-pro/
├── backend/                    # Python FastAPI (NEW)
│   ├── app/
│   │   ├── main.py             # FastAPI entry point
│   │   ├── config.py           # Pydantic Settings (ONLY env reader)
│   │   ├── constants.py        # 13 Enums (zero magic strings)
│   │   ├── exceptions.py       # 10 custom exceptions
│   │   ├── logging_config.py   # 4 log handlers
│   │   ├── database.py         # Async PostgreSQL (SQLAlchemy 2.0)
│   │   ├── middleware.py       # CORS, request ID, error handler, timing
│   │   ├── dependencies.py     # DI container
│   │   ├── models/             # SQLAlchemy ORM + Pydantic schemas
│   │   ├── routers/            # API endpoints (health, auth, trades, watchlists)
│   │   └── security/           # vault.py (AES-256), auth.py (JWT)
│   ├── scripts/                # scan_hardcoded_secrets.py, verify_health.py
│   ├── .env                    # Secrets (NOT in git)
│   ├── .env.example            # Template (in git)
│   ├── requirements.txt
│   └── run.py                  # Uvicorn runner
├── components/                 # React components (31 files)
├── services/                   # React services (TypeScript)
├── App.tsx                     # React app root
└── package.json                # Frontend deps
```

---

## Coding Standards (MANDATORY)

1. **DRY**: No duplicated logic. Use base classes, shared utils.
2. **SOLID**: Each file/class does ONE thing.
3. **Zero Hardcoding**: ALL secrets via `app/config.py` Settings class. **NO `os.getenv()` anywhere else.**
4. **Type Safety**: All functions have type hints. All API schemas use Pydantic.
5. **Constants**: Use Enums from `constants.py` — zero magic strings.
6. **Exceptions**: Use custom exceptions from `exceptions.py` with proper HTTP codes.
7. **Security**: JWT on every route via `Depends(get_current_user)`. Rate limiting on auth.
8. **Naming**: `snake_case` for Python, `camelCase` for TypeScript/React.
9. **Documentation**: Docstrings on every class and public method.
10. **Testing**: Write testable, modular code. No side effects in constructors.
11. **Async**: All database operations must be async (`async def`, `await`).
12. **Base Model**: All ORM models inherit from `base.py` (auto `id`, `created_at`, `updated_at`).
13. **Audit**: All sensitive actions logged to append-only `audit_logs` table.

---

## Security Rules

- NEVER hardcode API keys, passwords, tokens, or secrets in code
- ALL env vars read ONLY through `app/config.py` Settings class
- ALL API routes require JWT auth (except `/api/health` and `/api/auth/login`)
- Broker credentials encrypted with Fernet AES-256 via `security/vault.py`
- Rate limiting on login: 5 requests/minute
- Pre-commit scanner: `scripts/scan_hardcoded_secrets.py` (11 regex patterns)
- `.env` is gitignored. `.env.example` is committed (no values).

---

## Risk Management Limits

| Limit                     | Value     |
| ------------------------- | --------- |
| MAX_ORDER_VALUE           | ₹1,00,000 |
| MAX_DAILY_LOSS            | ₹5,000    |
| MAX_POSITIONS             | 10        |
| MAX_POSITION_SIZE_PERCENT | 20%       |

---

## Sprint Status

| Sprint       | Scope                                                                 | Status         |
| ------------ | --------------------------------------------------------------------- | -------------- |
| **Sprint 1** | Foundation: FastAPI + PostgreSQL + Auth + CRUD (24 files)             | ✅ COMPLETE    |
| **Sprint 2** | Broker Integration: Angel One + Zerodha + Paper Trader + Risk Manager | ✅ COMPLETE    |
| **Sprint 3** | AI Engine: LangChain + Gemini + Tavily + Smart Stock Picker           | ❌ NOT STARTED |
| **Sprint 4** | Backtesting: Engine + 6 strategies + Optimization                     | ❌ NOT STARTED |
| **Sprint 5** | Frontend: Connect React + Telegram Bot                                | ❌ NOT STARTED |
| **Sprint 6** | Advanced: 6 AI Agents + ML Prediction + Real-time WebSocket           | ❌ NOT STARTED |

---

## Sprint 2 Files (Broker Integration)

| File                               | Purpose                                                       |
| ---------------------------------- | ------------------------------------------------------------- |
| `app/services/__init__.py`         | Package init                                                  |
| `app/services/broker_interface.py` | ABC + OrderRequest/OrderResponse/Position/Holding dataclasses |
| `app/services/angel_broker.py`     | Angel One via smartapi-python                                 |
| `app/services/zerodha_broker.py`   | Zerodha via kiteconnect                                       |
| `app/services/paper_trader.py`     | Virtual trading with ₹1,00,000 + hard wall assertion          |
| `app/services/risk_manager.py`     | 6 pre-trade safety checks + kill switch                       |
| `app/services/broker_factory.py`   | `create_broker()` factory function                            |
| `app/routers/broker.py`            | 13 REST endpoints for broker operations                       |

---

## Known Issues (from Sprint 1)

1. SQLAlchemy required `__allow_unmapped__ = True` fix on base model
2. `.env` had Unicode box-drawing characters causing parse errors (fixed)
3. PostgreSQL password contains `@` — needs URL encoding (`%40`) in DATABASE_URL
4. Old Node.js backend files still exist in `backend/` (server.js, db.js, etc.) — need cleanup

---

## Documentation Rule

**Every time a file is created, updated, or deleted — update `docs/PROJECT_RECORD.md`.**
That file is the master record of every file in the project, what it does, and the full changelog.
