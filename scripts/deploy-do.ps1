<#
.SYNOPSIS
    Deploy Cursivis Gradient Agent to DigitalOcean App Platform.

.DESCRIPTION
    Uses the doctl CLI to create or update the App Platform deployment
    from the .do/app.yaml spec file.

.PARAMETER ModelAccessKey
    DigitalOcean MODEL_ACCESS_KEY to inject as a secret env var.

.PARAMETER AppId
    Existing App Platform app ID to update. If not provided, creates a new app.

.EXAMPLE
    # First deploy
    powershell -ExecutionPolicy Bypass -File .\scripts\deploy-do.ps1 -ModelAccessKey "dop_v1_..."

    # Update existing app
    powershell -ExecutionPolicy Bypass -File .\scripts\deploy-do.ps1 -AppId "abc123" -ModelAccessKey "dop_v1_..."
#>
param(
    [string]$ModelAccessKey,
    [string]$AppId,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
    Write-Host "Usage:"
    Write-Host "  powershell -ExecutionPolicy Bypass -File .\scripts\deploy-do.ps1 -ModelAccessKey <KEY> [-AppId <ID>]"
    Write-Host ""
    Write-Host "Prerequisites:"
    Write-Host "  1. Install doctl: https://docs.digitalocean.com/reference/doctl/how-to/install/"
    Write-Host "  2. Authenticate: doctl auth init"
    Write-Host "  3. Get MODEL_ACCESS_KEY from: https://cloud.digitalocean.com/agent-platform/serverless-inference"
    return
}

$root     = Split-Path -Parent $PSScriptRoot
$appYaml  = Join-Path $root ".do\app.yaml"

# Check doctl is installed
try {
    $doctlVersion = & doctl version 2>&1
    Write-Host "doctl: $doctlVersion"
} catch {
    Write-Error "doctl not found. Install it from: https://docs.digitalocean.com/reference/doctl/how-to/install/"
    exit 1
}

# Check app.yaml exists
if (-not (Test-Path $appYaml)) {
    Write-Error "app.yaml not found at: $appYaml"
    exit 1
}

Write-Host "App spec: $appYaml"

if ($AppId) {
    Write-Host "Updating existing app: $AppId"
    & doctl apps update $AppId --spec $appYaml
} else {
    Write-Host "Creating new App Platform app..."
    & doctl apps create --spec $appYaml
}

if ($LASTEXITCODE -ne 0) {
    Write-Error "Deployment failed. Check doctl output above."
    exit 1
}

Write-Host ""
Write-Host "Deployment initiated."
Write-Host "Monitor progress: https://cloud.digitalocean.com/apps"
Write-Host ""
Write-Host "After deployment, set MODEL_ACCESS_KEY as a secret in the App Platform dashboard:"
Write-Host "  App Settings → Environment Variables → Add Secret → MODEL_ACCESS_KEY"
if ($ModelAccessKey) {
    Write-Host ""
    Write-Host "Or set it via doctl:"
    Write-Host "  doctl apps update <APP_ID> --spec .do/app.yaml"
}
