@echo off
:: Check for admin rights and auto-elevate if needed
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator privileges to update C:\Program Files\PC Tweak...
    powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

echo ========================================================
echo Deploying latest build to C:\Program Files\PC Tweak
echo ========================================================

echo Closing active instances...
taskkill /F /IM "PC Tweak.exe" /T >nul 2>&1
timeout /t 1 /nobreak >nul

echo Copying updated files to C:\Program Files\PC Tweak...
robocopy "%~dp0release\win-unpacked" "C:\Program Files\PC Tweak" /E /NDL /NFL /NJH /NJS

echo Launching updated PC Tweak...
start "" "C:\Program Files\PC Tweak\PC Tweak.exe"

echo ========================================================
echo Deployment Complete!
echo ========================================================
