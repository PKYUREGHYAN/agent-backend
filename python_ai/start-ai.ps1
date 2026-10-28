$ErrorActionPreference = "Stop"

$AiRoot = $PSScriptRoot
$Python = Join-Path $AiRoot "..\iopaint\.venv\Scripts\python.exe"

if (!(Test-Path $Python)) {
    throw "Չգտնվեց shared IOPaint Python միջավայրը՝ $Python"
}

try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:8000/" -TimeoutSec 2
    if ($health.service -eq "agent-1-photo-ai") {
        Write-Host "Local Photo AI-ն արդեն աշխատում է։" -ForegroundColor DarkGreen
        exit 0
    }
} catch {
    # Start the service below when no compatible AI API is listening.
}

& $Python -m uvicorn app:app --app-dir $AiRoot --host 0.0.0.0 --port 8000
