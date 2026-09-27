@echo off
title Stop My Wardrobe AI Services
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0scripts\stop-ai.ps1"
if errorlevel 1 pause
