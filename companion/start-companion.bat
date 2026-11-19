@echo off
setlocal
cd /d "%~dp0"

echo ===================================================
echo  August / J.A.R.V.I.S. Windows Desktop Companion
echo ===================================================

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is required. Please install Node.js 18+ first.
  pause
  exit /b 1
)

if not exist node_modules\ws (
  echo [Setup] Installing Node.js ws dependency...
  call npm install --no-save ws
)

where python >nul 2>&1
if not errorlevel 1 (
  if not exist .venv (
    echo [Setup] Creating Python virtual environment...
    python -m venv .venv
  )
  call .venv\Scripts\activate.bat
  echo [Setup] Installing Python Windows Agent packages...
  pip install -q -r requirements.txt
  echo [Start] Launching Python Windows Agent on http://127.0.0.1:4850...
  start "August Python Agent" /min .venv\Scripts\python.exe jarvis_windows_agent.py
) else (
  echo [Notice] Python not found. Node.js companion will run with PowerShell fallbacks.
)

echo [Start] Launching Node.js WebSocket Companion on ws://127.0.0.1:4849...
node jarvis-companion.mjs
pause
