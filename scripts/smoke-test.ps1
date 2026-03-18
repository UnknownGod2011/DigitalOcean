<#
.SYNOPSIS
    Cursivis Gradient AI backend smoke test.
    Tests the health endpoint and a real /analyze call against DigitalOcean Gradient AI.

.PARAMETER ModelAccessKey
    DigitalOcean MODEL_ACCESS_KEY. Falls back to $env:MODEL_ACCESS_KEY if not provided.

.PARAMETER BackendUrl
    Backend URL. Defaults to http://127.0.0.1:8080

.PARAMETER Text
    Text to send in the analyze request.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\smoke-test.ps1 -ModelAccessKey "dop_v1_..."
#>
param(
    [string]$ModelAccessKey,
    [string]$BackendUrl = "http://127.0.0.1:8080",
    [string]$Text = "DigitalOcean Gradient AI is a full-stack AI platform for building production-ready AI applications."
)

$ErrorActionPreference = "Stop"

if ($ModelAccessKey) { $env:MODEL_ACCESS_KEY = $ModelAccessKey }

Write-Host "Cursivis Gradient AI backend smoke test"
Write-Host "Backend URL : $BackendUrl"
Write-Host "Model key   : $(if ($env:MODEL_ACCESS_KEY) { '***' + $env:MODEL_ACCESS_KEY.Substring([Math]::Max(0, $env:MODEL_ACCESS_KEY.Length - 4)) } else { '(not set)' })"
Write-Host ""

# ── Health check ──────────────────────────────────────────────────────────────
$healthUrl  = "$BackendUrl/health"
$analyzeUrl = "$BackendUrl/analyze"

try {
    $health = Invoke-RestMethod -Method Get -Uri $healthUrl -TimeoutSec 10
} catch {
    Write-Error "Health check failed: $($_.Exception.Message)"
    Write-Host "Make sure the backend is running: cd backend/gradient-agent && npm install && node src/server.js"
    exit 1
}

if (-not $health.ok) {
    Write-Error "Health check returned unexpected payload: $($health | ConvertTo-Json)"
    exit 1
}

Write-Host "Health check : OK (service: $($health.service))"

# ── Analyze request ───────────────────────────────────────────────────────────
$request = @{
    protocolVersion = "1.0.0"
    requestId       = [Guid]::NewGuid().ToString()
    mode            = "smart"
    actionHint      = "summarize"
    selection       = @{ kind = "text"; text = $Text }
    context         = @{ activeApp = "smoke-test"; cursorX = 100; cursorY = 100 }
    timestampUtc    = (Get-Date).ToUniversalTime().ToString("o")
}

try {
    $response = Invoke-RestMethod -Method Post -Uri $analyzeUrl `
        -ContentType "application/json" `
        -Body ($request | ConvertTo-Json -Depth 8) `
        -TimeoutSec 60
} catch {
    $statusCode = $null
    $bodyText   = $null
    try {
        $httpResponse = $_.Exception.Response
        if ($httpResponse?.StatusCode) { $statusCode = [int]$httpResponse.StatusCode }
        if ($httpResponse?.GetResponseStream) {
            $reader   = New-Object System.IO.StreamReader($httpResponse.GetResponseStream())
            $bodyText = $reader.ReadToEnd()
            $reader.Dispose()
        }
    } catch {}

    if ($statusCode -eq 429) {
        Write-Warning "Rate limited (429). Gradient AI quota temporarily exhausted."
        if ($bodyText) { Write-Host "Details: $bodyText" }
        Write-Host "Wait a moment and retry."
        exit 2
    }

    if ($bodyText) { Write-Error "Analyze request failed ($statusCode): $bodyText" }
    else           { Write-Error "Analyze request failed: $($_.Exception.Message)" }
    exit 1
}

if (-not $response.result) {
    Write-Error "Analyze returned no result text."
    exit 1
}

$sample = [string]$response.result
if ($sample.Length -gt 220) { $sample = $sample.Substring(0, 220) + "..." }

Write-Host ""
Write-Host "Analyze      : OK"
Write-Host "Action       : $($response.action)"
Write-Host "Model        : $($response.model)"
Write-Host "Confidence   : $($response.confidence)"
Write-Host "Latency      : $($response.latencyMs)ms"
Write-Host "Result       : $sample"
Write-Host ""
Write-Host "Smoke test PASSED."
exit 0
