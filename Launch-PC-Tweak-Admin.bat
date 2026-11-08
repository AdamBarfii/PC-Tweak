@echo off
cd /d "%~dp0"
powershell -Command "Start-Process -FilePath '%~dp0release\PC-Tweak\PC Tweak.exe' -Verb RunAs"
