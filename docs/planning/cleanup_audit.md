# AlgoTrade Pro — Cleanup Audit Report 🧹

## Summary

| Category | Issues Found | Severity |
|---|---|---|
| 🔴 **Security Risks** | 4 files with exposed secrets | **CRITICAL** |
| 🟡 **Junk / Temp Files** | 2 files | Medium |
| 🟡 **Duplicate Code** | 2 entire backends doing the same thing | Medium |
| 🟠 **Unused Components** | 9 of 31 components never imported | High (bloat) |
| 🟡 **Unused Services** | 2 services never used | Medium |
| ⚪ **Misc Waste** | Empty logs, leftover configs | Low |

---

## 🔴 CRITICAL: Exposed Secrets (FIX IMMEDIATELY)

> [!CAUTION]
> **Your API keys, passwords, and MongoDB credentials are hardcoded in plain text and committed to Git!** If this repo is public on GitHub, your accounts are compromised.

| File | What's Exposed | Action |
|---|---|---|
| [.env.local](file:///e:/algotrade-pro/.env.local) | Gemini API key, Angel One API key, Client ID, Password, TOTP secret | Move to `.env` (already gitignored via `*.local`), but **rotate ALL keys now** |
| [backend/db.js](file:///e:/algotrade-pro/backend/db.js) | MongoDB Atlas connection string with username | **DELETE** — not even used (server.js has its own connection) |
| [backend/debug_tokens.js](file:///e:/algotrade-pro/backend/debug_tokens.js) | MongoDB Atlas URI with password `8980` | **DELETE** — debugging script, not needed |
| [backend/seed.js](file:///e:/algotrade-pro/backend/seed.js) | MongoDB Atlas URI with password `8980` | **DELETE** or move URI to `.env` |

### Recommended Fix

```diff
# .env (create this, add to .gitignore)
+ GEMINI_API_KEY=your_key_here
+ ANGEL_API_KEY=your_key_here
+ ANGEL_CLIENT_ID=your_id_here
+ ANGEL_PASSWORD=your_pin_here
+ ANGEL_TOTP_SECRET=your_totp_here
+ MONGODB_URI=your_mongodb_uri_here

# .gitignore (add these lines)
+ .env
+ .env.local
+ *.local
```

---

## 🟡 Junk / Temp Files (DELETE)

| File | Content | Action |
|---|---|---|
| [tempCodeRunnerFile.py](file:///e:/algotrade-pro/tempCodeRunnerFile.py) | Contains just the word `pyotp` (5 bytes) — VS Code temp artifact | **DELETE** |
| [jwt_token.py](file:///e:/algotrade-pro/jwt_token.py) | Standalone script to generate Angel One JWT token — not part of the app | **DELETE** (will be replaced by Python backend login) |

---

## 🟡 Duplicate Backends (PICK ONE)

You have **two separate backends** doing the same thing:

| File | Database | Features |
|---|---|---|
| [server.cjs](file:///e:/algotrade-pro/server.cjs) (159 lines) | **SQLite** ([market.db](file:///e:/algotrade-pro/market.db)) | Search, token lookup, Angel proxy, WebSocket streaming |
| [backend/server.js](file:///e:/algotrade-pro/backend/server.js) (289 lines) | **MongoDB** | All of the above + Trade CRUD + Watchlist management |

### Problem
- [server.cjs](file:///e:/algotrade-pro/server.cjs) is an **older, incomplete version** — it has no trade or watchlist routes
- [backend/server.js](file:///e:/algotrade-pro/backend/server.js) is the **full version** with MongoDB
- Both bind to port 5000 — only one can run at a time
- They'll both be replaced by FastAPI in the Python migration anyway

### Action
- **DELETE** [server.cjs](file:///e:/algotrade-pro/server.cjs) — it's the inferior duplicate
- Keep [backend/server.js](file:///e:/algotrade-pro/backend/server.js) until Python migration is complete

---

## 🟠 Unused Components (9 of 31 — 29% dead code!)

These components exist in `components/` but are **NEVER imported** anywhere in the app:

| Component | Size | Why Unused | Action |
|---|---|---|---|
| [TVChartContainer.tsx](file:///e:/algotrade-pro/components/TVChartContainer.tsx) | 2.7KB | Replaced by [TradingChart.tsx](file:///e:/algotrade-pro/components/TradingChart.tsx) | **DELETE** |
| [InteractiveChart.tsx](file:///e:/algotrade-pro/components/InteractiveChart.tsx) | 6.1KB | Replaced by [TradingChart.tsx](file:///e:/algotrade-pro/components/TradingChart.tsx) | **DELETE** |
| [Sparkline.tsx](file:///e:/algotrade-pro/components/Sparkline.tsx) | 2KB | Mini chart — never used | **DELETE** |
| [TechnicalPanel.tsx](file:///e:/algotrade-pro/components/TechnicalPanel.tsx) | 3.5KB | Replaced by inline display in `StockDetailView` | **DELETE** |
| [OrderEntryPanel.tsx](file:///e:/algotrade-pro/components/OrderEntryPanel.tsx) | 9.9KB | Order entry — superseded by [RealPortfolio.tsx](file:///e:/algotrade-pro/components/RealPortfolio.tsx) | **DELETE** |
| [TradeModal.tsx](file:///e:/algotrade-pro/components/TradeModal.tsx) | 9.7KB | Trade modal — never imported | **DELETE** |
| [AiPredictionCard.tsx](file:///e:/algotrade-pro/components/AiPredictionCard.tsx) | 4.8KB | AI prediction display — never imported | **DELETE** |
| [TradePlanCard.tsx](file:///e:/algotrade-pro/components/TradePlanCard.tsx) | 11.3KB | Trade plan card — never imported | **DELETE** |
| [StrategyCard.tsx](file:///e:/algotrade-pro/components/StrategyCard.tsx) | 2.6KB | Strategy info — never imported | **DELETE** |
| [AddStockModal.tsx](file:///e:/algotrade-pro/components/AddStockModal.tsx) | 3.7KB | Add stock dialog — never imported | **DELETE** |
| [DhanSettingsModal.tsx](file:///e:/algotrade-pro/components/DhanSettingsModal.tsx) | 6KB | Dhan settings — never imported | **DELETE** |
| [ExecutionDashboard.tsx](file:///e:/algotrade-pro/components/ExecutionDashboard.tsx) | 14.6KB | Execution dashboard — never imported | **DELETE** |

> [!NOTE]
> That's **~75KB of dead component code** (12 files). Some may have been replaced or were prototypes that were never integrated.

### Components Actually Used (19 of 31)
These are imported in [App.tsx](file:///e:/algotrade-pro/App.tsx) and are the real app:
- PaperTradingDashboard, Sidebar, Navbar, StrategyGuide, SettingsModal, PythonLab, BacktestDashboard, MarketStatusTicker, SignalFeedCard, BottomNav, StockDetailView, WatchlistRow, NewsAnalysisDashboard, RealPortfolio, AutoTraderDashboard, TradeHistory, WatchlistManager, TradingChart, TradingViewTicker

---

## 🟡 Unused / Questionable Services

| Service | Status | Action |
|---|---|---|
| [tvDatafeed.ts](file:///e:/algotrade-pro/services/tvDatafeed.ts) (6.9KB) | **Never imported** anywhere — was for TradingView charting library integration | **DELETE** |
| [mockSignals.ts](file:///e:/algotrade-pro/services/mockSignals.ts) (1.6KB) | Generates fake signal data for demo — check if still used or can be removed | **Review** — may be called dynamically |

---

## ⚪ Miscellaneous Waste

| Item | Issue | Action |
|---|---|---|
| [error.log](file:///e:/algotrade-pro/error.log) (root) | Empty file (0 bytes) | **DELETE** |
| [backend/error.log](file:///e:/algotrade-pro/backend/error.log) | Empty file (0 bytes) | **DELETE** |
| [logs/2025-12-11/app.log](file:///e:/algotrade-pro/logs/2025-12-11/app.log) | Old log from December 2025 | **DELETE folder** `logs/` |
| [metadata.json](file:///e:/algotrade-pro/metadata.json) | Google AI Studio artifact — not used by the app | **DELETE** |
| [sync-db.cjs](file:///e:/algotrade-pro/sync-db.cjs) | One-time script to populate [market.db](file:///e:/algotrade-pro/market.db) — already ran | **Keep** (useful utility) but move to `scripts/` folder |
| [market.db](file:///e:/algotrade-pro/market.db) (22MB) | SQLite database — very large, shouldn't be in Git | Add to [.gitignore](file:///e:/algotrade-pro/.gitignore) |
| [index.html](file:///e:/algotrade-pro/index.html) lines 74-84 | Google AI Studio CDN import map (aistudiocdn.com) — leftover from prototyping | **Remove** — Vite handles imports |

---

## Summary of Actions

### 🗑️ Files to DELETE (17 files, ~100KB+ saved)

```
# Junk / Temp
tempCodeRunnerFile.py
jwt_token.py
metadata.json

# Security Risk (hardcoded credentials)  
backend/db.js
backend/debug_tokens.js
backend/seed.js          # Or move MongoDB URI to .env

# Duplicate Backend
server.cjs

# Unused Components (12 files, ~75KB)
components/TVChartContainer.tsx
components/InteractiveChart.tsx
components/Sparkline.tsx
components/TechnicalPanel.tsx
components/OrderEntryPanel.tsx
components/TradeModal.tsx
components/AiPredictionCard.tsx
components/TradePlanCard.tsx
components/StrategyCard.tsx
components/AddStockModal.tsx
components/DhanSettingsModal.tsx
components/ExecutionDashboard.tsx

# Dhan Broker (user only uses Angel One + Zerodha)
services/dhan.ts
components/DhanSettingsModal.tsx   # already in unused list above

# Old Database Files (PostgreSQL replaces both SQLite + MongoDB)
market.db                        # 22MB SQLite — data will be migrated to PostgreSQL
sync-db.cjs                      # SQLite sync script — no longer needed

# Unused Services
services/tvDatafeed.ts

# Empty Logs
error.log
backend/error.log
logs/   (entire directory)
```

### ✏️ Files to EDIT

| File | Change |
|---|---|
| [.gitignore](file:///e:/algotrade-pro/.gitignore) | Add: `.env`, [market.db](file:///e:/algotrade-pro/market.db), `logs/`, `*.py` temp files |
| [index.html](file:///e:/algotrade-pro/index.html) | Remove Google AI Studio import map (lines 74-84) |
| [.env.local](file:///e:/algotrade-pro/.env.local) | **Rotate all API keys** — they've been exposed |
| [types.ts](file:///e:/algotrade-pro/types.ts) | Remove [DhanCredentials](file:///e:/algotrade-pro/types.ts#109-113), `DhanOrderRequest`, and `dhan?` from [BrokerState](file:///e:/algotrade-pro/types.ts#114-119) |

### 📁 Files to MOVE

| File | Move To |
|---|---|
| [sync-db.cjs](file:///e:/algotrade-pro/sync-db.cjs) | `scripts/sync-db.cjs` |
