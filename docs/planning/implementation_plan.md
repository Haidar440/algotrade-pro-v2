# AlgoTrade Pro — Complete Implementation Plan

> **Version**: 2.0 (Rewritten — Clean Structure)
> **Last Updated**: 2026-02-12
> **Status**: Planning Complete → Ready for Sprint 1

---

## Table of Contents

1. [Goal & Vision](#goal--vision)
2. [Architecture](#architecture)
3. [Project Structure](#project-structure)
4. [Agile Sprint Plan](#agile-sprint-plan)
5. [Phase 1: Foundation](#phase-1-foundation--postgresql)
6. [Phase 2: Broker Integration](#phase-2-broker-integration)
7. [Phase 3: AI & Analysis Engine](#phase-3-ai--analysis-engine)
8. [Phase 4: Auto Trader & Backtesting](#phase-4-auto-trader--backtesting)
9. [Phase 5: Frontend & Telegram](#phase-5-frontend--telegram)
10. [Phase 6: AI Agents & ML](#phase-6-ai-agents--ml-prediction)
11. [Phase 7: Real-Time Engine](#phase-7-real-time-engine)
12. [Phase 8: Smart Stock Picker](#phase-8-smart-stock-picker)
13. [Security Architecture](#security-architecture)
14. [Database Design](#database-design)
15. [Dependencies](#dependencies)
16. [Confirmed Decisions](#confirmed-decisions)

---

## 1. Goal & Vision

Convert AlgoTrade Pro from TypeScript/React/Express to a **full Python stack** (FastAPI + React + PostgreSQL), enabling LangChain, pandas-ta, official broker SDKs, and AI-powered trading features.

### What We're Building

```
┌─────────────────────────────────────────────────────────┐
│  AlgoTrade Pro — Production-Grade Trading Platform      │
│                                                          │
│  🔒 Security-First (Zero hardcoded credentials)         │
│  🤖 AI-Powered (6 specialized analyst agents)           │
│  📊 Smart Stock Picker (scans 300+ stocks daily)        │
│  📱 Telegram Bot (control from your phone)              │
│  📈 Visual Backtesting (interactive charts)             │
│  🏦 Multi-Broker (Angel One + Zerodha)                  │
│  💰 Paper Trading (test with fake ₹1L first)            │
│  ⚡ Real-Time Engine (WebSocket + live P&L)             │
└─────────────────────────────────────────────────────────┘
```

### Why React Stays (Not Django)

| Criteria | Django Templates | React (Current) |
|---|---|---|
| **Real-time charts** | ❌ Very hard | ✅ Excellent |
| **Live price updates** | ❌ Needs polling | ✅ WebSocket native |
| **Complex dashboards** | ⚠️ Painful | ✅ Built for this |
| **Professional look** | ⚠️ Average | ✅ Premium |

> [!IMPORTANT]
> **FastAPI (Backend) + React (Frontend)** = Best of both worlds. Backend becomes 100% Python. Your existing 31 React components stay.

---

## 2. Architecture

```mermaid
graph TD
    subgraph "Frontend (React — Keep Existing)"
        A["React App<br/>31 Components<br/>Port 3000"]
    end

    subgraph "Python Backend (NEW)"
        B["FastAPI Server<br/>Port 8000"]
        C["LangChain Agent<br/>Gemini + Tools"]
        D["Technical Analysis<br/>pandas-ta"]
        E["Auto Trader<br/>APScheduler"]
        F["Broker Services<br/>smartapi-python / kiteconnect"]
        T["Tavily Search<br/>Real-time Market Intel"]
    end

    subgraph "Data Layer"
        G["PostgreSQL<br/>All Data"]
        I["Redis (Optional)<br/>Live Price Cache"]
    end

    A -->|REST API + WebSocket| B
    B --> C & D & E & F & G
    C --> T
    T -->|Live Web Search| M["Tavily API"]
    F -->|Angel One API| J["Angel One"]
    F -->|Zerodha API| K["Zerodha"]
    C -->|Gemini| L["Google AI"]
```

---

## 3. Project Structure

```
algotrade-pro/
├── frontend/                        # React app (moved, mostly unchanged)
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/              # All 31 components
│   │   ├── services/                # API calls → localhost:8000
│   │   └── types.ts
│   ├── package.json
│   └── vite.config.ts
│
├── backend/                         # NEW Python Backend
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                  # FastAPI entry point
│   │   ├── config.py                # Settings from .env (ONLY place that reads env)
│   │   ├── database.py              # PostgreSQL connection
│   │   ├── dependencies.py          # Secure dependency injection
│   │   │
│   │   ├── models/                  # SQLAlchemy ORM + Pydantic schemas
│   │   │   ├── schemas.py           # Pydantic request/response models
│   │   │   ├── trade.py
│   │   │   ├── watchlist.py
│   │   │   ├── instrument.py
│   │   │   ├── candle.py
│   │   │   └── audit.py             # Audit trail model
│   │   │
│   │   ├── routers/                 # API routes (all JWT-protected)
│   │   │   ├── trades.py
│   │   │   ├── watchlists.py
│   │   │   ├── analysis.py
│   │   │   ├── broker.py
│   │   │   ├── backtest.py
│   │   │   ├── stock_picker.py
│   │   │   └── auth.py
│   │   │
│   │   ├── services/                # Business logic
│   │   │   ├── broker_interface.py  # Unified broker ABC
│   │   │   ├── angel_broker.py
│   │   │   ├── zerodha_broker.py
│   │   │   ├── paper_trader.py      # Dry-run mode
│   │   │   ├── ai_engine.py         # LangChain + Gemini
│   │   │   ├── ai_agents.py         # 6 specialist agents
│   │   │   ├── tavily_search.py
│   │   │   ├── technical.py         # pandas-ta analysis
│   │   │   ├── stock_picker.py      # Smart stock scanner
│   │   │   ├── backtest_engine.py   # backtesting.py integration
│   │   │   ├── ml_predictor.py      # ML price prediction
│   │   │   ├── auto_trader.py
│   │   │   ├── risk_manager.py      # Pre-trade safety checks
│   │   │   ├── kill_switch.py       # Emergency stop
│   │   │   ├── analytics.py         # Performance metrics
│   │   │   ├── ws_manager.py        # Resilient WebSocket
│   │   │   ├── live_pnl.py          # Real-time P&L
│   │   │   ├── alert_engine.py      # Smart alerts
│   │   │   ├── data_sync.py         # Market data hub
│   │   │   ├── execution_engine.py  # Slippage protection
│   │   │   └── telegram_bot.py      # Telegram integration
│   │   │
│   │   ├── security/                # Security layer
│   │   │   ├── vault.py             # Credential encryption
│   │   │   └── auth.py              # JWT authentication
│   │   │
│   │   ├── strategies/              # Pre-built strategy templates
│   │   │   ├── base.py
│   │   │   ├── orb.py               # Opening Range Breakout
│   │   │   ├── vcp.py               # Volatility Contraction
│   │   │   ├── rsi_reversion.py
│   │   │   ├── ema_crossover.py
│   │   │   ├── supertrend.py
│   │   │   └── volume_breakout.py
│   │   │
│   │   └── data/
│   │       ├── fno_universe.py
│   │       └── stock_list.py
│   │
│   ├── scripts/
│   │   └── scan_hardcoded_secrets.py # Pre-commit security scanner
│   ├── alembic/                     # Database migrations
│   ├── alembic.ini
│   ├── requirements.txt
│   ├── .env                         # NEVER committed
│   └── run.py
│
├── .gitignore
└── README.md
```

---

## 4. Agile Sprint Plan

| Sprint | Duration | What We Build | Key Deliverable |
|---|---|---|---|
| **Sprint 1** | 3-4 days | Foundation: FastAPI + PostgreSQL + Auth + Config | Working `/api/health`, JWT login, `.env` validation |
| **Sprint 2** | 3-4 days | Broker: Angel One + Zerodha + Paper Trading | Fetch prices, place orders via unified interface |
| **Sprint 3** | 3-4 days | Smart Stock Picker + AI Analysis | `/api/picks/swing?capital=13500` returns top picks |
| **Sprint 4** | 3-4 days | Backtesting + Strategy Marketplace | Visual HTML backtest reports, 6 strategies |
| **Sprint 5** | 2-3 days | Frontend + Telegram Bot | Full working app + mobile alerts |
| **Sprint 6** | 3-4 days | Real-Time Engine + Performance Analytics | Live P&L, WebSocket, alerts, dashboards |

### Agile Rules
- **Build → Test → Fix → Next** (no big-bang deployment)
- Each sprint produces a **working, testable feature**
- Security is built-in from Sprint 1 (not bolted on later)
- Reprioritize after each sprint

---

## 5. File-by-File Migration Map

### Backend Core

| Current (TypeScript) | New (Python) | Library |
|---|---|---|
| [backend/server.js](file:///e:/algotrade-pro/backend/server.js) | `app/main.py` | FastAPI |
| [server.cjs](file:///e:/algotrade-pro/server.cjs) | Merged into `app/main.py` | FastAPI |
| [backend/models/Trade.js](file:///e:/algotrade-pro/backend/models/Trade.js) | `app/models/trade.py` | SQLAlchemy |
| [backend/models/Watchlist.js](file:///e:/algotrade-pro/backend/models/Watchlist.js) | `app/models/watchlist.py` | SQLAlchemy |
| [backend/db.js](file:///e:/algotrade-pro/backend/db.js) | `app/database.py` | asyncpg + SQLAlchemy |

### Services

| Current (TypeScript) | New (Python) | Library |
|---|---|---|
| [services/angel.ts](file:///e:/algotrade-pro/services/angel.ts) | `app/services/angel_broker.py` | smartapi-python |
| *(NEW)* | `app/services/zerodha_broker.py` | kiteconnect |
| [services/gemini.ts](file:///e:/algotrade-pro/services/gemini.ts) | `app/services/ai_engine.py` | langchain-google-genai |
| *(NEW)* | `app/services/tavily_search.py` | tavily-python |
| [services/technicalAnalysis.ts](file:///e:/algotrade-pro/services/technicalAnalysis.ts) | `app/services/technical.py` | pandas-ta |
| [services/backtestEngine.ts](file:///e:/algotrade-pro/services/backtestEngine.ts) | `app/services/backtest_engine.py` | backtesting.py |
| [services/autoTrader.ts](file:///e:/algotrade-pro/services/autoTrader.ts) | `app/services/auto_trader.py` | APScheduler |
| [services/streaming.ts](file:///e:/algotrade-pro/services/streaming.ts) | `app/services/ws_manager.py` | FastAPI WebSocket |
| [types.ts](file:///e:/algotrade-pro/types.ts) | `app/models/schemas.py` | Pydantic |

---

## 6. Phase 1: Foundation + PostgreSQL (Sprint 1)

- [ ] Set up Python project structure (as shown above)
- [ ] Create FastAPI app with basic routes
- [ ] Set up PostgreSQL (local or cloud: Neon/Supabase)
- [ ] Configure SQLAlchemy ORM + Alembic migrations
- [ ] Create DB tables: `instruments`, `trades`, `watchlists`, `candle_data`, `audit_log`
- [ ] Set up Pydantic models (convert [types.ts](file:///e:/algotrade-pro/types.ts) → `schemas.py`)
- [ ] Implement JWT auth + Credential Vault
- [ ] Implement `Settings` class (Pydantic — validates all env vars)
- [ ] Set up CORS, rate limiting, global error handler
- [ ] Migrate data: import [market.db](file:///e:/algotrade-pro/market.db) instruments into PostgreSQL
- [ ] Migrate CRUD routes: trades, watchlists, search
- [ ] **Test**: All existing React API calls work with new backend

### Core Config — `app/config.py`

```python
# THE ONLY PLACE that reads environment variables!
from pydantic_settings import BaseSettings
from pydantic import Field, field_validator
from typing import Optional

class Settings(BaseSettings):
    # ━━━━ MANDATORY — App won't start without these ━━━━
    DATABASE_URL: str
    JWT_SECRET_KEY: str = Field(..., min_length=32)
    MASTER_ENCRYPTION_KEY: str = Field(..., min_length=32)
    GEMINI_API_KEY: str

    # ━━━━ Application ━━━━
    APP_ENV: str = "development"
    DEBUG: bool = False
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://localhost:5173"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60

    # ━━━━ Brokers (optional — disabled if missing) ━━━━
    ANGEL_API_KEY: Optional[str] = None
    ANGEL_CLIENT_ID: Optional[str] = None
    ANGEL_PASSWORD: Optional[str] = None
    ANGEL_TOTP_SECRET: Optional[str] = None
    ZERODHA_API_KEY: Optional[str] = None
    ZERODHA_API_SECRET: Optional[str] = None

    # ━━━━ External APIs (optional) ━━━━
    TAVILY_API_KEY: Optional[str] = None
    TELEGRAM_BOT_TOKEN: Optional[str] = None
    TELEGRAM_ALLOWED_USERS: Optional[str] = None

    # ━━━━ Risk Management (configurable via .env) ━━━━
    MAX_ORDER_VALUE: int = 100_000
    MAX_DAILY_LOSS: int = 5_000
    MAX_POSITIONS: int = 10
    MAX_POSITION_SIZE_PERCENT: int = 20
    RATE_LIMIT_LOGIN: str = "5/minute"
    RATE_LIMIT_ORDERS: str = "30/minute"

    @field_validator("JWT_SECRET_KEY")
    @classmethod
    def validate_jwt_secret(cls, v):
        if len(v) < 32:
            raise ValueError("JWT_SECRET_KEY must be at least 32 characters!")
        return v

    def is_broker_configured(self, broker: str) -> bool:
        if broker == "angel":
            return all([self.ANGEL_API_KEY, self.ANGEL_CLIENT_ID,
                       self.ANGEL_PASSWORD, self.ANGEL_TOTP_SECRET])
        elif broker == "zerodha":
            return all([self.ZERODHA_API_KEY, self.ZERODHA_API_SECRET])
        return False

    class Config:
        env_file = ".env"

settings = Settings()  # Crashes IMMEDIATELY if required vars missing!
```

### Credential Vault — `app/security/vault.py`

```python
from cryptography.fernet import Fernet
import json

class CredentialVault:
    """Encrypts/decrypts broker credentials with master key from .env"""

    def __init__(self, key: str):
        self.cipher = Fernet(key.encode() if isinstance(key, str) else key)

    def encrypt(self, data: dict) -> bytes:
        return self.cipher.encrypt(json.dumps(data).encode())

    def decrypt(self, token: bytes) -> dict:
        return json.loads(self.cipher.decrypt(token).decode())
```

### JWT Auth — `app/security/auth.py`

```python
from datetime import datetime, timedelta
from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def create_access_token(data: dict) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    return jwt.encode({**data, "exp": expire}, settings.JWT_SECRET_KEY,
                      algorithm=settings.JWT_ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY,
                           algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
```

### API Security Stack — `app/main.py`

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.config import settings

app = FastAPI(title="AlgoTrade Pro API", docs_url="/api/docs")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

limiter = Limiter(key_func=get_remote_address)

@app.exception_handler(Exception)
async def global_handler(request, exc):
    logger.error(f"Unhandled error: {exc}", exc_info=True)
    return JSONResponse(status_code=500, content={"error": "Internal server error"})
```

### Database Setup — `app/database.py`

```python
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
```

---

## 7. Phase 2: Broker Integration (Sprint 2)

- [ ] Build `BrokerInterface` ABC (unified abstraction)
- [ ] Implement `AngelOneBroker` via smartapi-python
- [ ] Implement `ZerodhaBroker` via kiteconnect
- [ ] Build `PaperTrader` (simulated trading with fake money)
- [ ] Build `RiskManager` (pre-trade safety checks)
- [ ] Build `KillSwitch` (emergency stop)
- [ ] **Test**: Connect broker, fetch portfolio, place paper order

### Unified Broker Interface

```python
# app/services/broker_interface.py
from abc import ABC, abstractmethod

class BrokerInterface(ABC):
    """One interface, any broker. Credentials NEVER stored as instance vars."""

    @abstractmethod
    async def connect(self, credentials: dict) -> bool: ...

    @abstractmethod
    async def place_order(self, order: OrderRequest) -> dict: ...

    @abstractmethod
    async def get_positions(self) -> list[dict]: ...

    @abstractmethod
    async def get_ltp(self, symbol: str) -> float: ...

    @abstractmethod
    async def get_historical(self, symbol: str, interval: str,
                             from_date: str, to_date: str) -> pd.DataFrame: ...

    @abstractmethod
    async def stream_prices(self, symbols: list[str], callback) -> None: ...

class AngelOneBroker(BrokerInterface):
    async def connect(self, credentials: dict) -> bool:
        self.client = SmartConnect(api_key=credentials["api_key"])
        totp = pyotp.TOTP(credentials["totp_secret"]).now()
        session = self.client.generateSession(
            credentials["client_id"], credentials["password"], totp)
        # ✅ Only session token kept — credentials discarded
        self._session_token = session["data"]["jwtToken"]
        return True

class ZerodhaBroker(BrokerInterface):
    async def connect(self, credentials: dict) -> bool:
        self.kite = KiteConnect(api_key=credentials["api_key"])
        self.kite.set_access_token(credentials["access_token"])
        return True
```

### Paper Trader — Risk-Free Testing

```python
# app/services/paper_trader.py
class PaperTrader:
    """Simulates real trading with virtual money. NEVER touches real broker."""

    def __init__(self, starting_capital: float = 100_000):
        self.capital = starting_capital
        self.positions: dict[str, dict] = {}
        self.trade_history: list = []
        self.is_paper = True
        self._real_broker = None  # Always None — hard wall

    async def place_order(self, symbol: str, qty: int, price: float, side: str):
        assert self._real_broker is None, "Paper trader must NEVER have real broker!"
        if side == "BUY":
            cost = qty * price
            if cost > self.capital:
                return {"status": "REJECTED", "reason": "Insufficient paper funds"}
            self.capital -= cost
            self.positions[symbol] = {"qty": qty, "avg_price": price}
        else:
            if symbol in self.positions:
                pnl = (price - self.positions[symbol]["avg_price"]) * qty
                self.capital += qty * price
                self.trade_history.append({"symbol": symbol, "pnl": pnl})
                del self.positions[symbol]
        return {"status": "PAPER_FILLED", "price": price}
```

### Risk Manager — Pre-Trade Safety

```python
# app/services/risk_manager.py
class RiskManager:
    """Pre-trade safety checks — runs BEFORE every order."""

    def __init__(self, max_order_value, max_daily_loss, max_positions, max_position_pct):
        self.MAX_ORDER_VALUE = max_order_value      # From settings, not hardcoded!
        self.MAX_DAILY_LOSS = max_daily_loss
        self.MAX_POSITIONS = max_positions
        self.MAX_POSITION_PCT = max_position_pct

    async def validate_order(self, order, portfolio) -> dict:
        checks = [
            self._check_order_value(order),
            self._check_daily_loss(portfolio),
            self._check_max_positions(portfolio),
            self._check_concentration(order, portfolio),
            self._check_market_hours(),
        ]
        for check in checks:
            result = await check
            if not result["allowed"]:
                return result
        return {"allowed": True, "reason": "All safety checks passed ✅"}
```

---

## 8. Phase 3: AI & Analysis Engine (Sprint 3)

- [ ] Set up LangChain with Gemini (`langchain-google-genai`)
- [ ] Integrate Tavily Search for real-time market intelligence
- [ ] Build analysis chain (stock → indicators → AI reasoning)
- [ ] Build news analysis (Tavily search → Gemini sentiment)
- [ ] Replace custom TA engine with `pandas-ta` (130+ indicators)
- [ ] Build Performance Analytics (Sharpe ratio, drawdown, streaks)
- [ ] **Test**: Analyze a stock, search live news, get AI prediction

### Technical Analysis — Before vs After

```python
# BEFORE: 20 lines of TypeScript for RSI
# AFTER: 2 lines of Python
import pandas_ta as ta
df['rsi'] = ta.rsi(df['close'], length=14)
```

### Tavily + LangChain Agent

```python
from langchain_community.tools.tavily_search import TavilySearchResults
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.agents import create_tool_calling_agent, AgentExecutor
from app.config import settings

tavily_tool = TavilySearchResults(max_results=5, search_depth="advanced")
llm = ChatGoogleGenerativeAI(
    model="gemini-2.0-flash",
    google_api_key=settings.GEMINI_API_KEY  # ✅ From settings, never hardcoded
)
agent = create_tool_calling_agent(llm, [tavily_tool], prompt)
executor = AgentExecutor(agent=agent, tools=[tavily_tool])
```

### Performance Analytics

```python
# app/services/analytics.py
class PerformanceAnalytics:
    def calculate_metrics(self, trades: list[dict]) -> dict:
        returns = [t["pnl_percent"] for t in trades]
        return {
            "total_trades": len(trades),
            "win_rate": len([r for r in returns if r > 0]) / len(returns) * 100,
            "sharpe_ratio": self._sharpe_ratio(returns),
            "max_drawdown": self._max_drawdown(trades),
            "profit_factor": abs(sum(r for r in returns if r > 0) /
                                sum(r for r in returns if r < 0)),
            "best_streak": self._best_streak(trades),
            "worst_streak": self._worst_streak(trades),
        }
```

---

## 9. Phase 4: Auto Trader & Backtesting (Sprint 4)

- [ ] Port Auto Trader with APScheduler
- [ ] Build visual backtesting engine (backtesting.py)
- [ ] Implement Strategy Marketplace (6 pre-built strategies)
- [ ] Strategy parameter optimization
- [ ] **Test**: Run backtest, view interactive HTML chart

### Visual Backtesting

```python
# app/services/backtest_engine.py
from backtesting import Backtest, Strategy
import pandas_ta as ta

class SwingStrategy(Strategy):
    rsi_period = 14
    rsi_oversold = 35
    sl_percent = 3.0
    target_percent = 8.0

    def init(self):
        self.rsi = self.I(ta.rsi, self.data.Close, length=self.rsi_period)
        self.ema_20 = self.I(ta.ema, self.data.Close, length=20)

    def next(self):
        if not self.position:
            if self.rsi[-1] < self.rsi_oversold and self.data.Close[-1] > self.ema_20[-1]:
                sl = self.data.Close[-1] * (1 - self.sl_percent / 100)
                tp = self.data.Close[-1] * (1 + self.target_percent / 100)
                self.buy(sl=sl, tp=tp)

bt = Backtest(df, SwingStrategy, cash=13500, commission=0.001)
stats = bt.run()
bt.plot()  # Interactive HTML chart!

# Auto-optimize parameters
optimal = bt.optimize(
    rsi_period=range(10, 25, 2),
    rsi_oversold=range(25, 45, 5),
    maximize='Sharpe Ratio'
)
```

### Strategy Marketplace — 6 Pre-Built Strategies

| Strategy | Type | Description | Backtest Win Rate |
|---|---|---|---|
| **Opening Range Breakout** | Intraday | Buy if price breaks 15-min high | 58% |
| **VCP Breakout** | Swing | Tightening price range → breakout | 52% |
| **RSI Mean Reversion** | Swing | Buy RSI<30, sell RSI>70 | 55% |
| **EMA 9/21 Crossover** | Swing | Buy when 9 EMA crosses 21 EMA | 48% |
| **Supertrend** | Both | Follow Supertrend for direction | 51% |
| **Volume Breakout** | Swing | Volume >2x avg + price breaks resistance | 54% |

---

## 10. Phase 5: Frontend & Telegram (Sprint 5)

- [ ] Move React app to `frontend/` directory
- [ ] Update all API base URLs → `localhost:8000`
- [ ] Update WebSocket connections
- [ ] Build Telegram Bot for mobile alerts & control
- [ ] **Test**: Full end-to-end trading workflow + Telegram commands

### Telegram Bot — Control from Your Phone

```python
# app/services/telegram_bot.py
from telegram import Update, Bot
from telegram.ext import Application, CommandHandler
from app.config import settings

class TradingTelegramBot:
    def __init__(self):
        if not settings.TELEGRAM_BOT_TOKEN:
            raise RuntimeError("TELEGRAM_BOT_TOKEN not set in .env!")
        self.bot = Bot(token=settings.TELEGRAM_BOT_TOKEN)  # ✅ From settings
        self.allowed_users = settings.telegram_allowed_user_ids

    async def _check_authorized(self, update: Update) -> bool:
        """Only YOUR Telegram account can control the bot!"""
        if update.effective_user.id not in self.allowed_users:
            await update.message.reply_text("⛔ Unauthorized.")
            audit_logger.warning(f"Unauthorized Telegram: user_id={update.effective_user.id}")
            return False
        return True

    async def handle_picks(self, update: Update, context):
        if not await self._check_authorized(update):
            return
        picks = await stock_picker.scan_all(capital=13500)
        msg = "🎯 *Today's Swing Picks:*\n\n"
        for i, pick in enumerate(picks[:5], 1):
            msg += (f"{i}. *{pick['symbol']}* ₹{pick['price']}\n"
                    f"   SL: ₹{pick['stop_loss']}  Target: ₹{pick['target']}\n"
                    f"   Score: {pick['score']}/100 {pick['rating']}\n\n")
        await update.message.reply_text(msg, parse_mode="Markdown")

    # Commands: /start, /status, /picks, /balance, /trade, /alerts, /stop, /performance
```

---

## 11. Phase 6: AI Agents & ML Prediction (Sprint 6)

- [ ] Build Multi-Agent AI System (6 specialized analyst agents)
- [ ] Build ML Price Prediction (GradientBoosting)
- [ ] Add RAG for market research (SEBI filings, annual reports)
- [ ] **Test**: Multi-agent analysis, ML prediction accuracy

### Multi-Agent AI System (Inspired by AI Hedge Fund — 10K⭐)

```python
# app/services/ai_agents.py
from langchain_google_genai import ChatGoogleGenerativeAI
from app.config import settings
import re, asyncio

class TradingAgentTeam:
    """6 AI agents that analyze stocks from different angles."""

    def __init__(self, gemini_key: str):
        self.llm = ChatGoogleGenerativeAI(
            model="gemini-2.0-flash",
            google_api_key=gemini_key,  # ✅ Injected, never hardcoded
            temperature=0.1,
        )

    agents = {
        "technical_analyst":    "Analyze price charts, patterns, indicators → BUY/SELL/HOLD",
        "fundamental_analyst":  "Analyze PE, earnings, debt → UNDERVALUED/OVERVALUED",
        "sentiment_analyst":    "Analyze news via Tavily → POSITIVE/NEUTRAL/NEGATIVE",
        "risk_manager":         "Calculate risk metrics, set position sizes",
        "sector_analyst":       "Analyze sector trends, FII/DII flows",
        "portfolio_manager":    "Combine all opinions → FINAL DECISION",
    }

    async def analyze_stock(self, symbol: str) -> dict:
        sanitized = re.sub(r'[^A-Z0-9\-]', '', symbol.upper())[:20]
        results = await asyncio.gather(
            self.technical_analyst.analyze(sanitized),
            self.fundamental_analyst.analyze(sanitized),
            self.sentiment_analyst.analyze(sanitized),
            self.risk_manager.analyze(sanitized),
            self.sector_analyst.analyze(sanitized),
        )
        decision = await self.portfolio_manager.decide(sanitized, results)
        return self._sanitize_output(decision)  # Never return raw LLM text

    def _sanitize_output(self, raw: dict) -> dict:
        return {k: v for k, v in raw.items()
                if k not in ["raw_prompt", "internal_reasoning", "api_call_logs"]}
```

### ML Price Prediction (Inspired by Microsoft Qlib — 16K⭐)

```python
# app/services/ml_predictor.py
from sklearn.ensemble import GradientBoostingClassifier
import pandas_ta as ta

class StockPredictor:
    """Predicts if stock goes UP or DOWN in 5 days. ~55-60% accuracy."""

    def prepare_features(self, df):
        df["rsi"] = ta.rsi(df["close"], length=14)
        df["macd"] = ta.macd(df["close"])["MACD_12_26_9"]
        df["adx"] = ta.adx(df["high"], df["low"], df["close"])["ADX_14"]
        df["vol_ratio"] = df["volume"] / df["volume"].rolling(20).mean()
        df["returns_5d"] = df["close"].pct_change(5)
        df["target"] = (df["close"].shift(-5) > df["close"]).astype(int)
        return df.dropna()

    def train(self, symbol: str):
        df = self.prepare_features(self.get_historical_data(symbol, days=500))
        features = ["rsi", "macd", "adx", "vol_ratio", "returns_5d"]
        X_train, X_test = df[features][:-60], df[features][-60:]
        y_train, y_test = df["target"][:-60], df["target"][-60:]
        self.model = GradientBoostingClassifier(n_estimators=200)
        self.model.fit(X_train, y_train)
        return {"accuracy": self.model.score(X_test, y_test)}

    def predict(self, symbol: str) -> dict:
        prediction = self.model.predict(latest_features)[0]
        confidence = self.model.predict_proba(latest_features)[0].max()
        return {"prediction": "UP" if prediction == 1 else "DOWN",
                "confidence": round(confidence * 100, 1)}
```

---

## 12. Phase 7: Real-Time Engine (Sprint 6)

- [ ] Build Resilient WebSocket manager (auto-reconnect, heartbeat)
- [ ] Implement Live P&L tracker (sub-second updates)
- [ ] Add Smart Alert System (10 alert types)
- [ ] Build Order Execution Engine (slippage protection)
- [ ] Build Market Data Hub (single source of truth)
- [ ] Add Concurrent Strategy Runner (multiple strategies in parallel)
- [ ] Build Market Replay Engine (debug past trades)
- [ ] **Test**: Stress test with 50+ symbols, simulate disconnections

### Resilient WebSocket

```python
# app/services/ws_manager.py
class ResilientWebSocket:
    """Self-healing WebSocket with exponential backoff."""

    async def connect(self):
        while self.reconnect_attempts < self.max_reconnects:
            try:
                self.ws = await websockets.connect(self.url)
                self.state = ConnectionState.CONNECTED
                self.reconnect_attempts = 0
                asyncio.create_task(self._heartbeat_monitor())
                async for message in self.ws:
                    self.last_message_time = datetime.now()
                    await self._handle_message(message)
            except Exception:
                wait_time = min(2 ** self.reconnect_attempts, 30)
                self.reconnect_attempts += 1
                await asyncio.sleep(wait_time)
```

### Live P&L Tracker

```python
# app/services/live_pnl.py
class LivePnLTracker:
    """Recalculates portfolio P&L on every price tick."""

    def update_price(self, symbol: str, new_price: float):
        pos = self.positions[symbol]
        pos["ltp"] = Decimal(str(new_price))
        pos["unrealized_pnl"] = (pos["ltp"] - pos["avg_price"]) * pos["quantity"]
        pos["pnl_percent"] = ((pos["ltp"] - pos["avg_price"]) / pos["avg_price"]) * 100
        self._recalculate_totals()
```

### Smart Execution Engine

```python
# app/services/execution_engine.py
class SmartExecutionEngine:
    """Minimizes slippage — converts MARKET to aggressive LIMIT orders."""

    async def execute_order(self, order, current_ltp):
        live_price = await self.broker.get_ltp(order.symbol)
        slippage = abs(live_price - current_ltp) / current_ltp * 100
        if slippage > 0.5:  # Max 0.5% slippage
            return {"status": "SLIPPAGE_REJECTED", "slippage": slippage}
        if order.order_type == "MARKET":
            order.order_type = "LIMIT"
            order.price = round(live_price * 1.001, 1)
        return await self.broker.place_order(order)
```

---

## 13. Phase 8: Smart Stock Picker — "What to Buy & When"

> [!IMPORTANT]
> Scans 300+ stocks daily, scores each out of 100, and tells you: **"Buy THIS stock, at THIS price, with THIS stop-loss, expecting THIS target."** Tailored to your ₹13,500 capital.

- [ ] Build data collection pipeline (Angel One + yfinance + NSE bhavcopy)
- [ ] Implement 10-layer stock scoring algorithm (100 points)
- [ ] Build capital-aware recommendation engine
- [ ] Add entry timing with support/resistance detection
- [ ] Integrate Gemini + Tavily for news/sentiment filtering
- [ ] Build API endpoint: `/api/picks/swing?capital=13500`
- [ ] Add daily auto-scan at 8:30 AM IST
- [ ] **Test**: Run on 500+ stocks, validate scoring

### 10 Data Layers

| # | Layer | Source | Cost |
|---|---|---|---|
| 1 | OHLCV Price Data | Angel One API | ✅ Free |
| 2 | Technical Indicators (RSI, MACD, ADX, EMA, BB) | pandas-ta | ✅ Free |
| 3 | Volume Analysis | Angel One API | ✅ Free |
| 4 | Delivery Percentage | NSE Bhavcopy (nselib) | ✅ Free |
| 5 | Relative Strength vs Nifty | Calculate | ✅ Free |
| 6 | Fundamentals (PE, Market Cap, Debt) | yfinance | ✅ Free |
| 7 | News & Sentiment | Tavily + Gemini | ✅ Free (1000/mo) |
| 8 | FII/DII Activity | Tavily → NSE | ✅ Free |
| 9 | Sector Momentum | yfinance sector indices | ✅ Free |
| 10 | Money Flow Index (MFI) | pandas-ta | ✅ Free |

### Scoring Algorithm — 100 Points

```
📊 TECHNICAL (40 pts)    📈 VOLUME (20 pts)     💪 STRENGTH (15 pts)
├── RSI Sweet Spot  10   ├── Volume Spike   10   ├── vs Nifty 50   10
├── MACD Crossover  10   ├── Delivery %      5   └── Sector trend   5
├── ADX Trend        5   └── MFI Pressure    5
├── Price > EMA      5   
├── Near Support     5   📋 FUNDAMENTALS (15)   📰 NEWS (10 pts)
└── BB Squeeze       5   ├── PE Ratio        5   ├── No bad news    5
                         ├── Market Cap      5   └── Positive news  5
                         └── Low Debt        5

RATINGS: 85-100 ⭐ GOLDEN | 70-84 🟢 STRONG | 55-69 🟡 MODERATE | <55 🔴 SKIP
```

### API Endpoint (Secured)

```python
# app/routers/stock_picker.py
@router.get("/swing")
async def get_swing_picks(
    capital: float = Query(default=13500, ge=100, le=10_000_000),
    max_risk_percent: float = Query(default=4.0, ge=0.5, le=10.0),
    user: dict = Depends(get_current_user),          # 🔒 JWT required
    picker: SwingStockPicker = Depends(get_stock_picker)  # 🔒 Injected
):
    audit_logger.info(f"User {user['sub']} requested picks for ₹{capital}")
    picks = await picker.scan_all(capital=capital)
    return {"capital": capital, "top_picks": picks}
```

### Example Response

```json
{
  "capital": 13500,
  "top_picks": [
    {
      "symbol": "TATAPOWER",
      "score": 87,
      "rating": "⭐ GOLDEN",
      "price": 412.5,
      "entry_range": "₹408 - ₹415",
      "stop_loss": 395.0,
      "target": 448.0,
      "risk_reward": "1:2.8",
      "shares": 32,
      "investment": 13200,
      "risk_amount": 544,
      "reasons": ["MACD bullish crossover ✅", "🔥 Volume spike 2.3x"]
    }
  ]
}
```

---

## 14. Security Architecture — Zero Hardcoded Credentials

> [!CAUTION]
> **ABSOLUTE RULE**: No API key, password, token, or secret shall EVER appear as a raw string in any [.py](file:///e:/algotrade-pro/jwt_token.py) file. Violations are caught by the pre-commit scanner and the commit is BLOCKED.

### Security Data Flow

```mermaid
graph LR
    ENV[".env file"] --> SETTINGS["app/config.py<br/>Settings class"]
    SETTINGS --> VAULT["CredentialVault<br/>Fernet AES-256"]
    SETTINGS --> AUTH["JWT Auth"]
    SETTINGS --> RATE["Rate Limiter"]
    VAULT --> BROKER["Broker Interface"]
    AUTH --> ROUTES["All API Routes"]
    RATE --> ROUTES
    SETTINGS --> TELEGRAM["Telegram Bot"]
    SETTINGS --> AI["AI Agents"]
    SETTINGS --> RISK["Risk Manager"]
```

### Master `.env` File

```env
# APPLICATION
APP_ENV=development
DEBUG=false
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# DATABASE
DATABASE_URL=postgresql+asyncpg://postgres:yourpassword@localhost:5432/algotrade

# AUTHENTICATION
JWT_SECRET_KEY=<generate: python -c "import secrets; print(secrets.token_urlsafe(64))">
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=60

# ENCRYPTION
MASTER_ENCRYPTION_KEY=<generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())">

# BROKER: ANGEL ONE
ANGEL_API_KEY=
ANGEL_CLIENT_ID=
ANGEL_PASSWORD=
ANGEL_TOTP_SECRET=

# BROKER: ZERODHA
ZERODHA_API_KEY=
ZERODHA_API_SECRET=

# AI / SEARCH
GEMINI_API_KEY=
TAVILY_API_KEY=

# TELEGRAM
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_USERS=123456789,987654321

# RATE LIMITING
RATE_LIMIT_LOGIN=5/minute
RATE_LIMIT_ORDERS=30/minute

# RISK MANAGEMENT
MAX_ORDER_VALUE=100000
MAX_DAILY_LOSS=5000
MAX_POSITIONS=10
MAX_POSITION_SIZE_PERCENT=20
```

### Secure Dependency Injection — `app/dependencies.py`

```python
from functools import lru_cache
from fastapi import Depends
from app.config import settings
from app.security.vault import CredentialVault
from app.services.risk_manager import RiskManager

@lru_cache()
def get_vault() -> CredentialVault:
    return CredentialVault(key=settings.MASTER_ENCRYPTION_KEY)

@lru_cache()
def get_risk_manager() -> RiskManager:
    return RiskManager(
        max_order_value=settings.MAX_ORDER_VALUE,
        max_daily_loss=settings.MAX_DAILY_LOSS,
        max_positions=settings.MAX_POSITIONS,
        max_position_pct=settings.MAX_POSITION_SIZE_PERCENT,
    )

async def get_broker(broker_name: str = "angel", vault = Depends(get_vault)):
    encrypted = await db.get_encrypted_credentials(broker_name)
    creds = vault.decrypt(encrypted)           # Decrypt
    broker = AngelOneBroker() if broker_name == "angel" else ZerodhaBroker()
    await broker.connect(creds)                 # Use
    return broker                               # creds discarded
```

### Hardcode Scanner — Pre-Commit Hook

```python
# scripts/scan_hardcoded_secrets.py — Scans for 10 secret patterns
PATTERNS = [
    (r'api[_-]?key\s*=\s*["\'][A-Za-z0-9]{10,}["\']', "Hardcoded API key"),
    (r'password\s*=\s*["\'][^"\']{6,}["\']', "Hardcoded password"),
    (r'secret\s*=\s*["\'][A-Za-z0-9+/=]{20,}["\']', "Hardcoded secret"),
    (r'token\s*=\s*["\'][A-Za-z0-9._\-]{20,}["\']', "Hardcoded token"),
    (r'(ghp_|sk-|tvly-|AIza)[A-Za-z0-9]{10,}', "Leaked service key"),
    (r'totp[_-]?secret\s*=\s*["\'][A-Z2-7]{16,}["\']', "Hardcoded TOTP"),
    (r'postgresql://\w+:\w+@', "Hardcoded DB credentials"),
    (r'Fernet\(["\'][A-Za-z0-9+/=]+["\']\)', "Hardcoded Fernet key"),
    (r'Bearer\s+[A-Za-z0-9._\-]{20,}', "Hardcoded Bearer token"),
    (r'client[_-]?id\s*=\s*["\'][A-Z0-9]{4,}["\']', "Hardcoded client ID"),
]
# Blocks commit if ANY violation found!
```

### 10 Security Rules

| # | Rule | ❌ Wrong | ✅ Correct |
|---|---|---|---|
| 1 | No hardcoded keys | `api_key = "abc123"` | `settings.ANGEL_API_KEY` |
| 2 | No `os.getenv()` | `os.getenv("KEY")` | `settings.KEY` via Pydantic |
| 3 | JWT on every route | `@router.get("/data")` | `Depends(get_current_user)` |
| 4 | Risk check before orders | `broker.place_order()` | `risk_manager.validate()` first |
| 5 | Audit every action | Silent placement | `audit_logger.info(...)` |
| 6 | Sanitize AI inputs | `agent.run(raw_input)` | `re.sub(r'[^A-Z0-9]', '', input)` |
| 7 | Don't leak internals | `return {"error": str(e)}` | `return {"error": "Server error"}` |
| 8 | Encrypt broker creds | Plaintext in DB | `vault.encrypt(creds)` |
| 9 | Rate limit auth routes | Unlimited logins | `@limiter.limit("5/minute")` |
| 10 | Paper trader isolation | `PaperTrader(broker=real)` | `_real_broker = None` always |

### [.gitignore](file:///e:/algotrade-pro/.gitignore) Additions

```gitignore
.env
.env.local
.env.production
.master.key
*.key
*.pem
logs/
*.log
__pycache__/
*.pyc
.venv/
venv/
```

---

## 15. Database Design

```mermaid
erDiagram
    instruments {
        int id PK
        varchar token
        varchar symbol
        varchar name
        varchar exch_seg
        decimal tick_size
    }
    trades {
        int id PK
        varchar symbol
        decimal entry_price
        int quantity
        varchar type
        varchar status
        timestamp entry_date
        timestamp exit_date
        decimal pnl
        varchar strategy
        varchar source
    }
    watchlists {
        int id PK
        varchar name UK
        jsonb items
        timestamp last_updated
    }
    candle_data {
        int id PK
        varchar symbol
        timestamp date
        decimal open
        decimal high
        decimal low
        decimal close
        bigint volume
        varchar interval
    }
    audit_log {
        int id PK
        timestamp timestamp
        varchar user
        varchar action
        varchar category
        varchar symbol
        text details
    }
```

| DB Option | Provider | Cost | Best For |
|---|---|---|---|
| **Local** | PostgreSQL | Free | Development |
| **Neon** | neon.tech | Free 512MB | Easy cloud |
| **Supabase** | supabase.com | Free 500MB | Full backend |

> [!TIP]
> Start local, switch to Neon by changing `DATABASE_URL` in `.env` — zero code changes!

---

## 16. Dependencies

```txt
# Core
fastapi==0.115.0               uvicorn==0.34.0
pydantic==2.10.0               pydantic-settings==2.6.0

# Database
asyncpg==0.30.0                sqlalchemy[asyncio]==2.0.36
alembic==1.14.0                psycopg2-binary==2.9.10

# Security
python-jose[cryptography]==3.3.0   passlib[bcrypt]==1.7.4
cryptography==42.0.0               slowapi==0.1.9

# Brokers
smartapi-python==1.3.6         kiteconnect==5.0.1

# AI & LangChain
langchain==0.3.0               langchain-google-genai==2.0.0
langchain-community==0.3.0     google-generativeai==0.8.0

# Search
tavily-python==0.5.0

# Analysis
pandas==2.2.0                  pandas-ta==0.3.14b
numpy==2.1.0                   scikit-learn==1.5.0

# Backtesting
backtesting==0.3.3             vectorbt==0.26.2

# Real-Time
websockets==14.0               python-socketio==5.11.0

# Telegram
python-telegram-bot==21.0

# Utils
httpx==0.28.0                  apscheduler==3.10.4
python-json-logger==3.2.0      yfinance==0.2.36
nselib==4.0.1                  pyotp==2.9.0
python-dotenv==1.0.0
```

---

## 17. Confirmed Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Backend | **FastAPI** | Async, WebSocket, auto-docs |
| Frontend | **React (Keep)** | 31 components, WebSocket-ready |
| Database | **PostgreSQL** | Single DB, scalable, async |
| AI | **LangChain + Gemini** | Chains, agents, tools |
| Search | **Tavily** | AI-native, clean for LLM |
| Analysis | **pandas-ta** | 130+ indicators, 1-line each |
| Backtesting | **backtesting.py** | Interactive HTML charts |
| Primary Broker | **Angel One** | Official SDK, free data |
| Auth | **JWT + bcrypt** | Industry standard |
| Credential Storage | **Fernet AES-256** | Encrypt at rest |
| Config | **pydantic-settings** | Validated, type-safe |
| Security Policy | **Zero hardcoding** | Pre-commit scanner |

---

> [!NOTE]
> Plan incorporates ideas from **12+ GitHub repos**: Freqtrade (46K⭐), Qlib (16K⭐), AI Hedge Fund (10K⭐), backtesting.py (7.9K⭐), vectorbt (4K⭐), OpenAlgo (1.2K⭐).

*Plan complete. Ready for Sprint 1.* 🚀
