# Crawler runner — called by Windows Task Scheduler every 2 hours
$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $PSScriptRoot
$logFile    = "$PSScriptRoot\scraper.log"
$nodeDir    = "C:\Program Files\nodejs"

# Rotate log if over 10 MB
if ((Test-Path $logFile) -and ((Get-Item $logFile).Length -gt 10MB)) {
  Move-Item $logFile "$logFile.bak" -Force
}

# Timestamp header
$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content $logFile "`n`n=== Run started $stamp ==="

# Load .env.local
Get-Content "$projectDir\.env.local" | ForEach-Object {
  if ($_ -match '^\s*([^#=][^=]*)=(.*)$') {
    [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process')
  }
}

$env:PATH = "$nodeDir;" + $env:PATH

Set-Location $projectDir
& "$projectDir\node_modules\.bin\tsx.cmd" scraper/index.ts *>> $logFile

$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content $logFile "=== Run finished $stamp ==="
