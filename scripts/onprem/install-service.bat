@echo off
setlocal

title SaleFlow ERP - Windows Auto-Start Setup

echo ===================================================================
echo     SaleFlow ERP - Configure Auto-Start on Windows Boot
echo ===================================================================
echo.
echo This script registers a Windows Scheduled Task to launch SaleFlow ERP
echo automatically when the server/computer starts up.
echo.

set TASK_NAME=SaleFlow_ERP_Server
set SCRIPT_PATH=%~dp0..\..\start-onpremise.bat

:: Check for Administrative privileges
net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Administrative privileges required.
    echo Please right-click this script and select "Run as administrator".
    echo.
    pause
    exit /b 1
)

echo Registering Scheduled Task "%TASK_NAME%"...
schtasks /create /tn "%TASK_NAME%" /tr "\"%SCRIPT_PATH%\"" /sc onlogon /rl highest /f

if %ERRORLEVEL% equ 0 (
    echo.
    echo [SUCCESS] Task "%TASK_NAME%" registered successfully!
    echo SaleFlow ERP will automatically start whenever this Windows user logs on.
    echo.
    echo You can manage or disable this task in Windows "Task Scheduler" (taskschd.msc).
) else (
    echo.
    echo [ERROR] Failed to register task. Please review Task Scheduler permissions.
)

echo.
pause
