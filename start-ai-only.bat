@echo off
setlocal enabledelayedexpansion
title My Wardrobe - Dedicated AI Engine (RTX GPU Microservice)
cd /d "%~dp0"

echo ======================================================================
echo    MY WARDROBE - DEDICATED AI MICROSERVICE (GPU ENGINE)
echo    Supports: Remote Production Linux Server ^<--^> On-Premise GPU Host
echo ======================================================================
echo.

:: 1. Ensure ComfyUI backend and extensions are present
if not exist "%~dp0local-ai\ComfyUI\main.py" (
    echo [INFO] ComfyUI repository not found. Cloning ComfyUI...
    git clone https://github.com/comfyanonymous/ComfyUI.git "%~dp0local-ai\ComfyUI"
)
if not exist "%~dp0local-ai\ComfyUI\custom_nodes\ComfyUI-GGUF" (
    echo [INFO] Cloning ComfyUI-GGUF extension...
    git clone https://github.com/city96/ComfyUI-GGUF.git "%~dp0local-ai\ComfyUI\custom_nodes\ComfyUI-GGUF"
)
if not exist "%~dp0local-ai\ComfyUI\extra_model_paths.yaml" (
    if exist "%USERPROFILE%\Documents\ComfyUI" (
        (
            echo shared_comfyui:
            echo     base_path: %USERPROFILE:\=/%/Documents/ComfyUI/
            echo     checkpoints: models/checkpoints/
            echo     vae: models/vae/
            echo     text_encoders: models/text_encoders/
            echo     diffusion_models: models/diffusion_models/
        ) > "%~dp0local-ai\ComfyUI\extra_model_paths.yaml"
    )
)

:: 2. Locate Python virtual environment
set "PYTHON_EXE=%~dp0local-ai\.venv\Scripts\python.exe"
if not exist "%PYTHON_EXE%" (
    echo [INFO] Dedicated local environment not found at local-ai\.venv.
    echo [INFO] Initializing environment with uv...
    where uv >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] 'uv' or Python 3.11 virtual environment required at local-ai\.venv.
        pause
        exit /b 1
    )
    call uv venv local-ai\.venv --python 3.11
    call uv pip install torch torchvision --extra-index-url https://download.pytorch.org/whl/cu128 -r local-ai\ComfyUI\requirements.txt -r local-ai\ComfyUI\custom_nodes\ComfyUI-GGUF\requirements.txt -r local-ai\requirements.txt --python "%PYTHON_EXE%"
)

:: 2. Check & Start ComfyUI Backend (Port 8188)
echo [1/3] Checking ComfyUI backend engine on port 8188...
curl.exe -s http://127.0.0.1:8188/system_stats >nul 2>&1
if not errorlevel 1 (
    echo       [OK] ComfyUI backend is already running on port 8188.
) else (
    echo       [INFO] Starting ComfyUI backend engine on 0.0.0.0:8188...
    start "MyWardrobe-ComfyUI" /B "%PYTHON_EXE%" "%~dp0local-ai\ComfyUI\main.py" --listen 0.0.0.0 --port 8188 --extra-model-paths-config "%~dp0local-ai\ComfyUI\extra_model_paths.yaml" > "%~dp0local-ai\comfyui.log" 2>&1

    echo       [INFO] Waiting for ComfyUI backend to initialize...
    set "ATTEMPTS=0"
    :wait_comfy
    ping 127.0.0.1 -n 2 >nul
    set /a ATTEMPTS+=1
    curl.exe -s http://127.0.0.1:8188/system_stats >nul 2>&1
    if not errorlevel 1 (
        echo       [OK] ComfyUI backend engine is active on port 8188!
        goto :network_info
    )
    if !ATTEMPTS! lss 45 goto :wait_comfy
    echo       [WARN] ComfyUI is taking longer than expected. Check local-ai\comfyui.log.
)

:network_info
:: 3. Detect and display Local Network IP Addresses
echo.
echo [2/3] Detecting Host IP Addresses for Remote Linux Connection:
echo       --------------------------------------------------------------
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address" /c:"Adresse IPv4"') do (
    set "ADDR=%%a"
    set "ADDR=!ADDR: =!"
    echo       * LAN Endpoint:   http://!ADDR!:8000
)
echo       * Local Endpoint: http://localhost:8000
echo       --------------------------------------------------------------
echo.
echo [3/3] Configuration for your Production Linux Server:
echo       --------------------------------------------------------------
echo       Option A (Same LAN or Tailscale/VPN):
echo         Set in your Linux server's .env:
echo         LOCAL_AI_URL=http://^<YOUR_WINDOWS_PC_IP^>:8000
echo.
echo       Option B (Public VPS via Cloudflare Tunnel - Recommended):
echo         Run on this Windows PC:
echo         cloudflared tunnel --url http://localhost:8000
echo         Then set in Linux server's .env:
echo         LOCAL_AI_URL=https://^<your-tunnel-subdomain^>.trycloudflare.com
echo       --------------------------------------------------------------
echo.
echo ======================================================================
echo    Starting FastAPI Local AI Gateway on 0.0.0.0:8000...
echo    Real-time request logs will stream below.
echo    To stop all AI services, close this window or run stop-ai.bat.
echo ======================================================================
echo.

cd /d "%~dp0local-ai"
"%PYTHON_EXE%" -m uvicorn main:app --host 0.0.0.0 --port 8000
