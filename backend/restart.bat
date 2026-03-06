@echo off
echo ============================================
echo   AlgoTrade Pro - Clean Restart Script
echo ============================================
echo.
echo Step 1: Killing all old Python/Uvicorn processes...
taskkill /F /IM python.exe 2>nul
taskkill /F /IM uvicorn.exe 2>nul
timeout /T 2 /NOBREAK >nul

echo Step 2: Clearing Python cache...
if exist "app\services\__pycache__" (
    del /Q "app\services\__pycache__\telegram_bot*.pyc" 2>nul
    echo   Cleared telegram_bot cache
)

echo Step 3: Starting fresh server...
echo.
echo ============================================
echo   Server starting on http://localhost:8000
echo   Press Ctrl+C to stop
echo ============================================
echo.
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
