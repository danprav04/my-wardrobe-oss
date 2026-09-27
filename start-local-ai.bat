@echo off
setlocal enabledelayedexpansion
title My Wardrobe — Local AI Engine (Qwen-Image-2.1)
cd /d "%~dp0"

echo ======================================================================
echo    My Wardrobe - Dedicated Local AI Engine (Qwen-Image-2.1)
echo    NVIDIA GeForce RTX Blackwell / Tensor Core Acceleration
echo ======================================================================
echo.

:: 1. Ensure ComfyUI and custom nodes are present
if not exist "%~dp0local-ai\ComfyUI\main.py" (
    echo [INFO] ComfyUI repository not found. Cloning ComfyUI...
    git clone https://github.com/comfyanonymous/ComfyUI.git "%~dp0local-ai\ComfyUI"
)
if not exist "%~dp0local-ai\ComfyUI\custom_nodes\ComfyUI-GGUF" (
    echo [INFO] Cloning ComfyUI-GGUF extension...
    git clone https://github.com/city96/ComfyUI-GGUF.git "%~dp0local-ai\ComfyUI\custom_nodes\ComfyUI-GGUF"
)

:: 2. Check Python virtual environment
set "PYTHON_EXE="
if exist "%~dp0local-ai\.venv\Scripts\python.exe" (
    set "PYTHON_EXE=%~dp0local-ai\.venv\Scripts\python.exe"
    echo [OK] Using dedicated local environment: local-ai\.venv
    goto :check_comfy
)

where uv >nul 2>&1
if not errorlevel 1 (
    echo [INFO] Creating dedicated environment with uv...
    call uv venv local-ai\.venv --python 3.11
    call uv pip install torch torchvision --extra-index-url https://download.pytorch.org/whl/cu128 -r local-ai\ComfyUI\requirements.txt -r local-ai\ComfyUI\custom_nodes\ComfyUI-GGUF\requirements.txt --python local-ai\.venv\Scripts\python.exe
    set "PYTHON_EXE=%~dp0local-ai\.venv\Scripts\python.exe"
    goto :check_comfy
)

set "PYTHON_EXE=python"
echo [WARN] local-ai\.venv not found, falling back to system Python.

:check_comfy
:: 2. Check if ComfyUI is already running
curl.exe -s http://127.0.0.1:8188/system_stats >nul 2>&1
if not errorlevel 1 (
    echo [OK] ComfyUI local backend is already active on port 8188.
    goto :ready
)

echo [INFO] Launching dedicated ComfyUI backend engine on 0.0.0.0:8188...
start "MyWardrobe-ComfyUI" /B "%PYTHON_EXE%" "%~dp0local-ai\ComfyUI\main.py" --listen 0.0.0.0 --port 8188 --extra-model-paths-config "%~dp0local-ai\ComfyUI\extra_model_paths.yaml" > "%~dp0local-ai\comfyui.log" 2>&1

echo [INFO] Waiting for ComfyUI backend to initialize...
set "ATTEMPTS=0"
:wait_comfy
ping 127.0.0.1 -n 2 >nul
set /a ATTEMPTS+=1
curl.exe -s http://127.0.0.1:8188/system_stats >nul 2>&1
if not errorlevel 1 (
    echo [OK] ComfyUI engine is active and ready on port 8188.
    goto :ready
)
if !ATTEMPTS! lss 40 goto :wait_comfy
echo [WARN] ComfyUI backend is taking longer than expected. Check local-ai\comfyui.log.

:ready
echo.
echo ======================================================================
echo    Local AI Engine is running!
echo    Docker service 'mywardrobe-local-ai' is connected via port 8188.
echo    Keep this window open while using local image generation.
echo ======================================================================
echo.
pause
