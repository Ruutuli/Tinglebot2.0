@echo off
echo ========================================
echo    Tinglebot Server Data Extractor
echo ========================================
echo.
echo This script will extract all emojis, roles, and channels from your Discord server.
echo Make sure your .env file has DISCORD_TOKEN set correctly.
echo.
pause

echo Starting extraction...
node extractServerData.js

echo.
echo Extraction complete! Check the data/serverData folder for results.
pause
