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
Write-Host "[1/3] Git is ready: $($gitCmd.Source)" -ForegroundColor Green

# Ensure Git user config is set
& git config --global user.name "AdamBarfii"
& git config --global user.email "AdamBarfii@users.noreply.github.com"
Write-Host ""

# 2. Check GitHub Authentication
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
    Write-Host "  GitHub Authentication Required" -ForegroundColor Cyan
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host "Choose how you would like to authenticate:" -ForegroundColor White
    Write-Host "  [1] Open Device Login in Browser (Default)" -ForegroundColor Yellow
    Write-Host "  [2] Paste a Personal Access Token (Classic / Fine-grained)" -ForegroundColor Yellow
    Write-Host ""
    
    $choice = Read-Host "Enter option (1 or 2) [Default: 1]"
    if ([string]::IsNullOrWhiteSpace($choice)) { $choice = "1" }
    
    if ($choice -eq "2") {
        Write-Host ""
        Write-Host "Create a token with 'repo' scope at: https://github.com/settings/tokens" -ForegroundColor Cyan
        Start-Process "https://github.com/settings/tokens/new?scopes=repo&description=PC-Tweak-CLI"
        $token = Read-Host "Paste your GitHub Token here"
        if (-not [string]::IsNullOrWhiteSpace($token)) {
            $token.Trim() | & $ghPath auth login --with-token
            Write-Host "Token submitted." -ForegroundColor Green
        }
    } else {
        Write-Host ""
        Write-Host "Attempting to open https://github.com/login/device in your browser..." -ForegroundColor Cyan
        Start-Process "https://github.com/login/device"
        Write-Host "If the browser still does not open, visit: https://github.com/login/device" -ForegroundColor Yellow
        Write-Host ""
        & $ghPath auth login -w -p https -h github.com
    }
}

Write-Host ""
Write-Host "[2/3] GitHub credentials verified." -ForegroundColor Green
Write-Host ""

# 3. Create Remote and Push
Write-Host "[3/3] Publishing repository to your GitHub account..." -ForegroundColor Yellow

# Ensure main branch is active
& git branch -M main

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
    Write-Host "[!] Repository created or already exists. Performing direct push..." -ForegroundColor Yellow
    & git push -u origin main
}

Write-Host ""
Read-Host "Press Enter to exit"
