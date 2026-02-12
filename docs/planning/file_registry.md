# File Registry — Sprint 1 Foundation

This document records every file created or updated during the Sprint 1 Foundation phase.

## 📂 Backend Core (`backend/app/`)

| File | Purpose | Key Functionality |
|---|---|---|
| **`__init__.py`** | Package initialization | Defines app version (`__version__ = "1.0.0"`). |
| **`config.py`** | Configuration & Settings | Loads environment variables using `pydantic-settings`. Validates types (e.g., `DATABASE_URL`, `JWT_SECRET_KEY`) and provides typed access (e.g., `settings.DEBUG`). **Zero `os.getenv` elsewhere.** |
| **`constants.py`** | Enums & Magic Strings | Centralizes all constant values (OrderTypes, TradeStatus, AuditActions) as 13 Python Enums. **Prevents typo bugs.** |
| **`exceptions.py`** | Error Handling | Defines 10 typed exceptions (e.g., `NotFoundError`, `UnauthorizedError`) mapping to HTTP status codes. |
| **`logging_config.py`** | Logging Setup | Configures structured logging with 4 handlers: Console (dev), `app.log` (debug), `errors.log` (warning+), `trades.log` (audit). |
| **`database.py`** | Database Connection | Manages async PostgreSQL connection using `SQLAlchemy` + `asyncpg`. Provides `get_db` dependency for session management. |
| **`middleware.py`** | Request Processing | global middleware for CORS, Request ID tracking, Response timing, and **Global Exception Handling** (catches errors -> JSON). |
| **`dependencies.py`** | Dependency Injection | Central DI container. Provides cached singletons like `CredentialVault` and `DatabaseSession`. |
| **`main.py`** | Application Entry | Wires everything together: Middleware + Routers + Database Lifecycle. The FastAPI app instance lives here. |

## 🔒 Security Layer (`backend/app/security/`)

| File | Purpose | Key Functionality |
|---|---|---|
| **`vault.py`** | Credential Encryption | Encrypts/Decrypts sensitive broker credentials using **Fernet (AES-256)**. Uses `MASTER_ENCRYPTION_KEY`. |
| **`auth.py`** | Authentication | Handles **JWT** token creation/validation and **Bcrypt** password hashing. Provides `get_current_user` dependency. |

## 🗄️ Database Models (`backend/app/models/`)

| File | Purpose | Key Functionality |
|---|---|---|
| **`base.py`** | Base Model | Abstract parent for all models. Automatically adds `id`, `created_at`, `updated_at` columns to every table. |
| **`trade.py`** | Trade Model | SQL table definition for Trades. Stores symbol, price, quantity, status, strategy, PnL. |
| **`watchlist.py`** | Watchlist Model | SQL table for Watchlists. Uses **JSONB** to store flexible lists of stocks/tokens. |
| **`instrument.py`** | Instrument Model | SQL table for Broker Instruments (Master file). Indexed for fast search. |
| **`audit.py`** | Audit Log Model | **Append-only** table recording every user action (Login, Trade, Delete). Immutable audit trail. |
| **`schemas.py`** | Pydantic Schemas | Defines API Request/Response shapes. Ensures strict validation before data hits the DB. |

## 🌐 API Routers (`backend/app/routers/`)

| File | Purpose | Key Functionality |
|---|---|---|
| **`health.py`** | Health Check | `GET /api/health` — Checks DB connectivity. Used by load balancers/monitoring. |
| **`auth.py`** | Auth Endpoints | `POST /api/auth/login` — Rate-limited login endpoint returning JWT tokens. |
| **`trades.py`** | Trade Endpoints | `GET/POST/PUT/DELETE /api/trades` — Full CRUD for trades. **JWT Protected.** |
| **`watchlists.py`** | Watchlist Endpoints | `GET/POST/DELETE /api/watchlists` — CRUD for watchlists with upsert logic. |

## 🛠️ Utilities & Scripts (`backend/scripts/`)

| File | Purpose | Key Functionality |
|---|---|---|
| **`scan_hardcoded_secrets.py`** | Security Scanner | Pre-commit hook script. Scans code for 11 patterns of hardcoded secrets (API keys, passwords). **Blocks unsafe commits.** |

## ⚙️ Project Config (`backend/`)

| File | Purpose | Key Functionality |
|---|---|---|
| **`.env`** | Environment Variables | Stores secrets and config (DB URL, API Keys). **Not committed to Git.** |
| **`.env.example`** | Environment Template | Safe template listing required variables without values. Committed to Git. |
| **`.gitignore`** | Git Ignore | Lists files to exclude from version control (secrets, venv, logs, pycache). |
| **`requirements.txt`** | Dependencies | List of Python packages required to run the app. |
| **`run.py`** | Runner | Entry point script to start the Uvicorn server programmatically. |
