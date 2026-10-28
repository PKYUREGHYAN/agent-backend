@echo off
cd /d "%~dp0"
echo Agent 1 Electron setup...
call npm install
call npm --prefix frontend install
call npm run build:ui
call node desktop/install-electron.cjs
echo.
echo Պատրաստ է։ Բացեք start-agent1.bat
pause
