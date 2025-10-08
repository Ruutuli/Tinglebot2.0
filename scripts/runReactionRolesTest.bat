@echo off
echo 🚀 Running Reaction Roles Test...
echo.
echo Choose an option:
echo 1. Test individual embed formatting
echo 2. Post all reaction roles with setup
echo 3. Exit
echo.
set /p choice="Enter your choice (1-3): "

if "%choice%"=="1" (
    echo.
    echo 🧪 Testing individual embed formatting...
    node testReactionRolesFormatting.js
) else if "%choice%"=="2" (
    echo.
    echo 📝 Posting all reaction roles...
    node postReactionRoles.js
) else if "%choice%"=="3" (
    echo.
    echo 👋 Goodbye!
    exit
) else (
    echo.
    echo ❌ Invalid choice. Please run the script again.
    pause
    exit
)

echo.
echo ✅ Script completed!
pause
