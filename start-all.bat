@echo off
echo ╔══════════════════════════════════════════════════════════╗
echo ║          NetSDK Device Monitor - Quick Start            ║
echo ╚══════════════════════════════════════════════════════════╝
echo.

REM Load SERVER_IP from backend\.env
set SERVER_IP=0.0.0.0
for /f "tokens=1,2 delims==" %%a in (backend\.env) do (
    if /i "%%a"=="SERVER_IP" set SERVER_IP=%%b
)
echo Server IP configured: %SERVER_IP%
echo.

echo [1/3] Starting C# NetSDK Bridge (port 5000)...
start "NetSDK Bridge" cmd /k "set SERVER_IP=%SERVER_IP% && cd /d "%~dp0NetSDKBridge" && dotnet run"

echo     Waiting 12 seconds for SDK bridge to initialize...
timeout /t 12 /nobreak > nul

echo [2/3] Starting Express Backend (port 3001)...
start "Express Backend" cmd /k "cd /d "%~dp0backend" && npm run dev"

echo     Waiting 6 seconds for backend to initialize and push credentials to bridge...
timeout /t 6 /nobreak > nul

echo [3/3] Starting Next.js Frontend (port 3000)...
start "Next.js Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo ═══════════════════════════════════════════════════════════
echo  ✅ All services started in correct order:
echo      1. NetSDK Bridge  → http://localhost:5000
echo      2. Backend        → http://localhost:3001
echo      3. Frontend       → http://localhost:3000
echo.
echo  📡 Auto-Register your device with:
echo      Server IP   : %SERVER_IP%
echo      Port        : 9500
echo.
echo  🔑 Set device credentials via frontend Device Management
echo     or: POST http://localhost:3001/api/devices/credentials
echo ═══════════════════════════════════════════════════════════
echo.
pause
