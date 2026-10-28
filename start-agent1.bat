@echo off
cd /d "%~dp0"
if not exist "frontend\dist\index.html" (
  echo Նախ աշխատեցրեք setup.bat
  pause
  exit /b 1
)
call node desktop/install-electron.cjs
call npx electron .
