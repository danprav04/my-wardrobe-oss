<#
.SYNOPSIS
    Stops all My Wardrobe local development services and background processes.
.DESCRIPTION
    Terminates:
    - Vite dev server (port 5173)
    - FastAPI Local AI Gateway (port 8000)
    - ComfyUI GPU Backend Engine (port 8188)
    - PostgreSQL Docker container (docker compose stop db)
#>

$ScriptDir = Split-Path -Parent $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }
Set-Location $ScriptDir

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "   STOPPING MY WARDROBE LOCAL DEVELOPMENT ENVIRONMENT" -ForegroundColor Yellow
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

$ports = @(
    @{ Port = 5173; Name = "Vite Dev Server" },
    @{ Port = 8000; Name = "FastAPI Local AI Gateway" },
    @{ Port = 8188; Name = "ComfyUI GPU Backend Engine" }
)

$stoppedCount = 0

foreach ($p in $ports) {
    $port = $p.Port
    $name = $p.Name
    try {
        $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        if ($conns) {
            foreach ($conn in $conns) {
                $pidToKill = $conn.OwningProcess
                if ($pidToKill) {
                    $procName = (Get-Process -Id $pidToKill -ErrorAction SilentlyContinue).ProcessName
                    Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
                    Write-Host ("   [OK] Stopped {0} on port {1} (PID {2}, {3})" -f $name, $port, $pidToKill, $procName) -ForegroundColor Green
                    $stoppedCount++
                }
            }
        } else {
            Write-Host ("   [--] {0} (port {1}) was not running." -f $name, $port) -ForegroundColor DarkGray
        }
    } catch {
        Write-Host ("   [WARN] Could not stop process on port {0}: {1}" -f $port, $_.Exception.Message) -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "   Checking Docker PostgreSQL container..." -ForegroundColor Cyan
try {
    & docker compose stop db 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   [OK] PostgreSQL container stopped cleanly." -ForegroundColor Green
    } else {
        Write-Host "   [--] PostgreSQL container was not running." -ForegroundColor DarkGray
    }
} catch {
    Write-Host "   [--] Docker command not available or not active." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "   [SUCCESS] Development environment cleanup complete." -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Cyan
