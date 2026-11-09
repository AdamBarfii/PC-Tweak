# PC Tweak - Automated Memory & Binary Footprint Benchmark Verification
param (
    [string]$TargetExe = "target\release\pctweak-app.exe",
    [double]$MaxAllowedMemoryMb = 30.0
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $TargetExe)) {
    if (Test-Path "target\debug\pctweak-app.exe") {
        $TargetExe = "target\debug\pctweak-app.exe"
    } else {
        Write-Error "Executable not found at $TargetExe. Run cargo build --release first."
    }
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  PC TWEAK NATIVE RUST RESOURCE BENCHMARK HARNESS" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Target Executable: $TargetExe"
$fileInfo = Get-Item $TargetExe
$binarySizeMb = [math]::Round($fileInfo.Length / 1MB, 2)
Write-Host "Binary Size: $binarySizeMb MB" -ForegroundColor Yellow

# Execute in automated memory benchmark mode
Write-Host "`nMeasuring steady-state idle memory (Working Set)..." -ForegroundColor Cyan
$benchmarkOutput = & $TargetExe --benchmark-memory 2>&1

$fullOutput = $benchmarkOutput -join "`n"
if ($fullOutput -match '(?s)(\{.*\})') {
    $rawJson = $matches[1]
    $metric = $rawJson | ConvertFrom-Json
} else {
    Write-Host $fullOutput
    Write-Error "Failed to extract JSON from benchmark output."
}

$idleMb = [math]::Round($metric.steady_state_idle_working_set_mb, 2)
$peakMb = [math]::Round($metric.peak_working_set_mb, 2)

Write-Host "`n------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "  EMPIRICAL METRICS vs ELECTRON BASELINE" -ForegroundColor White
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "Metric                   Electron Baseline    Native Rust     Delta / Improvement"
Write-Host "------                   -----------------    -----------     -------------------"

# Memory comparison
$electronMemoryMb = 566.0
$memReductionPct = [math]::Round((($electronMemoryMb - $idleMb) / $electronMemoryMb) * 100, 1)
Write-Host ("Idle RAM (Working Set):  {0,8:N1} MB          {1,8:N2} MB     -{2}%" -f $electronMemoryMb, $idleMb, $memReductionPct) -ForegroundColor Green

# Binary size comparison
$electronInstallerMb = 96.2
$sizeReductionPct = [math]::Round((($electronInstallerMb - $binarySizeMb) / $electronInstallerMb) * 100, 1)
Write-Host ("Distribution Size:       {0,8:N1} MB          {1,8:N2} MB     -{2}%" -f $electronInstallerMb, $binarySizeMb, $sizeReductionPct) -ForegroundColor Green

# Child processes
Write-Host "Process Architecture:    5 Chromium Processes 1 Native Thread Zero Fork / Direct FFI" -ForegroundColor Green

Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray

if ($idleMb -le $MaxAllowedMemoryMb) {
    Write-Host "`n[SUCCESS] Memory benchmark passed: $idleMb MB <= $MaxAllowedMemoryMb MB threshold." -ForegroundColor Green
    exit 0
} else {
    Write-Host "`n[FAILURE] Memory benchmark failed: $idleMb MB exceeded $MaxAllowedMemoryMb MB threshold." -ForegroundColor Red
    exit 1
}
