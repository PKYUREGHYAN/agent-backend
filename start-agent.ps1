
$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot
$PythonAI = Join-Path $Root "python_ai"
$Frontend = Join-Path $Root "frontend"

$NodeServer = Join-Path $Root "server.cjs"
$PythonAIStartup = Join-Path $PythonAI "start-ai.ps1"
$FrontendPackage = Join-Path $Frontend "package.json"

Write-Host ""
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "       AGENT_1 STARTUP" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

if (!(Test-Path $NodeServer)) {
    throw "Չգտնվեց server.cjs ֆայլը։"
}

if (!(Test-Path $PythonAIStartup)) {
    throw "Չգտնվեց Python AI start script-ը։"
}

if (!(Test-Path $FrontendPackage)) {
    throw "Չգտնվեց frontend/package.json ֆայլը։"
}

if (!(Test-Path (Join-Path $Frontend "node_modules"))) {
    Write-Host "Frontend dependencies-ը տեղադրված չեն։" -ForegroundColor Red
    Write-Host "Բացիր առանձին տերմինալ և կատարիր՝"
    Write-Host "cd `"$Frontend`""
    Write-Host "npm install"
    throw "Կանգնեցվեց։ Տեղադրիր dependencies-ը և կրկին փորձիր։"
}

$LanIp = (
    Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -match '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)' -and
            $_.PrefixOrigin -ne "WellKnown"
        } |
        Select-Object -First 1 -ExpandProperty IPAddress
)

Write-Host "`n[1/3] Starting Node.js Backend..." -ForegroundColor Yellow

Start-Process `
    -FilePath "node" `
    -ArgumentList "server.cjs" `
    -WorkingDirectory $Root

Write-Host "[2/3] Starting Python AI API..." -ForegroundColor Yellow

Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PythonAIStartup`"" `
    -WorkingDirectory $PythonAI

Write-Host "[3/3] Starting Frontend..." -ForegroundColor Yellow

Start-Process `
    -FilePath "npm.cmd" `
    -ArgumentList "run dev -- --host" `
    -WorkingDirectory $Frontend

Write-Host "`nStartup commands sent." -ForegroundColor Green
Write-Host "Համակարգիչ՝  http://127.0.0.1:5173"
if ($LanIp) {
    Write-Host "Հեռախոս (նույն Wi-Fi)՝  http://${LanIp}:5173" -ForegroundColor Cyan
} else {
    Write-Host "Հեռախոսի IP-ն չգտնվեց։ Տես `ipconfig` և բացիր http://<քո-IP>:5173"
}
Write-Host "Backend:   http://0.0.0.0:5000"
Write-Host "Python AI: http://0.0.0.0:8000"
Write-Host "`nՀեռախոսում բացիր նույն Wi-Fi-ով։ Windows Firewall-ը թույլ տուր 5173, 5000, 8000 պորտերին։"
