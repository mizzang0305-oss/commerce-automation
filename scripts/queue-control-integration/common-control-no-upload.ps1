param(
    [Parameter(Mandatory = $true)][string]$WorktreeRoot,
    [Parameter(Mandatory = $true)][string]$QueueRoot,
    [Parameter(Mandatory = $true)][string]$Namespace,
    [string]$EnvFile = "C:\Users\LOVE\MyProjects\commerce-automation\.env.local"
)
$ErrorActionPreference = "Stop"
$resolvedWorktree = (Resolve-Path -LiteralPath $WorktreeRoot).Path
$resolvedQueue = (Resolve-Path -LiteralPath $QueueRoot).Path
Set-Location -LiteralPath $resolvedWorktree
if (-not (Test-Path -LiteralPath $EnvFile)) { throw "QUEUE_CONTROL_ENV_FILE_MISSING" }
foreach ($line in Get-Content -LiteralPath $EnvFile -Encoding utf8) {
    if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
    $parts = $line -split '=', 2
    $name = $parts[0].Trim()
    $value = $parts[1].Trim().Trim('"').Trim("'")
    if ($name -match '^[A-Z][A-Z0-9_]+$') { [Environment]::SetEnvironmentVariable($name, $value, 'Process') }
}
$env:QUEUE_SCHEDULER_ROOT = $resolvedQueue
$env:QUEUE_CONTROL_NAMESPACE = $Namespace
$env:COMMAND_RUNNER_ID = "daily69-control-runner"
$env:SAFE_TO_UPLOAD = "false"
$env:SAFE_TO_PUBLIC_UPLOAD = "false"
$env:YOUTUBE_AUTO_UPLOAD = "false"
$env:PUBLIC_UPLOAD = "false"
$env:UNLISTED_UPLOAD = "false"
$env:TIKTOK_AUTO_UPLOAD = "false"
$env:THREADS_AUTO_POST = "false"
$env:COMMENT_AUTOMATION = "false"
