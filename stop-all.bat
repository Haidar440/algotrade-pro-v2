@echo off
title AlgoTrade Pro - Stop All Services
color 0C
echo.
echo  Stopping all AlgoTrade Pro services...
echo.

REM Kill by port
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000 " 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 " 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo  All services stopped.
timeout /T 2 /NOBREAK >nul
