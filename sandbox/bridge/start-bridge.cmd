@echo off
cd /d "%~dp0"
:loop
node server.mjs >> bridge.log 2>&1
timeout /t 2 /nobreak >nul
goto loop