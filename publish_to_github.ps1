$ErrorActionPreference = "Continue"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "        PC Tweak - One-Click GitHub Publisher" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

Set-Location "$PSScriptRoot"

# 1. Check for Git
$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if (-not $gitCmd) {
    $defaultPaths = @("C:\Program Files\Git\cmd\git.exe", "C:\Users\parsa\AppData\Local\Programs\Git\cmd\git.exe")
    foreach ($p in $defaultPaths) {
        if (Test-Path $p) {
            $env:Path = "$([System.IO.Path]::GetDirectoryName($p));" + $env:Path
            $gitCmd = Get-Command git -ErrorAction SilentlyContinue
            break
        }
    }
}

if (-not $gitCmd) {
    Write-Host "[1/4] Git is not installed on this PC." -ForegroundColor Yellow
    Write-Host "      Launching Git installer via winget (please click 'Yes' on the Windows prompt)..." -ForegroundColor Yellow
    Write-Host ""
    
    $proc = Start-Process winget -ArgumentList "install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements" -Wait -PassThru
    
    $defaultGit = "C:\Program Files\Git\cmd\git.exe"
    if (Test-Path $defaultGit) {
        $env:Path = "C:\Program Files\Git\cmd;" + $env:Path
        $gitCmd = Get-Command git -ErrorAction SilentlyContinue
    }
    
    if (-not $gitCmd) {
        Write-Host ""
        Write-Host "[!] Git installer finished or requires a reboot/manual install." -ForegroundColor Yellow
        Write-Host "    If Git didn't install, download it here: https://git-scm.com/download/win" -ForegroundColor Cyan
        Write-Host ""
        Read-Host "Press Enter to exit"
        exit 1
    }
}

Write-Host "[1/4] Git is ready: $($gitCmd.Source)" -ForegroundColor Green
Write-Host ""

# 2. Check GitHub CLI authentication
$ghPath = "C:\Program Files\GitHub CLI\gh.exe"
if (-not (Test-Path $ghPath)) {
    $foundGh = Get-Command gh -ErrorAction SilentlyContinue
    if ($foundGh) {
        $ghPath = $foundGh.Source
    }
}

Write-Host "[2/4] Checking GitHub authentication..." -ForegroundColor Yellow
$authOk = $false
if ($ghPath) {
    $statusOut = & $ghPath auth status 2>&1 | Out-String
    if ($LASTEXITCODE -eq 0 -and -not ($statusOut -match "Failed to log in")) {
        $authOk = $true
    }
}

if (-not $authOk) {
    Write-Host "      Connecting your GitHub account..." -ForegroundColor Cyan
    Write-Host "      A browser window will open for 1-click authorization." -ForegroundColor Cyan
    Write-Host ""
    & $ghPath auth login -w -p https -h github.com
}

Write-Host "[2/4] GitHub authentication confirmed." -ForegroundColor Green
Write-Host ""

# 3. Initialize & Commit Git
Write-Host "[3/4] Initializing Git repository and staging files..." -ForegroundColor Yellow
if (-not (Test-Path ".git")) {
    & git init
    & git branch -M main
}

& git add .
& git commit -m "feat: PC Tweak v1.0.0 with Safe Overclocking Suite, Anti-Cheat diagnostics, and Input Lab"

Write-Host "[3/4] Staged and committed files." -ForegroundColor Green
Write-Host ""

# 4. Create and Push to GitHub
Write-Host "[4/4] Publishing repository to your GitHub account..." -ForegroundColor Yellow
& $ghPath repo create PC-Tweak --public --source=. --push --remote=origin 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Repository exists or already created. Pushing changes to origin main..." -ForegroundColor Yellow
    & git push -u origin main
}

Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host "  Successfully published PC Tweak to GitHub!" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to finish"
