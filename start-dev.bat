@echo off
title My Wardrobe - Local Dev Environment
cd /d "%~dp0"

powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0scripts\start-dev.ps1" %*
if errorlevel 1 (
    echo.
    echo [ERROR] Development environment stopped with an error code.
    pause
)
