@echo off
title PC Tweak - Publish to GitHub
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Publish to GitHub.ps1"
if %errorlevel% neq 0 (
    echo.
    echo [Script exited with code %errorlevel%]
    pause
)
