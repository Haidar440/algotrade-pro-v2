@echo off
title AlgoTrade Pro - Full Stack Startup
color 0A

echo.
echo  ==========================================
echo   AlgoTrade Pro - Starting All Services
echo  ==========================================
echo.

REM ── Step 1: Kill stale processes on our ports ──────────────────────────────
echo [1/4] Cleaning up stale processes...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173" 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /T 2 /NOBREAK >nul
echo     Done.
echo.

REM ── Step 2: Start Python FastAPI backend (port 8000) ──────────────────────
echo [2/3] Starting Python FastAPI backend (port 8000)...
start "AlgoTrade - FastAPI (8000)" /D "e:\algotrade-pro\backend" cmd /k ".venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --log-level warning"
timeout /T 3 /NOBREAK >nul
echo     FastAPI started.
echo.

REM ── Step 3: Start Vite frontend (port 5173) ───────────────────────────────
echo [3/3] Starting Vite frontend (port 5173)...
start "AlgoTrade - Frontend (5173)" /D "e:\algotrade-pro" cmd /k "npm run dev"
timeout /T 4 /NOBREAK >nul
echo     Frontend started.
echo.

echo  ==========================================
echo   All services running!
echo.
echo   Frontend  → http://localhost:5173
echo   FastAPI   → http://localhost:8000/docs
echo  ==========================================
echo.
echo  Tip: Close individual terminal windows to stop a service.
echo  Or run stop-all.bat to kill everything at once.
echo.
pause
