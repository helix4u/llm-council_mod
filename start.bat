@echo off
setlocal

echo ========================================
echo Starting LLM Council...
echo ========================================
echo.

REM Check if .env exists
if not exist ".env" (
    echo WARNING: .env file not found!
    echo Please create a .env file with your OPENROUTER_API_KEY
    echo.
    echo Example:
    echo   OPENROUTER_API_KEY=sk-or-v1-...
    echo.
    echo Get your API key at: https://openrouter.ai/
    echo.
    pause
    exit /b 1
)

REM Start backend in a new window
echo Starting backend on http://localhost:8002...
start "LLM Council - Backend" cmd /k "uv run python -m backend.main"

REM Wait a bit for backend to start
timeout /t 3 /nobreak >nul

REM Start frontend in a new window
echo Starting frontend on http://localhost:5173...
start "LLM Council - Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo ========================================
echo LLM Council is starting!
echo ========================================
echo.
echo Backend:  http://localhost:8002
echo Frontend: http://localhost:5173
echo.
echo Two new windows have been opened for backend and frontend.
echo Close those windows to stop the servers.
echo.
echo Opening browser in 5 seconds...
timeout /t 5 /nobreak >nul

REM Open browser
start http://localhost:5173

echo.
echo Press any key to exit this window...
pause >nul
