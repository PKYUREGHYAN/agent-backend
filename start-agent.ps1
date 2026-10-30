$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot
$PythonAI = Join-Path $Root "python_ai"
$FrontendCandidates = @(
    (Join-Path $Root "frontend"),
    (Join-Path (Split-Path $Root -Parent) "agent1_frontend\frontend")
)
$Frontend = $FrontendCandidates | Where-Object { Test-Path (Join-Path $_ "package.json") } | Select-Object -First 1

$NodeServer = Join-Path $Root "server.cjs"
$PythonAIStartup = Join-Path $PythonAI "start-ai.ps1"

Write-Host ""
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "       AGENT 1 - one terminal" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

if (!(Test-Path $NodeServer)) {
    throw "server.cjs not found"
}

if (!(Test-Path $PythonAIStartup)) {
    throw "python_ai/start-ai.ps1 not found"
}

if (-not $Frontend) {
    throw "frontend/package.json not found (checked agent_1\frontend and ..\agent1_frontend\frontend)"
}

if (!(Test-Path (Join-Path $Frontend "node_modules"))) {
    Write-Host "Frontend dependencies missing. Run:" -ForegroundColor Red
    Write-Host "cd `"$Frontend`""
    Write-Host "npm install"
    throw "Stopped"
}

$LanIp = (
    Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -match '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)' -and
            $_.PrefixOrigin -ne "WellKnown"
        } |
        Select-Object -First 1 -ExpandProperty IPAddress
)

Write-Host "Frontend: $Frontend" -ForegroundColor DarkGray
Write-Host "PC:       http://127.0.0.1:5173"
if ($LanIp) {
    Write-Host "Phone:    http://${LanIp}:5173" -ForegroundColor Cyan
}
Write-Host "API:      http://127.0.0.1:5000"
Write-Host "Python:   http://127.0.0.1:8000"
Write-Host ""
Write-Host "Stop with Ctrl+C" -ForegroundColor Yellow
Write-Host ""

$env:FORCE_COLOR = "1"

npx --yes concurrently -k -n api,ai,web -c blue,magenta,green `
    "node `"$NodeServer`"" `
    "powershell -NoProfile -ExecutionPolicy Bypass -File `"$PythonAIStartup`"" `
    "npm --prefix `"$Frontend`" run dev -- --host"
