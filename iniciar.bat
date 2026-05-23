@echo off
setlocal
cd /d "%~dp0"
where pythonw >nul 2>nul
if %errorlevel%==0 (
  start "" pythonw "Cliente.pyw"
) else (
  python scripts\tenant_launcher.py
)
