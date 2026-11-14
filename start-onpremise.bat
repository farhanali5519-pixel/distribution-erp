@echo off
setlocal enabledelayedexpansion

title SaleFlow ERP - On-Premise Production Server

echo ===================================================================
echo             SaleFlow ERP - Commercial On-Premise Server
echo ===================================================================
echo.

:: 1. Verify Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not found on this system!
    echo Please install Node.js v20+ or v24+ from https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: 2. Set Production Environment Variables
set NODE_ENV=production
set DEPLOYMENT_MODE=onpremise
set DATABASE_DRIVER=sqlite
set SQLITE_DATABASE_PATH=data/sales_distribution.db

:: Configurable Host and Port (Default 0.0.0.0:3000 for LAN Access)
if "%HOST%"=="" set HOST=0.0.0.0
if "%PORT%"=="" set PORT=3000

:: 3. Verify Database File
if not exist "data\sales_distribution.db" (
    echo [WARNING] Primary database data\sales_distribution.db not found.
    echo Creating data directory if needed...
    if not exist "data" mkdir "data"
)

if not exist "backups" mkdir "backups"

:: 4. Get Local LAN IP Address
for /f "tokens=4" %%a in ('route print ^| findstr 0.0.0.0.*0.0.0.0') do (
    set LOCAL_IP=%%a
    goto :found_ip
)
:found_ip

echo [INFO] Starting SaleFlow ERP in On-Premise Production Mode...
echo [INFO] Environment: %DEPLOYMENT_MODE%
echo [INFO] Database:    %DATABASE_DRIVER% (%SQLITE_DATABASE_PATH%)
echo [INFO] Host / Port: %HOST%:%PORT%
echo.
echo ===================================================================
echo   Access the ERP locally:
echo     Local: http://localhost:%PORT%
if defined LOCAL_IP (
    echo   Access from other computers on this LAN:
    echo     LAN:   http://%LOCAL_IP%:%PORT%
)
echo ===================================================================
echo.
echo Press Ctrl+C in this console to stop the server at any time.
echo.

:: 5. Launch Next.js Production Server
call npx next start -H %HOST% -p %PORT%

pause
