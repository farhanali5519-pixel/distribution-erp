@echo off
setlocal

title Restart SaleFlow ERP

echo ===================================================================
echo             Restarting SaleFlow ERP On-Premise Server
echo ===================================================================
echo.

call "%~dp0stop-onpremise.bat"
timeout /t 2 >nul
call "%~dp0start-onpremise.bat"
