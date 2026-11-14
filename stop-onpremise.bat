@echo off
setlocal

title Stop SaleFlow ERP

echo ===================================================================
echo             Stopping SaleFlow ERP On-Premise Server
echo ===================================================================
echo.

if "%PORT%"=="" set PORT=3000

echo Finding process running on port %PORT%...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%PORT% " ^| findstr "LISTENING"') do (
    set PID=%%a
    goto :found_process
)

echo [INFO] No SaleFlow ERP process currently listening on port %PORT%.
goto :done

:found_process
echo [INFO] Found process ID %PID% on port %PORT%. Stopping...
taskkill /F /PID %PID% >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [SUCCESS] SaleFlow ERP (PID %PID%) stopped successfully.
) else (
    echo [ERROR] Failed to terminate PID %PID%. You may need to run as Administrator.
)

:done
echo.
timeout /t 3 >nul
