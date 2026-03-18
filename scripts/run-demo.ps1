<#
.SYNOPSIS
    Launch the full Cursivis Gradient AI demo stack.
    Starts: backend, browser action agent, extension bridge, companion app.

.PARAMETER ModelAccessKey
    DigitalOcean MODEL_ACCESS_KEY. Falls back to $env:MODEL_ACCESS_KEY if not provided.

.PARAMETER BackendUrl
    Backend URL for the companion app. Defaults to http://127.0.0.1:8080

.PARAMETER WithBridge
    Also launch the Logitech bridge plugin.

.PARAMETER EnableAutoReplace
    Enable auto-replace mode in the companion app.

.PARAMETER AutoReplaceConfidence
    Confidence threshold for auto-replace (default: 0.90).

.PARAMETER EnableManagedBrowserFallback
    Enable the managed Playwright browser fallback.

.PARAMETER SkipNpmInstall
    Skip npm install (use if already installed).

.PARAMETER SkipCleanup
    Skip pre-launch cleanup of existing processes.

.PARAMETER NoHealthCheck
    Skip health check polling after launch.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\run-demo.ps1 -ModelAccessKey "dop_v1_..."
#>
param(
    [string]$ModelAccessKey,
    [string]$BackendUrl = "http://127.0.0.1:8080",
    [switch]$WithBridge,
    [switch]$EnableAutoReplace,
    [double]$AutoReplaceConfidence = 0.90,
    [switch]$EnableManagedBrowserFallback,
    [switch]$WarmManagedBrowser,
    [switch]$SkipNpmInstall,
    [switch]$SkipCleanup,
    [switch]$NoHealthCheck,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
    Write-Host "Usage:"
    Write-Host "  powershell -ExecutionPolicy Bypass -File .\scripts\run-demo.ps1 [-ModelAccessKey <KEY>] [-BackendUrl <URL>] [-WithBridge] [-EnableAutoReplace]"
    return
}

$root             = Split-Path -Parent $PSScriptRoot
$backendDir       = Join-Path $root "backend\gradient-agent"
$browserAgentDir  = Join-Path $root "desktop\browser-action-agent"
$extensionBridgeDir = Join-Path $root "desktop\browser-native-host"
$companionProject = Join-Path $root "desktop\cursivis-companion\src\Cursivis.Companion\Cursivis.Companion.csproj"
$bridgeProject    = Join-Path $root "plugin\logitech-plugin\src\Cursivis.Logitech.Bridge\Cursivis.Logitech.Bridge.csproj"

Write-Host "Starting Cursivis Gradient AI demo stack..."
Write-Host "Backend dir  : $backendDir"
Write-Host "Browser agent: $browserAgentDir"
Write-Host "Companion    : $companionProject"
Write-Host ""

if (-not $SkipCleanup) {
    try {
        Write-Host "Running pre-launch cleanup..."
        & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "stop-demo.ps1") | Out-Host
    } catch {
        Write-Warning "Cleanup step failed: $($_.Exception.Message)"
    }
}

# Resolve MODEL_ACCESS_KEY
if ($ModelAccessKey) { $resolvedKey = $ModelAccessKey }
else                 { $resolvedKey = $env:MODEL_ACCESS_KEY }

if (-not $resolvedKey) {
    Write-Warning "MODEL_ACCESS_KEY not set. Gradient AI calls will fail."
    Write-Warning "Set -ModelAccessKey or set the MODEL_ACCESS_KEY environment variable."
    Write-Warning "Get your key at: https://cloud.digitalocean.com/agent-platform/serverless-inference"
} else {
    Write-Host "Model key    : ***$($resolvedKey.Substring([Math]::Max(0, $resolvedKey.Length - 4)))"
}

$keyEscaped = if ($resolvedKey) { $resolvedKey.Replace("'", "''") } else { "" }

# ── Launch backend ────────────────────────────────────────────────────────────
$backendCmdParts = @(
    "`$env:MODEL_ACCESS_KEY='$keyEscaped'",
    "Set-Location -LiteralPath '$backendDir'"
)
if (-not $SkipNpmInstall) { $backendCmdParts += "npm install" }
$backendCmdParts += "npm start"
$backendCmd = $backendCmdParts -join "; "
$backendProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd -PassThru

# ── Launch browser action agent ───────────────────────────────────────────────
$browserAgentCmdParts = @(
    "`$env:CURSIVIS_BROWSER_CHANNEL='chrome'",
    "Set-Location -LiteralPath '$browserAgentDir'"
)
if (-not $SkipNpmInstall) { $browserAgentCmdParts += "npm install" }
$browserAgentCmdParts += "npm start"
$browserAgentCmd = $browserAgentCmdParts -join "; "
$browserAgentProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", $browserAgentCmd -PassThru

# ── Launch extension bridge ───────────────────────────────────────────────────
$extensionBridgeCmd = "Set-Location -LiteralPath '$extensionBridgeDir'; .\launch.cmd"
$extensionBridgeProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", $extensionBridgeCmd -PassThru

Start-Sleep -Seconds 2

# ── Launch companion app ──────────────────────────────────────────────────────
$autoReplaceConfidenceInvariant = $AutoReplaceConfidence.ToString([System.Globalization.CultureInfo]::InvariantCulture)
$managedBrowserFallbackValue    = if ($EnableManagedBrowserFallback) { "true" } else { "false" }
$escapedBackendUrl              = $BackendUrl.Replace("'", "''")

$companionCmdParts = @(
    "`$env:CURSIVIS_BACKEND_URL='$escapedBackendUrl'",
    "`$env:CURSIVIS_ENABLE_MANAGED_BROWSER_FALLBACK='$managedBrowserFallbackValue'"
)
if ($EnableAutoReplace) {
    $companionCmdParts += "`$env:CURSIVIS_ENABLE_AUTO_REPLACE='true'"
    $companionCmdParts += "`$env:CURSIVIS_AUTO_REPLACE_CONFIDENCE='$autoReplaceConfidenceInvariant'"
}
$companionCmdParts += "dotnet run --project '$companionProject'"
$companionCmd = $companionCmdParts -join "; "
$companionProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", $companionCmd -PassThru

# ── Optionally launch Logitech bridge ─────────────────────────────────────────
if ($WithBridge) {
    Start-Sleep -Seconds 1
    $bridgeProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "dotnet run --project '$bridgeProject'" -PassThru
    Write-Host "Bridge PID   : $($bridgeProcess.Id)"
}

# ── Health check polling ──────────────────────────────────────────────────────
if (-not $NoHealthCheck) {
    $healthOk = $false
    $deadline = (Get-Date).AddSeconds(40)
    while ((Get-Date) -lt $deadline) {
        try {
            $health = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:8080/health" -TimeoutSec 4
            if ($health.StatusCode -eq 200) { $healthOk = $true; Write-Host "Backend health: OK"; break }
        } catch { Start-Sleep -Milliseconds 700 }
    }
    if (-not $healthOk) { Write-Warning "Backend health check did not return 200 yet. Check backend terminal output." }

    $browserHealthOk = $false
    $browserDeadline = (Get-Date).AddSeconds(25)
    while ((Get-Date) -lt $browserDeadline) {
        try {
            $browserHealth = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:48820/health" -TimeoutSec 4
            if ($browserHealth.StatusCode -eq 200) { $browserHealthOk = $true; Write-Host "Browser agent health: OK"; break }
        } catch { Start-Sleep -Milliseconds 500 }
    }
    if (-not $browserHealthOk) { Write-Warning "Browser action agent health check did not return 200 yet." }
    elseif ($WarmManagedBrowser -and $EnableManagedBrowserFallback) {
        try {
            Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:48820/ensure-browser" -Method Post -ContentType "application/json" -Body "{}" -TimeoutSec 12 | Out-Null
            Write-Host "Managed browser session: ready"
        } catch { Write-Warning "Could not warm the managed browser session yet." }
    }

    $bridgeHealthOk = $false
    $bridgeDeadline = (Get-Date).AddSeconds(20)
    while ((Get-Date) -lt $bridgeDeadline) {
        try {
            $bridgeHealth = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:48830/health" -TimeoutSec 4
            if ($bridgeHealth.StatusCode -eq 200) { $bridgeHealthOk = $true; Write-Host "Extension bridge health: OK"; break }
        } catch { Start-Sleep -Milliseconds 400 }
    }
    if (-not $bridgeHealthOk) { Write-Warning "Extension bridge health check did not return 200 yet." }
}

Write-Host ""
Write-Host "Backend PID      : $($backendProcess.Id)"
Write-Host "Browser agent PID: $($browserAgentProcess.Id)"
Write-Host "Extension PID    : $($extensionBridgeProcess.Id)"
Write-Host "Companion PID    : $($companionProcess.Id)"
Write-Host ""
Write-Host "Tip: close the spawned PowerShell windows to stop each component."
Write-Host "Tip: run scripts\smoke-test.ps1 to verify the backend is working."
