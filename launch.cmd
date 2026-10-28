@echo off
rem One-click launcher for Bunny Media Hub.
rem Double-click this file to open the app. It installs dependencies the first
rem time, rebuilds the app from the current source, then starts it.
setlocal
cd /d "%~dp0"

if not exist "node_modules\electron\dist\electron.exe" (
  echo Installing dependencies - this can take a few minutes the first time...
  call npm install
  if errorlevel 1 goto :failed
)

echo Building Bunny Media Hub...
call npm run build
if errorlevel 1 goto :failed

start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
exit /b 0

:failed
echo.
echo Bunny Media Hub could not start. The messages above explain why.
pause
exit /b 1
