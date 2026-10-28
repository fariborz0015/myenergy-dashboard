# Starts the MyEnergy app server (http://localhost:3210) and the API (http://localhost:4000)
# in the background, if they are not already running. Safe to run repeatedly.
#   powershell -ExecutionPolicy Bypass -File scripts\start-myenergy.ps1
# Build once first:  pnpm app:build  and  pnpm --filter @myenergy/api build

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $root '.logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$node = (Get-Command node).Source

function Test-Port([int]$port) {
  [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

if (-not (Test-Port 3210)) {
  Start-Process -FilePath $node -ArgumentList 'scripts/app.mjs', 'start' `
    -WorkingDirectory (Join-Path $root 'apps\web') -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logs 'app.log') -RedirectStandardError (Join-Path $logs 'app.err.log')
  Write-Host 'MyEnergy app started on http://localhost:3210'
} else {
  Write-Host 'MyEnergy app already running on http://localhost:3210'
}

$api = Join-Path $root 'apps\api'
if (-not (Test-Port 4000)) {
  if (Test-Path (Join-Path $api 'dist\main.js')) {
    if (-not (Test-Path (Join-Path $api '.env'))) { Copy-Item (Join-Path $api '.env.example') (Join-Path $api '.env') }
    Start-Process -FilePath $node -ArgumentList 'dist/main.js' `
      -WorkingDirectory $api -WindowStyle Hidden `
      -RedirectStandardOutput (Join-Path $logs 'api.log') -RedirectStandardError (Join-Path $logs 'api.err.log')
    Write-Host 'MyEnergy API started on http://localhost:4000'
  } else {
    Write-Host 'API not built (pnpm --filter @myenergy/api build) - the app still works without it.'
  }
} else {
  Write-Host 'MyEnergy API already running on http://localhost:4000'
}
