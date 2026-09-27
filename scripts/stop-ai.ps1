<#
.SYNOPSIS
    Stops all local My Wardrobe AI services (ports 8000 and 8188).
#>

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "   Stopping My Wardrobe Local AI Services..." -ForegroundColor Yellow
Write-Host "======================================================================" -ForegroundColor Cyan

$ports = @(8000, 8188)
$stopped = 0

foreach ($port in $ports) {
    try {
        $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        foreach ($conn in $conns) {
            $pidToKill = $conn.OwningProcess
            if ($pidToKill) {
                Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
                Write-Host ("   [OK] Stopped process listening on port {0} (PID {1})" -f $port, $pidToKill) -ForegroundColor Green
                $stopped++
            }
        }
    } catch {}
}

if ($stopped -eq 0) {
    Write-Host "   [INFO] No active processes found on ports 8000 or 8188." -ForegroundColor DarkGray
} else {
    Write-Host "`n   [SUCCESS] All AI services stopped cleanly." -ForegroundColor Green
}
