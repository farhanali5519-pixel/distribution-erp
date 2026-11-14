@echo off
setlocal
cd /d "%~dp0.."
set "RUNTIME_NODE=%~dp0..\runtime\node.exe"
if exist "%RUNTIME_NODE%" (
  "%RUNTIME_NODE%" "%~dp0process-controller.js" stop
) else (
  node "%~dp0process-controller.js" stop
)
endlocal
