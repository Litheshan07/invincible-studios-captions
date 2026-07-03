@echo off
echo ==========================================
echo Starting INVINCIBLE STUDIOS Captions...
echo ==========================================

REM Switch current directory to where the batch script is located
cd /d "%~dp0"

REM Launch Frontend Next.js Web Studio (binding to 0.0.0.0 for mobile access)
start cmd /k "cd /d "%~dp0" && title INVINCIBLE STUDIOS Captions Frontend && echo Starting Production Server... && npx.cmd next start -H 0.0.0.0 --port 3000"

echo ==========================================
echo Launching in Production Mode (Optimized and Instant Load)...
echo Frontend Server: http://localhost:3000
echo ==========================================
echo Press any key to exit.
pause > null
