<#
.SYNOPSIS
    Starts the full local development environment for My Wardrobe.
.DESCRIPTION
    Orchestrates and boots:
    1. PostgreSQL Database (port 5432 via Docker Compose or native)
    2. ComfyUI GPU Backend Engine (port 8188 via PyTorch CUDA)
    3. Local AI FastAPI Gateway (port 8000 via uvicorn)
    4. SvelteKit Web Application (port 5173 via Vite with live HMR)
#>

param(
    [switch]$NoFrontend = $false
)

$ErrorActionPreference = "Continue"
$ScriptDir = Split-Path -Parent $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }
Set-Location $ScriptDir

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "   MY WARDROBE - FULL LOCAL DEVELOPMENT ENVIRONMENT" -ForegroundColor Green
Write-Host "   Booting Database, GPU AI Backend, API Gateway, and Web UI" -ForegroundColor White
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

# -----------------------------------------------------------------------------
# 1. PostgreSQL Database (Port 5432)
# -----------------------------------------------------------------------------
Write-Host "[1/4] Checking PostgreSQL database on port 5432..." -ForegroundColor Cyan

$dbListening = [bool](Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue)

if ($dbListening) {
    Write-Host "      [OK] PostgreSQL is active and listening on port 5432." -ForegroundColor Green
} else {
    Write-Host "      [INFO] PostgreSQL not detected on port 5432. Checking Docker..." -ForegroundColor Yellow
    
    # Check if Docker daemon is responsive
    $dockerReady = $false
    try {
        & docker info > $null 2>&1
        if ($LASTEXITCODE -eq 0) { $dockerReady = $true }
    } catch {}

    if (-not $dockerReady) {
        $dockerDesktop = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
        if (Test-Path $dockerDesktop) {
            Write-Host "      [INFO] Starting Docker Desktop..." -ForegroundColor Yellow
            Start-Process $dockerDesktop
            Write-Host "      [INFO] Waiting for Docker daemon to become ready..." -ForegroundColor DarkGray
            
            $dAttempts = 0
            while ($dAttempts -lt 30) {
                Start-Sleep -Seconds 2
                $dAttempts++
                try {
                    & docker info > $null 2>&1
                    if ($LASTEXITCODE -eq 0) {
                        $dockerReady = $true
                        Write-Host "      [OK] Docker daemon is ready!" -ForegroundColor Green
                        break
                    }
                } catch {}
            }
        }
    }

    if ($dockerReady) {
        Write-Host "      [INFO] Starting database container (docker compose up -d db)..." -ForegroundColor Yellow
        & docker compose up -d db
        
        Write-Host "      [INFO] Waiting for PostgreSQL port 5432..." -ForegroundColor DarkGray
        $dbAttempts = 0
        while ($dbAttempts -lt 25) {
            Start-Sleep -Seconds 1
            $dbAttempts++
            $dbListening = [bool](Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue)
            if ($dbListening) {
                Write-Host "      [OK] PostgreSQL database is active on port 5432!" -ForegroundColor Green
                break
            }
        }
    } else {
        Write-Host "      [WARN] Docker daemon could not be reached automatically." -ForegroundColor Yellow
        Write-Host "             If you are using a native or external PostgreSQL, please make sure it is running." -ForegroundColor DarkGray
    }
}

# -----------------------------------------------------------------------------
# 2. ComfyUI GPU Backend Engine (Port 8188)
# -----------------------------------------------------------------------------
Write-Host ""
Write-Host "[2/4] Checking ComfyUI GPU backend on port 8188..." -ForegroundColor Cyan

# Ensure ComfyUI and extensions exist
$ComfyDir = Join-Path $ScriptDir "local-ai\ComfyUI"
if (-not (Test-Path (Join-Path $ComfyDir "main.py"))) {
    Write-Host "      [INFO] ComfyUI repository not found. Cloning ComfyUI..." -ForegroundColor Cyan
    git clone https://github.com/comfyanonymous/ComfyUI.git $ComfyDir
}
$GgufDir = Join-Path $ComfyDir "custom_nodes\ComfyUI-GGUF"
if (-not (Test-Path $GgufDir)) {
    Write-Host "      [INFO] Cloning ComfyUI-GGUF extension..." -ForegroundColor Cyan
    git clone https://github.com/city96/ComfyUI-GGUF.git $GgufDir
}
$comfyConfig = Join-Path $ComfyDir "extra_model_paths.yaml"
if (-not (Test-Path $comfyConfig)) {
    $sharedDir = Join-Path $env:USERPROFILE "Documents\ComfyUI"
    if (Test-Path $sharedDir) {
        $sharedPathNorm = $sharedDir.Replace('\', '/') + '/'
        @"
shared_comfyui:
    base_path: $sharedPathNorm
    checkpoints: models/checkpoints/
    vae: models/vae/
    text_encoders: models/text_encoders/
    diffusion_models: models/diffusion_models/
"@ | Set-Content -Path $comfyConfig -Encoding UTF8
    }
}

# Locate Python environment
$PythonExe = Join-Path $ScriptDir "local-ai\.venv\Scripts\python.exe"
if (-not (Test-Path $PythonExe)) {
    Write-Host "      [INFO] Virtual environment not found at local-ai\.venv. Initializing..." -ForegroundColor Yellow
    uv venv (Join-Path $ScriptDir "local-ai\.venv") --python 3.11
    uv pip install torch torchvision --extra-index-url https://download.pytorch.org/whl/cu128 `
        -r (Join-Path $ScriptDir "local-ai\ComfyUI\requirements.txt") `
        -r (Join-Path $ScriptDir "local-ai\ComfyUI\custom_nodes\ComfyUI-GGUF\requirements.txt") `
        -r (Join-Path $ScriptDir "local-ai\requirements.txt") `
        --python $PythonExe
}

$comfyRunning = $false
try {
    $resp = Invoke-RestMethod -Uri "http://127.0.0.1:8188/system_stats" -TimeoutSec 2 -ErrorAction SilentlyContinue
    if ($resp) { $comfyRunning = $true }
} catch {}

if ($comfyRunning) {
    Write-Host "      [OK] ComfyUI backend is already running on port 8188." -ForegroundColor Green
} else {
    Write-Host "      [INFO] Starting ComfyUI backend engine on 0.0.0.0:8188..." -ForegroundColor Yellow
    $comfyScript = Join-Path $ScriptDir "local-ai\ComfyUI\main.py"
    $comfyLogOut = Join-Path $ScriptDir "local-ai\comfyui.log"
    $comfyLogErr = Join-Path $ScriptDir "local-ai\comfyui.err.log"
    $comfyConfig = Join-Path $ScriptDir "local-ai\ComfyUI\extra_model_paths.yaml"

    $comfyArgs = "`"$comfyScript`" --listen 0.0.0.0 --port 8188 --extra-model-paths-config `"$comfyConfig`""
    Start-Process -FilePath $PythonExe -ArgumentList $comfyArgs -RedirectStandardOutput $comfyLogOut -RedirectStandardError $comfyLogErr -WindowStyle Hidden

    Write-Host "      [INFO] Waiting for ComfyUI backend to initialize..." -ForegroundColor DarkGray
    $cAttempts = 0
    while ($cAttempts -lt 40) {
        Start-Sleep -Seconds 1
        $cAttempts++
        try {
            $check = Invoke-RestMethod -Uri "http://127.0.0.1:8188/system_stats" -TimeoutSec 1 -ErrorAction SilentlyContinue
            if ($check) {
                Write-Host "      [OK] ComfyUI GPU backend is active on port 8188!" -ForegroundColor Green
                $comfyRunning = $true
                break
            }
        } catch {}
    }
    if (-not $comfyRunning) {
        Write-Host "      [WARN] ComfyUI is taking longer than expected. Check local-ai\comfyui.log." -ForegroundColor Yellow
    }
}

# -----------------------------------------------------------------------------
# 3. Local AI FastAPI Gateway (Port 8000)
# -----------------------------------------------------------------------------
Write-Host ""
Write-Host "[3/4] Checking Local AI FastAPI Gateway on port 8000..." -ForegroundColor Cyan

$fastApiRunning = $false
try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:8000/docs" -TimeoutSec 2 -ErrorAction SilentlyContinue
    if ($r) { $fastApiRunning = $true }
} catch {
    if ($_.Exception.Response) { $fastApiRunning = $true }
}

if ($fastApiRunning) {
    Write-Host "      [OK] Local AI FastAPI Gateway is already running on port 8000." -ForegroundColor Green
} else {
    Write-Host "      [INFO] Starting FastAPI Gateway on 0.0.0.0:8000..." -ForegroundColor Yellow
    $uvicornLogOut = Join-Path $ScriptDir "local-ai\uvicorn.log"
    $uvicornLogErr = Join-Path $ScriptDir "local-ai\uvicorn.err.log"

    $fastApiArgs = "-m uvicorn main:app --host 0.0.0.0 --port 8000"
    Start-Process -FilePath $PythonExe -ArgumentList $fastApiArgs -WorkingDirectory (Join-Path $ScriptDir "local-ai") -RedirectStandardOutput $uvicornLogOut -RedirectStandardError $uvicornLogErr -WindowStyle Hidden

    Write-Host "      [INFO] Waiting for FastAPI Gateway to initialize..." -ForegroundColor DarkGray
    $fAttempts = 0
    while ($fAttempts -lt 25) {
        Start-Sleep -Seconds 1
        $fAttempts++
        try {
            $resp = Invoke-RestMethod -Uri "http://127.0.0.1:8000/docs" -TimeoutSec 1 -ErrorAction SilentlyContinue
            if ($resp) {
                $fastApiRunning = $true
                Write-Host "      [OK] Local AI FastAPI Gateway is active on port 8000!" -ForegroundColor Green
                break
            }
        } catch {
            if ($_.Exception.Response) {
                $fastApiRunning = $true
                Write-Host "      [OK] Local AI FastAPI Gateway is active on port 8000!" -ForegroundColor Green
                break
            }
        }
    }
    if (-not $fastApiRunning) {
        Write-Host "      [WARN] FastAPI Gateway took longer than expected. Check local-ai\uvicorn.log." -ForegroundColor Yellow
    }
}

# -----------------------------------------------------------------------------
# 4. SvelteKit Web Application (Port 5173)
# -----------------------------------------------------------------------------
Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "   MY WARDROBE - DEVELOPMENT ENVIRONMENT ACTIVE" -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "   * Web Application:     http://localhost:5173" -ForegroundColor White
Write-Host "   * Local AI Gateway:    http://localhost:8000 (Docs: /docs)" -ForegroundColor White
Write-Host "   * ComfyUI GPU Engine:  http://localhost:8188" -ForegroundColor White
Write-Host "   * PostgreSQL Database: localhost:5432 (Database: wardrobe)" -ForegroundColor White
Write-Host "   ------------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "   * Service Logs:" -ForegroundColor Gray
Write-Host "     - Web Server:        Streaming live below in this window" -ForegroundColor Gray
Write-Host "     - Local AI Gateway:  local-ai\uvicorn.log" -ForegroundColor Gray
Write-Host "     - ComfyUI Engine:    local-ai\comfyui.log" -ForegroundColor Gray
Write-Host "   * Shutdown:" -ForegroundColor Gray
Write-Host "     - To stop web server: Press Ctrl+C in this terminal" -ForegroundColor Gray
Write-Host "     - To stop everything: Run stop-dev.bat (or npm run dev:stop)" -ForegroundColor Yellow
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""
if (-not $NoFrontend) {
    Write-Host "Starting Vite development server with --open..." -ForegroundColor Green
    Write-Host ""

    try {
        npm run dev -- --open
    } finally {
        Write-Host ""
        Write-Host "======================================================================" -ForegroundColor Cyan
        Write-Host "   [INFO] Web development server stopped." -ForegroundColor Yellow
        Write-Host "   [INFO] Background AI services (8000, 8188) and DB container remain active" -ForegroundColor White
        Write-Host "          so subsequent restarts start up immediately." -ForegroundColor White
        Write-Host "   [INFO] To completely stop all services, run: stop-dev.bat" -ForegroundColor Cyan
        Write-Host "======================================================================" -ForegroundColor Cyan
    }
} else {
    Write-Host "[OK] All background services (DB, ComfyUI, FastAPI) are running." -ForegroundColor Green
    Write-Host "     Frontend launch skipped (-NoFrontend specified)." -ForegroundColor DarkGray
}
