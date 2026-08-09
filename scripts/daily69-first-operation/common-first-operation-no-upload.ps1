param(
    [Parameter(Mandatory = $true)][string]$WorktreeRoot,
    [Parameter(Mandatory = $true)][string]$QueueRoot,
    [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9_-]{1,96}$')][string]$Namespace,
    [Parameter(Mandatory = $true)][string]$SourceRoot,
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-f0-9]{40}$')][string]$ExpectedGitHead,
    [Parameter(Mandatory = $true)][string]$EnvFile
)
$ErrorActionPreference = "Stop"
$resolvedWorktree = (Resolve-Path -LiteralPath $WorktreeRoot).Path
$resolvedQueue = (Resolve-Path -LiteralPath $QueueRoot).Path
$resolvedSource = (Resolve-Path -LiteralPath $SourceRoot).Path
$resolvedEnv = (Resolve-Path -LiteralPath $EnvFile).Path
$actualHead = (& git.exe -C $resolvedWorktree rev-parse HEAD 2>$null | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $actualHead -ne $ExpectedGitHead) { throw "RUNTIME_GIT_HEAD_MISMATCH" }
. (Join-Path $resolvedWorktree "scripts\queue-control-integration\common-control-no-upload.ps1") -WorktreeRoot $resolvedWorktree -QueueRoot $resolvedQueue -Namespace $Namespace -EnvFile $resolvedEnv
. (Join-Path $resolvedWorktree "scripts\queue-scheduler\common-no-upload.ps1") -WorktreeRoot $resolvedWorktree -EnvFile $resolvedEnv
$env:QUEUE_SCHEDULER_ROOT = $resolvedQueue
$env:QUEUE_CONTROL_NAMESPACE = $Namespace
$env:FIRST_OPERATION_SOURCE_ROOT = $resolvedSource
$env:QUEUE_SCHEDULER_EXPECTED_GIT_HEAD = $ExpectedGitHead
$env:SAFE_TO_UPLOAD = "false"
$env:SAFE_TO_PUBLIC_UPLOAD = "false"
$env:YOUTUBE_AUTO_UPLOAD = "false"
$env:PUBLIC_UPLOAD = "false"
$env:UNLISTED_UPLOAD = "false"
$env:TIKTOK_AUTO_UPLOAD = "false"
$env:THREADS_AUTO_POST = "false"
$env:COMMENT_AUTOMATION = "false"
$env:GOOGLE_DRIVE_VIDEO_UPLOAD = "false"

function Stop-FirstOperationFailClosed {
    param([string]$Reason)
    try { & npm.cmd run daily69:first-day:emergency-pause --silent | Out-Null } catch { }
    foreach ($name in @("Minz-Commerce-VideoBatch-NoUpload-V1", "Minz-Commerce-ControlRunner-NoUpload-V1")) {
        try { Disable-ScheduledTask -TaskName $name -ErrorAction Stop | Out-Null } catch { }
    }
    [pscustomobject]@{ event = "daily69_first_operation_kill_switch"; safeError = $Reason; claim = 0; enabled = $false; isPaused = $true; SAFE_TO_UPLOAD = $false; PLATFORM_UPLOAD = 0 } | ConvertTo-Json -Compress | Write-Error
}
