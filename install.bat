@echo off
setlocal enabledelayedexpansion

echo ========================================
echo LLM Council - Windows Installation
echo ========================================
echo.

REM Check if Python is installed
echo [1/5] Checking Python installation...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.10 or higher from https://www.python.org/
    echo Make sure to check "Add Python to PATH" during installation
    pause
    exit /b 1
)

python --version
echo Python found!
echo.

REM Check if Node.js is installed
echo [2/5] Checking Node.js installation...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

node --version
npm --version
echo Node.js and npm found!
echo.

REM Check if uv is installed, if not install it
echo [3/5] Checking uv package manager...
uv --version >nul 2>&1
if %errorlevel% neq 0 (
    echo uv not found. Installing uv...
    pip install uv
    if %errorlevel% neq 0 (
        echo ERROR: Failed to install uv
        echo Please run: pip install uv
        pause
        exit /b 1
    )
    echo uv installed successfully!
) else (
    uv --version
    echo uv found!
)
echo.

REM Install Python dependencies using uv
echo [4/5] Installing Python dependencies...
uv sync
if %errorlevel% neq 0 (
    echo ERROR: Failed to install Python dependencies
    pause
    exit /b 1
)
echo Python dependencies installed!
echo.

REM Install Node.js dependencies
echo [5/5] Installing Node.js dependencies...
cd frontend
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install Node.js dependencies
    cd ..
    pause
    exit /b 1
)
cd ..
echo Node.js dependencies installed!
echo.

REM Check for .env file
echo ========================================
echo Checking configuration...
echo ========================================
if not exist ".env" (
    echo.
    echo WARNING: .env file not found!
    echo.
    echo You need to create a .env file in the project root with:
    echo   OPENROUTER_API_KEY=sk-or-v1-...
    echo.
    echo Get your API key at: https://openrouter.ai/
    echo.
) else (
    echo .env file found!
)
echo.

REM Installation complete
echo ========================================
echo Installation Complete!
echo ========================================
echo.
echo To run LLM Council, use one of these options:
echo.
echo Option 1: Use the start script
echo   start.bat
echo.
echo Option 2: Run manually
echo   Terminal 1: uv run python -m backend.main
echo   Terminal 2: cd frontend ^&^& npm run dev
echo.
echo The application will be available at http://localhost:5173
echo.

if not exist ".env" (
    echo REMINDER: Don't forget to create your .env file!
    echo.
)

pause
