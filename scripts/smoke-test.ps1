<#
.SYNOPSIS
    Cursivis Gradient AI backend smoke test.
    Tests /health, /agent (routing metadata), and /analyze against DigitalOcean Gradient AI.

.PARAMETER ModelAccessKey
    DigitalOcean MODEL_ACCESS_KEY. Falls back to $env:MODEL_ACCESS_KEY if not provided.

.PARAMETER BackendUrl
    Backend URL. Defaults to http://127.0.0.1:8080

.PARAMETER Text
    Text to send in the analyze and agent requests.

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

$passed = 0
$failed = 0

function Invoke-SmokeRequest {
    param([string]$Label, [scriptblock]$Block)
    try {
        & $Block
        Write-Host "$Label : PASS"
        $script:passed += 1
    } catch {
        Write-Warning "$Label : FAIL — $($_.Exception.Message)"
        $script:failed += 1
    }
}

# ── 1. Health check ───────────────────────────────────────────────────────────
Invoke-SmokeRequest "Health /health" {
    $health = Invoke-RestMethod -Method Get -Uri "$BackendUrl/health" -TimeoutSec 10
    if (-not $health.ok) { throw "ok != true" }
    Write-Host "  service  : $($health.service)"
    Write-Host "  version  : $($health.version)"
    Write-Host "  provider : $($health.provider)"
    Write-Host "  text     : $($health.models.text)"
    Write-Host "  vision   : $($health.models.vision)"
    Write-Host "  embedding: $($health.models.embedding)"
    Write-Host "  creds    : $($health.credentialsConfigured)"
}

# ── 2. /agent — main agentic endpoint with routing metadata ───────────────────
Invoke-SmokeRequest "Agent  /agent" {
    $body = @{ text = $Text; mode = "smart" } | ConvertTo-Json -Depth 4
    $r = Invoke-RestMethod -Method Post -Uri "$BackendUrl/agent" `
        -ContentType "application/json" -Body $body -TimeoutSec 60
    if (-not $r.result) { throw "no result" }
    $sample = [string]$r.result
    if ($sample.Length -gt 180) { $sample = $sample.Substring(0, 180) + "..." }
    Write-Host "  detectedType     : $($r.detectedType)"
    Write-Host "  selectedAction   : $($r.selectedAction)"
    Write-Host "  routingConfidence: $($r.routingConfidence)"
    Write-Host "  routingReasoning : $($r.routingReasoning)"
    Write-Host "  model            : $($r.model)"
    Write-Host "  latencyMs        : $($r.latencyMs)"
    Write-Host "  result           : $sample"
}

# ── 3. /analyze — legacy companion route ─────────────────────────────────────
Invoke-SmokeRequest "Analyze /analyze" {
    $body = @{
        protocolVersion = "1.0.0"
        requestId       = [Guid]::NewGuid().ToString()
        mode            = "smart"
        actionHint      = "summarize"
        selection       = @{ kind = "text"; text = $Text }
        context         = @{ activeApp = "smoke-test"; cursorX = 100; cursorY = 100 }
        timestampUtc    = (Get-Date).ToUniversalTime().ToString("o")
    } | ConvertTo-Json -Depth 8
    $r = Invoke-RestMethod -Method Post -Uri "$BackendUrl/analyze" `
        -ContentType "application/json" -Body $body -TimeoutSec 60
    if (-not $r.result) { throw "no result" }
    $sample = [string]$r.result
    if ($sample.Length -gt 180) { $sample = $sample.Substring(0, 180) + "..." }
    Write-Host "  action    : $($r.action)"
    Write-Host "  model     : $($r.model)"
    Write-Host "  confidence: $($r.confidence)"
    Write-Host "  latencyMs : $($r.latencyMs)"
    Write-Host "  result    : $sample"
}

# ── 4. /embed — semantic ranking ──────────────────────────────────────────────
Invoke-SmokeRequest "Embed  /embed" {
    $body = @{
        query = "AI platform deployment"
        items = @("DigitalOcean App Platform", "Chocolate cake recipe", "Serverless inference API", "Node.js backend")
    } | ConvertTo-Json -Depth 4
    $r = Invoke-RestMethod -Method Post -Uri "$BackendUrl/embed" `
        -ContentType "application/json" -Body $body -TimeoutSec 30
    if (-not $r.ranked) { throw "no ranked results" }
    $top = $r.ranked[0].item
    Write-Host "  model     : $($r.model)"
    Write-Host "  top match : $top"
}

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Results: $passed passed, $failed failed."
if ($failed -gt 0) {
    Write-Warning "Some tests failed. Check backend logs."
    exit 1
}
Write-Host "Smoke test PASSED."
exit 0
