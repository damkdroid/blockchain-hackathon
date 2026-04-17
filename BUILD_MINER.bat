@echo off
REM =====================================================
REM Blockchain Miner Build Script
REM This script creates miner.exe from miner.py
REM =====================================================

echo.
echo ================================
echo   BLOCKCHAIN MINER BUILD v1.0
echo ================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.8+ from https://www.python.org
    pause
    exit /b 1
)

echo Step 1: Installing dependencies...
pip install -r requirements.txt
if errorlevel 1 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo Step 2: Building miner.exe...
echo This may take 1-2 minutes...
echo.

pyinstaller miner.spec

if errorlevel 1 (
    echo ERROR: Failed to build executable
    pause
    exit /b 1
)

echo.
echo ================================
echo SUCCESS!
echo ================================
echo.
echo Miner executable created:
echo   Location: dist\miner\miner.exe
echo.
echo To run the miner:
echo   1. Make sure the blockchain network is running (python network.py)
echo   2. Double-click: dist\miner\miner.exe
echo   3. Or run from command line: dist\miner\miner.exe
echo.
echo Log file will be created: miner.log
echo.
pause
