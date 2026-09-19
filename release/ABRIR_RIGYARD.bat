@echo off
setlocal
cd /d "%~dp0"
title RIGYARD Local Server

echo.
echo   ==========================================
echo              RIGYARD
echo   ==========================================
echo.
echo   Iniciando servidor local...
echo   NO cierres esta ventana mientras jugas.
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"

if errorlevel 1 (
  echo.
  echo   RIGYARD no pudo iniciar el servidor.
  echo   Revisa el mensaje de error que aparece arriba.
  echo.
  pause
)
