@echo off
echo ╔══════════════════════════════════════════════════════════╗
echo ║          NetSDK Device Monitor - Quick Start            ║
echo ╚══════════════════════════════════════════════════════════╝
echo.

echo [1/3] Starting C# NetSDK Bridge Service...
REM Load SERVER_IP from .env file (skip comments and empty lines)
set SERVER_IP=0.0.0.0
for /f "tokens=1,2 delims==" %%a in (backend\.env) do (
    if /i "%%a"=="SERVER_IP" set SERVER_IP=%%b
)
echo Configuring SERVER_IP=%SERVER_IP%
start "NetSDK Bridge" cmd /k "set SERVER_IP=%SERVER_IP% && cd NetSDKBridge && dotnet run"
timeout /t 3 /nobreak > nul

echo [2/3] Starting Express Backend...
start "Express Backend" cmd /k "cd backend && npm run dev"
timeout /t 3 /nobreak > nul

echo [3/3] Starting Next.js Frontend...
start "Next.js Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo ═══════════════════════════════════════════════════════════
echo All services are starting...
echo.
echo Server IP:      %SERVER_IP%
echo C# Bridge:      http://localhost:5000
echo Backend:        http://localhost:3001
echo Frontend:       http://localhost:3000
echo.
echo Configure your device with:
echo   Server IP: %SERVER_IP%
echo   Port: 9500
echo   Username: admin
echo   Password: admin123
echo ═══════════════════════════════════════════════════════════
echo.
echo ℹ️  To change server IP, edit: backend\.env (SERVER_IP=...)
echo ═══════════════════════════════════════════════════════════
echo.
echo Press any key to exit this window...
pause > nul
