$ErrorActionPreference = "Continue"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "        PC Tweak - One-Click GitHub Publisher" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

Set-Location "C:\Users\parsa\OneDrive\Desktop\PC Tweak"

# 1. Verify Git
$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if (-not $gitCmd) {
    if (Test-Path "C:\Program Files\Git\cmd\git.exe") {
        $env:Path = "C:\Program Files\Git\cmd;" + $env:Path
        $gitCmd = Get-Command git -ErrorAction SilentlyContinue
    }
}

Write-Host "[1/3] Git is installed and ready: $($gitCmd.Source)" -ForegroundColor Green
Write-Host ""

# Ensure Git user config is set
& git config --global user.name "AdamBarfii"
& git config --global user.email "AdamBarfii@users.noreply.github.com"

# 2. Check & Refresh GitHub Authentication
$ghPath = "C:\Program Files\GitHub CLI\gh.exe"
if (-not (Test-Path $ghPath)) {
    $foundGh = Get-Command gh -ErrorAction SilentlyContinue
    if ($foundGh) {
        $ghPath = $foundGh.Source
    }
}

Write-Host "[2/3] Checking GitHub CLI credentials..." -ForegroundColor Yellow
$authOk = $false
if ($ghPath) {
    $statusOut = & $ghPath auth status 2>&1 | Out-String
    if ($LASTEXITCODE -eq 0 -and -not ($statusOut -match "Failed to log in")) {
        $authOk = $true
    }
}

if (-not $authOk) {
    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host "  ACTION REQUIRED: Re-authenticating your GitHub account" -ForegroundColor Cyan
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host "A one-time code will appear below and your browser will open." -ForegroundColor White
    Write-Host "Please confirm the authorization in your browser." -ForegroundColor White
    Write-Host ""
    
    # Try refresh first, fallback to login
    & $ghPath auth refresh -h github.com
    if ($LASTEXITCODE -ne 0) {
        & $ghPath auth login -w -p https -h github.com
    }
}

Write-Host ""
Write-Host "[2/3] GitHub credentials ready." -ForegroundColor Green
Write-Host ""

# 3. Create Remote and Push
Write-Host "[3/3] Creating and pushing repository 'PC-Tweak' to GitHub..." -ForegroundColor Yellow

# Ensure main branch is active
& git branch -M main

# Check if origin remote already exists
$remotes = & git remote
if ($remotes -match "origin") {
    Write-Host "Remote 'origin' exists. Pushing main branch..." -ForegroundColor Yellow
    & git push -u origin main
} else {
    Write-Host "Creating repository on GitHub and pushing files..." -ForegroundColor Yellow
    & $ghPath repo create PC-Tweak --public --source=. --push --remote=origin
}

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host "  PC Tweak is now live on your GitHub!" -ForegroundColor Green
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host "Check your repository at: https://github.com/AdamBarfii/PC-Tweak" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "[!] Push completed with warnings or repository already exists." -ForegroundColor Yellow
    Write-Host "Trying direct push to origin main..." -ForegroundColor Yellow
    & git push -u origin main
}

Write-Host ""
Read-Host "Press Enter to exit"
