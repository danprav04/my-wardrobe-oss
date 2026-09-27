@echo off
title Stop My Wardrobe Dev Environment
cd /d "%~dp0"

powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0scripts\stop-dev.ps1" %*
if errorlevel 1 pause
