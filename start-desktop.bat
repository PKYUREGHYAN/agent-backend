@echo off
cd /d "%~dp0"
if not exist "node_modules\electron" (
  call npm install
)
start "Agent 1 API" cmd /c "node server.cjs"
start "Agent 1 Web" cmd /c "npm --prefix frontend run dev -- --host 0.0.0.0"
timeout /t 4 /nobreak >nul
call npx electron desktop/main.cjs
