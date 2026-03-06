# AlgoTrade Pro — Developer Code Guide

> **Last Updated:** 2026-03-06  
> **For:** Developers who want to read, understand, and modify this codebase  
> **Stack:** Python 3.11+ · FastAPI · PostgreSQL · Gemini 2.5 Flash + Google Search · TradingView Screener · backtesting.py  
> **Status:** Sprints 1-5.5 complete + Post-Sprint AI Overhaul (out of 6)

---

## 🧠 What This Project Does (30-Second Version)

AlgoTrade Pro is an **AI-powered algorithmic trading platform** for Indian stock markets (NSE/BSE). It lets you:

1. **Connect to real brokers** (Angel One, Zerodha) or trade on paper
2. **Get AI-powered stock analysis** — Gemini AI reads 15+ technical indicators and gives BUY/SELL/HOLD
3. **Scan for stock picks** — 10-layer scoring algorithm ranks stocks, sets entry/SL/target
4. **Backtest strategies** — 6 research-backed strategies on real market data with Indian cost modeling
5. **Manage risk** — kill switch, max position size, daily loss limits, market hours check

---

## 🏗️ Architecture — How Everything Connects

```
                                    ┌─────────────────────┐
                                    │      Frontend       │
                                    │   React + Vite      │
                                    │ (Sprint 5: connect) │
                                    └────────┬────────────┘
                                             │ HTTP/REST
                                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                    FastAPI Application (main.py)                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ Middleware│ │   CORS   │ │Rate Limit│ │Error Wrap│           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│                                                                  │
│  ┌────────────────────── ROUTERS ─────────────────────────┐     │
│  │ /api/health  │ /api/auth  │ /api/trades  │ /api/broker │     │
│  │ /api/watchlists │ /api/ai │ /api/backtest │ /api/telegram            │     │
│  └───────────┬───────────────────────────────────────────┘      │
│              │ Depends(get_current_user) ← JWT auth             │
│              ▼                                                   │
│  ┌────────────────────── SERVICES ────────────────────────┐     │
│  │ BrokerInterface  ← AngelOneBroker / ZerodhaBroker /    │     │
│  │                     PaperTrader                         │     │
│  │ RiskManager       ← 6 pre-trade checks                 │     │
│  │ TechnicalAnalyzer ← 15+ indicators (pandas-ta)         │     │
│  │ AIEngine          ← LangChain + Gemini 2.5 Flash       │     │
│  │ GeminiNewsService ← Gemini + Google Search grounding                     │     │
│  │ SwingScreener      ← TradingView API (dynamic NSE scan) │     │
│  │ StockPicker        ← 10 real yfinance scoring dims        │     │
│  │ PerformanceAnalytics ← Sharpe, drawdown, streaks       │     │
│  │ DataProvider       ← Angel → yfinance → demo data      │     │
│  │ BacktestEngine     ← backtesting.py + 6 strategies     │     │
│  └───────────┬────────────────────────────────────────────┘     │
│              ▼                                                   │
│  ┌────────────── DATA LAYER ──────────────┐                     │
│  │ PostgreSQL (async) ← SQLAlchemy 2.0    │                     │
│  │ 6 ORM models: Trade, Watchlist, User,        │                     │
│  │   Instrument, AuditLog, BaseModel      │                     │
│  │ Vault: Fernet AES-256 encryption       │                     │
│  └────────────────────────────────────────┘                     │
└──────────────────────────────────────────────────────────────────┘
```

---

## 📁 File-by-File Reference

### Core Application Files (`app/`)

| File | What It Does | Key Exports |
|------|-------------|-------------|
| `main.py` | **Entry point.** Creates FastAPI app, wires 8 routers, sets up lifespan (startup/shutdown) | `app`, `lifespan()` |
| `config.py` | **Only file that reads `.env`.** Pydantic Settings validates all env vars at startup. Crashes if invalid | `settings` (singleton) |
| `constants.py` | **15 Enums.** Zero magic strings anywhere. BrokerName, Exchange, OrderSide, OrderType, Signal, etc. | All enum classes |
| `exceptions.py` | **11 custom exceptions** with HTTP codes. `NotFoundError(404)`, `UnauthorizedError(401)`, etc. | Exception classes |
| `logging_config.py` | **4 log handlers:** console, `app.log`, `errors.log`, `trades.log`. All with rotation | `setup_logging()` |
| `database.py` | **Async PostgreSQL.** SQLAlchemy 2.0 engine, 10+20 connection pool, `get_db()` dependency | `init_db()`, `close_db()`, `get_db()` |
| `middleware.py` | **CORS + SlowAPI rate limiter + request ID + response timing + error handlers** | `setup_middleware()`, `setup_exception_handlers()` |
| `dependencies.py` | **DI container.** Cached vault singleton, DB session injection | `get_vault()` |

---

### Security (`app/security/`)

| File | What It Does | Key Functions |
|------|-------------|---------------|
| `auth.py` | **JWT auth + password hashing.** bcrypt + HS256 tokens. 60min expiry | `create_access_token()`, `decode_access_token()`, `get_current_user()`, `hash_password()`, `verify_password()` |
| `vault.py` | **Fernet AES-256 encryption** for broker credentials. Never stores plaintext | `encrypt()`, `decrypt()` |

**How auth works:**
```
User → POST /api/auth/login (username, password)
       → verify_password(input, db_hash)
       → create_access_token(user_id)
       → Returns JWT token

User → GET /api/broker/status (Authorization: Bearer <token>)
       → get_current_user() ← Depends(oauth2_scheme)
       → decode_access_token(token) → payload
       → Route handler runs with user context
```

---

### ORM Models (`app/models/`)

| File | ORM Class | Table | Key Columns |
|------|-----------|-------|-------------|
| `base.py` | `BaseModel` (abstract) | — | `id` (UUID), `created_at`, `updated_at` |
| `trade.py` | `Trade` | `trades` | symbol, side, qty, price, status, pnl, broker |
| `watchlist.py` | `Watchlist` | `watchlists` | name, items (JSONB array), user_id |
| `instrument.py` | `Instrument` | `instruments` | symbol, exchange, token, lot_size |
| `audit.py` | `AuditLog` | `audit_logs` | action, category, details, user_id |
| `schemas.py` | 32 Pydantic schemas | — | Request/response validation |

All ORM models use SQLAlchemy 2.0's `Mapped[]` + `mapped_column()` syntax.

---

### API Routers (`app/routers/`) — 32 Total Endpoints

#### `health.py` — 1 endpoint (public)
| Method | URL | Auth | What It Does |
|--------|-----|------|-------------|
| GET | `/api/health` | ❌ | Returns `{status, version, environment, database}` |

#### `auth.py` — 2 endpoints (rate-limited)
| Method | URL | Auth | What It Does |
|--------|-----|------|-------------|
| POST | `/api/auth/login` | ❌ | JSON login → JWT token |
| POST | `/api/auth/token` | ❌ | OAuth2 form login → JWT (for Swagger "Authorize" button) |

#### `trades.py` — 5 endpoints
| Method | URL | Auth | What It Does |
|--------|-----|------|-------------|
| POST | `/api/trades` | ✅ | Create trade record |
| GET | `/api/trades` | ✅ | List all trades (with filters) |
| GET | `/api/trades/{id}` | ✅ | Get single trade |
| PUT | `/api/trades/{id}` | ✅ | Update trade |
| DELETE | `/api/trades/{id}` | ✅ | Delete trade |

#### `watchlists.py` — 5 endpoints
| Method | URL | Auth | What It Does |
|--------|-----|------|-------------|
| POST | `/api/watchlists` | ✅ | Create watchlist |
| GET | `/api/watchlists` | ✅ | List all watchlists |
| GET | `/api/watchlists/{id}` | ✅ | Get single watchlist |
| PUT | `/api/watchlists/{id}` | ✅ | Update watchlist |
| DELETE | `/api/watchlists/{id}` | ✅ | Delete watchlist |

#### `broker.py` — 13 endpoints
| Method | URL | Auth | What It Does |
|--------|-----|------|-------------|
| POST | `/api/broker/connect` | ✅ | Connect to broker (angel/zerodha/paper) |
| POST | `/api/broker/disconnect` | ✅ | Disconnect from broker |
| GET | `/api/broker/status` | ✅ | Get connection status |
| POST | `/api/broker/order` | ✅ | Place order (goes through RiskManager first) |
| DELETE | `/api/broker/order/{id}` | ✅ | Cancel pending order |
| GET | `/api/broker/positions` | ✅ | Get open positions |
| GET | `/api/broker/holdings` | ✅ | Get delivery holdings |
| GET | `/api/broker/orders` | ✅ | Get today's order book |
| GET | `/api/broker/paper/summary` | ✅ | Paper trading account summary |
| POST | `/api/broker/paper/reset` | ✅ | Reset paper trading |
| GET | `/api/broker/risk/status` | ✅ | Risk manager state |
| POST | `/api/broker/risk/kill` | ✅ | 🚨 Emergency kill switch ON |
| DELETE | `/api/broker/risk/kill` | ✅ | Kill switch OFF |

#### `ai.py` — 6 endpoints + screener/status
| Method | URL | Auth | What It Does |
|--------|-----|------|-------------|
| GET | `/api/ai/analyze/{symbol}` | ✅ | Technical analysis (15+ indicators) |
| GET | `/api/ai/predict/{symbol}` | ✅ | AI prediction (Gemini BUY/SELL/HOLD) |
| GET | `/api/ai/news/{symbol}` | ✅ | News intelligence (Gemini + Google Search grounding) |
| GET | `/api/ai/picks` | ✅ | Smart stock scanner (top picks) |
| GET | `/api/ai/analytics` | ✅ | Performance metrics (Sharpe, drawdown) |

#### `backtest.py` — 3 endpoints
| Method | URL | Auth | What It Does |
|--------|-----|------|-------------|
| GET | `/api/backtest/strategies` | ✅ | List 6 strategies with metadata |
| POST | `/api/backtest/run` | ✅ | Run backtest → stats + HTML chart |
| POST | `/api/backtest/optimize` | ✅ | Find optimal parameters |

---

### Services (`app/services/`) — The Business Logic

#### Broker System (Sprint 2)

```
BrokerInterface (ABC)          ← Abstract base — 10 methods
    ├── AngelOneBroker         ← SmartAPI + TOTP auth
    ├── ZerodhaBroker          ← KiteConnect
    └── PaperTrader            ← Virtual ₹1L capital, no real money
        
broker_factory.py → create_broker("paper") → PaperTrader()
```

| File | Class | Key Methods |
|------|-------|-------------|
| `broker_interface.py` | `BrokerInterface` (ABC) | `connect()`, `disconnect()`, `place_order()`, `cancel_order()`, `get_positions()`, `get_holdings()`, `get_ltp()`, `get_historical()`, `get_order_book()` |
| `angel_broker.py` | `AngelOneBroker` | Implements all 10 methods using smartapi-python SDK. TOTP via pyotp |
| `zerodha_broker.py` | `ZerodhaBroker` | Implements all 10 methods using kiteconnect SDK. Login URL flow |
| `paper_trader.py` | `PaperTrader` | In-memory trading. `_real_broker is None` assertion (hard safety wall). Extra: `get_summary()`, `reset()` |
| `broker_factory.py` | — | `create_broker(name: str) → BrokerInterface` factory function |

**Order flow:**
```
User clicks "Buy RELIANCE"
    → POST /api/broker/order
    → get_current_user() (JWT check)
    → RiskManager.validate_order()     ← 6 safety checks
        ├── Kill switch active?
        ├── Order value > ₹1L?
        ├── Daily loss > ₹5K?
        ├── Max 10 positions?
        ├── Concentration > 20%?
        └── Market hours (9:15–15:30)?
    → broker.place_order(OrderRequest)  ← Goes to Angel/Zerodha/Paper
    → Returns OrderResponse
```

#### Risk Manager

| Class | Key Methods | What It Does |
|-------|-------------|-------------|
| `RiskManager` | `validate_order(order, positions, portfolio_value)` | Runs ALL 6 checks, raises `RiskCheckFailedError` if any fail |
| | `record_trade_pnl(pnl)` | Tracks daily P&L. Auto-activates kill switch if loss > ₹5K |
| | `activate_kill_switch(reason)` | 🚨 Halts ALL trading immediately |
| | `deactivate_kill_switch()` | Manual reset only |
| | `get_status()` | Returns all limits, states, daily P&L |

#### AI & Analysis System (Sprint 3)

```
Technical Analysis Pipeline:
    Stock OHLCV data
        → TechnicalAnalyzer.analyze()      ← 15+ indicators via pandas-ta
        → { RSI, MACD, EMA, ADX, Supertrend, Bollinger, ATR, MFI, OBV }
        → Composite score 0-100 → Signal (STRONG_BUY / BUY / SELL / NO_TRADE)

AI Prediction Pipeline:
    TechnicalAnalysis result
        → AIEngine._build_prompt()           ← Structures data for AI
        → Gemini 2.5 Flash (via LangChain)   ← AI reasoning
        → AIEngine._parse_response()          ← JSON extraction
        → AIAnalysisResult { signal, confidence, target, SL, reasoning }
        → Fallback: _fallback_analysis()      ← Pure technical if AI fails

Stock Scanning Pipeline:
    SwingScreener.scan()              ← TradingView API (dynamic NSE)
        → 137+ matching stocks → top 50 by volume
    [Dynamic stock list]
        → TechnicalAnalyzer.analyze() each
        → StockPicker.score_stock()           ← 10-layer scoring (100 pts)
        │    ├── Technical (40 pts): RSI, MACD, ADX, EMA alignment
        │    ├── Volume (20 pts): volume surge, spike detection
        │    ├── Strength (15 pts): above 200 SMA, near 52w high
        │    ├── Fundamentals (15 pts): sector strength, market cap
        │    └── News (10 pts): Gemini + Google Search sentiment
        → StockPick { symbol, score, rating, entry, SL, target, shares }
        → Rating: GOLDEN (80+) / STRONG (65+) / MODERATE (50+) / SKIP (<50)
```

| File | Class | Key Methods |
|------|-------|-------------|
| `technical.py` | `TechnicalAnalyzer` | `analyze(df)` → `TechnicalAnalysisResult` with 15+ indicators |
| `ai_engine.py` | `AIEngine` | `analyze_stock(input)` → `AIAnalysisResult`, `get_sentiment_analysis(symbol, news)` |
| `gemini_news.py` | `GeminiNewsService` | Gemini 2.5 Flash + Google Search grounding |
| `tavily_search.py` | `TavilySearchService` | **LEGACY** — replaced by `gemini_news.py`. Kept for fallback only |
| `swing_screener.py` | `SwingScreener` | `scan()` → dynamic NSE stock list via TradingView Screener API |
| `stock_picker.py` | `StockPicker` | `scan_stocks(stock_data, capital)` → `list[StockPick]`, `score_stock(analysis)` → `StockScore` |
| `analytics.py` | `PerformanceAnalytics` | `calculate(trades)` → Sharpe ratio, max drawdown, win rate, profit factor, expectancy, streaks |

#### Backtesting Engine (Sprint 4)

```
Backtesting Pipeline:
    POST /api/backtest/run { strategy: "vwap_orb", symbol: "RELIANCE" }
        → BacktestEngine.run_backtest()
        → DataProvider.get_ohlcv("RELIANCE")         ← Multi-tier data
        │    ├── Try: Angel One (real data)
        │    ├── Try: yfinance (free, real NSE)       ← "RELIANCE.NS"
        │    └── Fallback: Demo data (GBM synthetic)
        → get_strategy("vwap_orb")                    ← From STRATEGY_REGISTRY
        → Backtest(data, Strategy, cash=₹10L, commission=0.2%)
        → bt.run() → Stats (pandas Series)
        → _extract_stats(stats)                       ← Safe pandas extraction
        → _generate_chart(bt)                         ← Interactive HTML (base64)
        → Return { stats, chart_html, strategy_info }
```

| File | Class | Key Methods |
|------|-------|-------------|
| `data_provider.py` | `DataProvider` | `get_ohlcv(symbol, days)` — fallback chain, 30min cache, timezone-naive |
| `backtest_engine.py` | `BacktestEngine` | `run_backtest(strategy, symbol)`, `optimize_strategy(strategy, symbol)`, `list_strategies()` |

---

### Strategies (`app/strategies/`) — 6 Research-Backed Algorithms

All strategies extend `StrategyBase` (which extends `backtesting.Strategy`).

| File | Strategy | How It Works | Expected Win Rate |
|------|----------|-------------|-------------------|
| `supertrend_rsi.py` | Supertrend + RSI | Custom Supertrend via ATR. Buy when Supertrend flips bullish AND RSI > 50. Sell on bearish flip + RSI < 50 | 55-60% |
| `vwap_orb.py` | VWAP Opening Range Breakout | Price breaks above rolling range with 1.5× volume surge. SL at range low, TP at 2× risk | 60-70% |
| `ema_adx.py` | EMA 9/21 + ADX | EMA 9 crosses above EMA 21 (bullish) AND ADX > 25 (strong trend). Blocks choppy sideways markets | 55-60% |
| `rsi_macd.py` | RSI Mean Reversion + MACD | RSI < 35 (oversold) + MACD histogram turning up = buy. RSI > 65 + MACD turning down = sell | 65-73% |
| `vcp_breakout.py` | VCP Minervini Method | Stock in uptrend (Trend Template), volatility contracting, then volume spike breakout. 3:1 R:R | 55-65% |
| `volume_breakout.py` | Volume Spike Breakout | 2× average volume with price above 20-day high. Detects institutional accumulation | 52-58% |

**How strategies are loaded:**
```python
# app/strategies/__init__.py
STRATEGY_REGISTRY = {}   # Lazy-loaded on first access

def _register_strategies():
    from .supertrend_rsi import SupertrendRSIStrategy
    STRATEGY_REGISTRY["supertrend_rsi"] = SupertrendRSIStrategy
    # ... 5 more

def get_strategy(name):   # Used by BacktestEngine
    if not STRATEGY_REGISTRY:
        _register_strategies()
    return STRATEGY_REGISTRY.get(name)
```

**How a strategy class works:**
```python
class VWAPORBStrategy(StrategyBase):
    # Parameters (can be optimized)
    orb_period = 20
    volume_threshold = 1.5
    
    # These class attributes define metadata
    strategy_name = "VWAP ORB"
    expected_win_rate = "60-70%"
    
    def init(self):
        # Calculate indicators once, store as self.data arrays
        self.vwap = self.I(self._calculate_vwap, self.data.Close, self.data.Volume)
        self.upper = self.I(lambda: pd.Series(self.data.High).rolling(self.orb_period).max())
        
    def next(self):
        # Called for each candle — make BUY/SELL decisions
        if price > self.upper[-2] and volume > avg_volume * 1.5:
            self.buy(sl=range_low, tp=target)
```

---

## 🔌 Key Data Flow Diagrams

### How a Full Trading Flow Works

```
1. User logs in
   POST /api/auth/login → JWT token
   
2. Connect to broker
   POST /api/broker/connect {broker: "paper"}
   → broker_factory.create_broker("paper") → PaperTrader()
   
3. Get AI stock pick
   GET /api/ai/picks
   → TechnicalAnalyzer.analyze(RELIANCE)
   → StockPicker.score_stock(analysis)
   → Return top picks with entry/SL/target
   
4. Backtest strategy first
   POST /api/backtest/run {strategy: "rsi_macd", symbol: "RELIANCE"}
   → DataProvider.get_ohlcv("RELIANCE")   ← Real data from yfinance
   → Backtest(data, RSIMACDStrategy, cash=₹10L)
   → Return { return: 2.9%, win_rate: 66%, chart: <HTML> }
   
5. Place order (with risk checks)
   POST /api/broker/order {symbol: "RELIANCE", side: "BUY", qty: 5}
   → RiskManager.validate_order()         ← 6 checks pass ✅
   → PaperTrader.place_order()
   → OrderResponse { order_id, status: "PLACED" }
   
6. Check performance
   GET /api/ai/analytics
   → PerformanceAnalytics.calculate(trades)
   → Return { sharpe: 1.2, win_rate: 65%, max_drawdown: -8% }
```

### How Config Flows Through the App

```
.env file
    → Settings (Pydantic) ← validates, crashes if invalid
    → settings singleton  ← imported everywhere
    
settings.JWT_SECRET_KEY    → auth.py → create_access_token()
settings.DATABASE_URL      → database.py → SQLAlchemy engine
settings.GEMINI_API_KEY    → ai_engine.py → ChatGoogleGenerativeAI()
settings.ANGEL_API_KEY     → config check → angel_broker.py
settings.GEMINI_API_KEY    → gemini_news.py (Google Search grounding)
settings.TELEGRAM_BOT_TOKEN → telegram_bot.py (optional, graceful fallback)
settings.MAX_ORDER_VALUE   → risk_manager.py → _check_order_value()
```

---

## 🛠️ How to Run

```bash
# 1. Activate virtual environment
cd backend
.venv\Scripts\activate    # Windows
source .venv/bin/activate # Mac/Linux

# 2. Install dependencies
pip install -r requirements.txt

# 3. Set up .env (copy from .env.example, fill in real values)
cp .env.example .env

# 4. Start PostgreSQL (must be running)

# 5. Start the server
python run.py
# → http://localhost:8000/docs (Swagger UI)
# → http://localhost:8000/api/health

# 6. Run tests
python scripts/quick_check.py        # Sprint 1+2 (44 checks)
python scripts/test_sprint3.py       # AI engine (42 checks)
python scripts/verify_sprint4.py     # Backtesting (6 steps)
```

---

## 🔧 Coding Patterns Used Everywhere

### Pattern 1: Every route is JWT-protected
```python
@router.get("/api/something")
async def get_something(user: dict = Depends(get_current_user)):
    # user = decoded JWT payload (has "sub" = username)
```

### Pattern 2: Settings from config, never os.getenv()
```python
from app.config import settings
key = settings.GEMINI_API_KEY   # ✅ validated at startup
key = os.getenv("GEMINI_KEY")   # ❌ NEVER do this
```

### Pattern 3: Enums from constants, never magic strings
```python
from app.constants import OrderSide, Exchange
side = OrderSide.BUY      # ✅
side = "BUY"              # ❌ magic string
```

### Pattern 4: Custom exceptions with HTTP codes
```python
from app.exceptions import NotFoundError
raise NotFoundError(f"Trade {trade_id} not found")
# → automatically returns HTTP 404 via middleware
```

### Pattern 5: DB sessions via dependency injection
```python
from app.database import get_db
@router.get("/")
async def handler(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Trade))
```

---

## 📊 What's Built vs What's Coming

| Sprint | What | Status |
|--------|------|--------|
| 1 | Foundation — FastAPI, DB, Auth, Models, Middleware | ✅ Complete |
| 2 | Broker Integration — Angel One, Zerodha, Paper, Risk | ✅ Complete |
| 3 | AI Engine — Technical Analysis, Gemini AI, News, Picks | ✅ Complete |
| 4 | Backtesting — 6 Strategies, Data Provider, Cost Model | ✅ Complete |
| **5** | **Frontend Connection + Telegram Bot** | ⏳ Next |
| 6 | AI Agents + ML Prediction + Real-time WebSocket | ❌ Future |

---

## 📝 Quick Reference: "Where is X?"

| I want to... | Look at... |
|-------------|-----------|
| Change env vars | `app/config.py` (Settings class) |
| Add a new API endpoint | `app/routers/` (create or modify a router) |
| Add a new database table | `app/models/` (new ORM model) |
| Add a new trading strategy | `app/strategies/` (extend StrategyBase) |
| Change risk limits | `app/config.py` → `.env` vars (MAX_ORDER_VALUE, etc.) |
| Understand authentication | `app/security/auth.py` |
| Encrypt broker credentials | `app/security/vault.py` |
| Change AI prompts | `app/services/ai_engine.py` (SYSTEM_PROMPT) |
| Add a new broker | Extend `BrokerInterface`, add to `broker_factory.py` |
| Modify scoring algorithm | `app/services/stock_picker.py` (score_stock method) |
| Debug backtesting | `app/services/backtest_engine.py` + `app/services/data_provider.py` |
| Run the server | `python run.py` or `python -m uvicorn app.main:app` |
| Check API docs | `http://localhost:8000/docs` (Swagger UI) |
