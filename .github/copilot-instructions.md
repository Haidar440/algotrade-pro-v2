# AlgoTrade Pro — Copilot Instructions

> Auto-loaded by GitHub Copilot in every conversation.

---

## Project Overview

AlgoTrade Pro is a **production-grade algorithmic trading platform** for Indian stock markets (NSE/BSE).
Python/FastAPI backend (port 8000) + React/TypeScript frontend (Vite, port 5173).

---

## Tech Stack

| Layer             | Technology                                                     |
| ----------------- | -------------------------------------------------------------- |
| **Backend**       | FastAPI, Python 3.13, Uvicorn (ASGI)                           |
| **Frontend**      | React 18 + TypeScript (Vite), 37 components, 14 services       |
| **Database**      | PostgreSQL (async via asyncpg + SQLAlchemy 2.0)                |
| **AI/ML**         | LangChain + Google Gemini 2.0 Flash + Gemini Search Grounding  |
| **Broker**        | Angel One (smartapi-python), Zerodha (kiteconnect)             |
| **Real-time**     | SmartWebSocketV2 → FastAPI WS `/ws/prices` → browser native WS |
| **Auth**          | JWT (python-jose) + bcrypt + Fernet AES-256 credential vault   |
| **Analysis**      | pandas-ta (130+ indicators), backtesting.py                    |
| **Notifications** | Telegram Bot (python-telegram-bot)                             |

---

## Architecture

```
algotrade-pro/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI entry, lifespan, 9 routers
│   │   ├── config.py               # Pydantic Settings — ONLY env reader
│   │   ├── constants.py            # 13 Enums (zero magic strings)
│   │   ├── database.py             # Async engine + get_db dependency
│   │   ├── models/                 # ORM (base, trade, user, watchlist, instrument, audit)
│   │   │   └── schemas.py          # Pydantic request/response schemas
│   │   ├── routers/                # 9 routers: health auth trades watchlists broker ai backtest telegram websocket
│   │   ├── security/               # vault.py (AES-256), auth.py (JWT)
│   │   ├── services/               # 20 services (broker, AI, backtest, WS, screener)
│   │   └── strategies/             # 6 backtesting strategies
│   ├── scripts/                    # Migration, seed, test, verify scripts
│   ├── .env                        # Secrets (gitignored)
│   └── run.py                      # uvicorn.run(reload=True, port=8000)
├── components/                     # React components (37 files)
├── services/                       # React services (14 files)
├── types.ts                        # Shared TypeScript interfaces
├── App.tsx                         # React root
└── package.json                    # npm run dev → Vite
```

---

## Developer Commands

```bash
# Backend (from backend/)
python run.py                                         # Start API (auto-reload)
python scripts/seed_admin.py                          # Create admin user (admin/admin1234)
python scripts/seed_instruments.py                    # Load Angel One instrument master
python scripts/migrate_add_trade_columns.py           # Add new DB columns
python scripts/scan_hardcoded_secrets.py              # Pre-commit secret scanner

# Frontend (from root)
npm run dev                                           # Vite dev server (port 5173)
```

---

## Critical Data Flow Patterns

### Trade Lifecycle (Paper Trading)

`PaperTradingDashboard` buy form → `DB_SERVICE.saveTrade()` → `POST /api/trades` → PostgreSQL.

- **Trade.type** = `SWING` or `INTRADAY` (from `TradeType` enum — never `PAPER`)
- **Trade.source** = `PAPER`, `MANUAL`, or `AUTO` (from `TradeSource` enum)
- Frontend filters paper trades by `source === 'PAPER'`, NOT `type`

### Frontend → Backend Communication

- `services/api.ts`: `secureGet/securePost/securePut/secureDelete` with JWT from `localStorage`
- `services/db.ts`: `DB_SERVICE` — maps camelCase↔snake_case for trades, watchlists, search
- JWT stored at `localStorage.algoTradePro_jwt`, cleared on 401 via `auth:logout` event

### Symbol Token Resolution (Angel One)

`angel_broker.py._resolve_token()`: 2-tier — instrument DB first → Angel API fallback.
Always use `-EQ` suffix for NSE equities (e.g., `RELIANCE-EQ`).

### Real-time Price Streaming

```
Browser WebSocket → FastAPI /ws/prices → WebSocketManager → SmartWebSocketV2 (Angel One)
```

- `services/streaming.ts`: native WebSocket client, auto-reconnect, multiple callbacks per token
- `backend/app/services/websocket_manager.py`: singleton `ws_manager`, runs upstream in daemon thread
- REST controls: `POST /api/ws/start`, `POST /api/ws/subscribe`, `GET /api/ws/status`

---

## Coding Conventions

1. **Config**: ALL env vars via `app/config.py` Settings class. **No `os.getenv()` anywhere else.**
2. **Constants**: Use Enums from `constants.py` — zero magic strings.
3. **Exceptions**: Custom exceptions from `exceptions.py` with HTTP codes.
4. **Auth**: JWT on every route via `Depends(get_current_user)`. Exceptions: `/api/health`, `/api/auth/login`, `/api/auth/register`, `/api/telegram/webhook`, `/ws/prices`.
5. **Async**: All DB operations use `async def` + `await`. Engine is `create_async_engine`.
6. **ORM**: All models inherit `base.py` (auto `id`, `created_at`, `updated_at`).
7. **Schemas**: Separate `TradeCreate` (input) / `TradeResponse` (output) — never expose internal fields.
8. **Naming**: `snake_case` Python, `camelCase` TypeScript. `db.ts` handles the mapping.
9. **Docstrings**: Every class and public method needs a docstring.
10. **Security**: Broker credentials encrypted via `security/vault.py` (Fernet AES-256).

---

## Key Backend Services

| Service                | Purpose                                              |
| ---------------------- | ---------------------------------------------------- |
| `angel_broker.py`      | Angel One SDK wrapper + `_resolve_token()` DB lookup |
| `websocket_manager.py` | SmartWebSocketV2 upstream + broadcast to frontend WS |
| `technical.py`         | 15+ indicators, mean-reversion-aware signal scoring  |
| `gemini_news.py`       | Gemini + Google Search grounding (replaced Tavily)   |
| `stock_picker.py`      | 10-layer scoring (100 pts) + swing screener          |
| `backtest_engine.py`   | backtesting.py wrapper, 0.2% costs, HTML reports     |
| `data_provider.py`     | Multi-tier: Angel One → yfinance → demo data         |
| `risk_manager.py`      | 6 pre-trade checks, ₹1L max order, kill switch       |

---

## Key Frontend Services

| Service                | Purpose                                            |
| ---------------------- | -------------------------------------------------- |
| `api.ts`               | `secureGet/Post/Put/Delete` with JWT, 401 handling |
| `db.ts`                | `DB_SERVICE` — CRUD for trades/watchlists, search  |
| `angel.ts`             | Angel One client-side SDK wrapper                  |
| `streaming.ts`         | Native WebSocket client for live tick data         |
| `technicalAnalysis.ts` | 17 client-side strategies, BUY/SELL signal engine  |
| `gemini.ts`            | Gemini API for AI analysis + market indices        |

---

## Gotchas & Resolved Issues

- PostgreSQL password with `@` → must URL-encode as `%40` in `DATABASE_URL`
- `create_all()` only creates tables, not new columns → use migration scripts
- SmartAPI SDK has poor type stubs → Pylance warnings in `angel_broker.py` are expected
- `PaperTradingDashboard` polls every 15s only when `isVisible` prop is true
- Frontend auto-reconnects backend broker on mount (in-memory session lost on restart)

---

## Risk Management Limits

| Limit                     | Value     |
| ------------------------- | --------- |
| MAX_ORDER_VALUE           | ₹1,00,000 |
| MAX_DAILY_LOSS            | ₹5,000    |
| MAX_POSITIONS             | 10        |
| MAX_POSITION_SIZE_PERCENT | 20%       |
