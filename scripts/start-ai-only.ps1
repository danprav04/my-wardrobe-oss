<#
.SYNOPSIS
    Starts only the AI microservice and ComfyUI GPU engine for My Wardrobe.
.DESCRIPTION
    Designed for when the main web app and PostgreSQL database run on a remote Linux server,
    while this local Windows machine with NVIDIA RTX GPU acts as the AI compute node.
#>

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }
Set-Location $ScriptDir

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "   MY WARDROBE - DEDICATED AI MICROSERVICE (GPU ENGINE)" -ForegroundColor Green
Write-Host "   Supports: Remote Production Linux Server <--> On-Premise GPU Host" -ForegroundColor White
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Ensure ComfyUI and extensions are present
$ComfyDir = Join-Path $ScriptDir "local-ai\ComfyUI"
if (-not (Test-Path (Join-Path $ComfyDir "main.py"))) {
    Write-Host "[INFO] ComfyUI repository not found. Cloning ComfyUI..." -ForegroundColor Cyan
    git clone https://github.com/comfyanonymous/ComfyUI.git $ComfyDir
}
$GgufDir = Join-Path $ComfyDir "custom_nodes\ComfyUI-GGUF"
if (-not (Test-Path $GgufDir)) {
    Write-Host "[INFO] Cloning ComfyUI-GGUF extension..." -ForegroundColor Cyan
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

# 2. Verify Virtual Environment
$PythonExe = Join-Path $ScriptDir "local-ai\.venv\Scripts\python.exe"
if (-not (Test-Path $PythonExe)) {
    Write-Host "[INFO] Virtual environment not found at local-ai\.venv. Initializing..." -ForegroundColor Yellow
    uv venv local-ai\.venv --python 3.11
    uv pip install torch torchvision --extra-index-url https://download.pytorch.org/whl/cu128 `
        -r local-ai\ComfyUI\requirements.txt `
        -r local-ai\ComfyUI\custom_nodes\ComfyUI-GGUF\requirements.txt `
        -r local-ai\requirements.txt `
        --python $PythonExe
}

# 2. Check ComfyUI on Port 8188
Write-Host "[1/3] Checking ComfyUI backend on port 8188..." -ForegroundColor Cyan
$comfyRunning = $false
try {
    $resp = Invoke-RestMethod -Uri "http://127.0.0.1:8188/system_stats" -TimeoutSec 2 -ErrorAction SilentlyContinue
    if ($resp) { $comfyRunning = $true }
} catch {
    $comfyRunning = $false
}

$comfyProc = $null
if ($comfyRunning) {
    Write-Host "      [OK] ComfyUI backend is already running on port 8188." -ForegroundColor Green
} else {
    Write-Host "      [INFO] Launching ComfyUI backend engine on 0.0.0.0:8188..." -ForegroundColor Yellow
    $comfyScript = Join-Path $ScriptDir "local-ai\ComfyUI\main.py"
    $comfyConfig = Join-Path $ScriptDir "local-ai\ComfyUI\extra_model_paths.yaml"
    $comfyLog    = Join-Path $ScriptDir "local-ai\comfyui.log"

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $PythonExe
    $psi.Arguments = "`"$comfyScript`" --listen 0.0.0.0 --port 8188 --extra-model-paths-config `"$comfyConfig`""
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true

    $comfyProc = [System.Diagnostics.Process]::Start($psi)

    Write-Host "      [INFO] Waiting for ComfyUI backend to initialize..." -ForegroundColor DarkGray
    $attempts = 0
    while ($attempts -lt 40) {
        Start-Sleep -Seconds 1
        $attempts++
        try {
            $check = Invoke-RestMethod -Uri "http://127.0.0.1:8188/system_stats" -TimeoutSec 1 -ErrorAction SilentlyContinue
            if ($check) {
                Write-Host "      [OK] ComfyUI backend engine is active on port 8188!" -ForegroundColor Green
                break
            }
        } catch {}
    }
}

# 3. Detect and display Local Network IP Addresses
Write-Host ""
Write-Host "[2/3] Host IP Endpoints for Remote Linux Server:" -ForegroundColor Cyan
Write-Host "      --------------------------------------------------------------" -ForegroundColor DarkGray

$adapters = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" }
foreach ($ip in $adapters) {
    Write-Host ("      * Endpoint ({0}): http://{1}:8000" -f $ip.InterfaceAlias, $ip.IPAddress) -ForegroundColor White
}
Write-Host "      * Localhost: http://localhost:8000" -ForegroundColor DarkGray
Write-Host "      --------------------------------------------------------------" -ForegroundColor DarkGray

# 4. Instructions for remote Linux connection
Write-Host ""
Write-Host "[3/3] Configuration for your Production Linux Server:" -ForegroundColor Cyan
Write-Host "      --------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "      Option A (Same Network or Tailscale/VPN):" -ForegroundColor Yellow
Write-Host "        Set in your Linux server's .env:" -ForegroundColor White
Write-Host "        LOCAL_AI_URL=http://<YOUR_WINDOWS_PC_IP>:8000" -ForegroundColor Green
Write-Host ""
Write-Host "      Option B (Public VPS via Cloudflare Tunnel - Recommended):" -ForegroundColor Yellow
Write-Host "        Run in a separate PowerShell window on this PC:" -ForegroundColor White
Write-Host "        cloudflared tunnel --url http://localhost:8000" -ForegroundColor Green
Write-Host "        Then set in Linux server's .env:" -ForegroundColor White
Write-Host "        LOCAL_AI_URL=https://<your-tunnel-subdomain>.trycloudflare.com" -ForegroundColor Green
Write-Host "      --------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host ""

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "   Starting FastAPI Local AI Gateway on 0.0.0.0:8000..." -ForegroundColor Green
Write-Host "   Real-time request logs will stream below." -ForegroundColor White
Write-Host "   Press Ctrl+C to terminate." -ForegroundColor DarkGray
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

Set-Location (Join-Path $ScriptDir "local-ai")
try {
    & $PythonExe -m uvicorn main:app --host 0.0.0.0 --port 8000
} finally {
    if ($comfyProc -and -not $comfyProc.HasExited) {
        Write-Host "`nStopping background ComfyUI process..." -ForegroundColor Yellow
        $comfyProc.Kill()
    }
}
