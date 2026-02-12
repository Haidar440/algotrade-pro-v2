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
