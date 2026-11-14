@echo off
echo ===================================================
echo   SaleFlow ERP - Windows Firewall Configuration
echo ===================================================
echo Adding inbound firewall rule for TCP port 3000 (Private LAN)...
netsh advfirewall firewall add rule name="SaleFlow ERP (Port 3000)" dir=in action=allow protocol=TCP localport=3000 profile=private,domain
if %ERRORLEVEL% equ 0 (
  echo [PASS] Windows Firewall configured successfully for LAN access.
) else (
  echo [WARN] Failed to configure firewall. Please right-click and run as Administrator.
)
pause
