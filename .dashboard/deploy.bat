@echo off
REM Tinglebot Dashboard Railway Deployment Script
REM This script helps set up the dashboard for Railway deployment

echo 🚀 Tinglebot Dashboard Railway Deployment Setup
echo ================================================

REM Check if Railway CLI is installed
railway --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Railway CLI not found. Please install it first:
    echo    npm install -g @railway/cli
    echo    Then run: railway login
    pause
    exit /b 1
)

REM Check if we're in the dashboard directory
if not exist "server.js" (
    echo ❌ Please run this script from the .dashboard directory
    pause
    exit /b 1
)

echo ✅ Railway CLI found
echo ✅ Dashboard directory confirmed

REM Create .env file if it doesn't exist
if not exist ".env" (
    echo 📝 Creating .env file from template...
    copy .env.example .env
    echo ⚠️  Please edit .env file with your actual credentials
    echo    DO NOT commit this file to version control!
)

echo.
echo 🔧 Next Steps:
echo 1. Edit .env file with your actual credentials
echo 2. Run: railway login
echo 3. Run: railway init
echo 4. Set environment variables in Railway dashboard
echo 5. Run: railway up
echo.
echo 🌐 Domain Configuration:
echo    - Set custom domain: tinglebot.xyz
echo    - Configure DNS to point to Railway
echo.
echo 🔒 Security Reminder:
echo    - Rotate all exposed credentials immediately
echo    - Never commit .env files
echo    - Use Railway environment variables for production
echo.
echo 📚 For more information, see README.md
pause 