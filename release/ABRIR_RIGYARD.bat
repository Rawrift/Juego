@echo off
setlocal
cd /d "%~dp0"
echo.
echo   RIGYARD - iniciando servidor local...
echo.
where py >nul 2>nul && (
  start "" http://127.0.0.1:8765/
  py -m http.server 8765 --bind 127.0.0.1
  exit /b
)
where python >nul 2>nul && (
  start "" http://127.0.0.1:8765/
  python -m http.server 8765 --bind 127.0.0.1
  exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
