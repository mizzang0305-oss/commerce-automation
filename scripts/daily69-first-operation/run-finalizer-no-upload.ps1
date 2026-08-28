[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$WorktreeRoot,
    [Parameter(Mandatory = $true)][string]$QueueRoot,
    [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9_-]{1,96}$')][string]$Namespace,
    [Parameter(Mandatory = $true)][string]$SourceRoot,
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-f0-9]{40}$')][string]$ExpectedGitHead,
    [Parameter(Mandatory = $true)][string]$EnvFile
)
$ErrorActionPreference = "Stop"

function Write-FinalizerSummary {
    param([string]$Outcome, [string]$SafeError, [int]$ExitCode)
    [ordered]@{
        event = 'daily69_natural_closeout_finalizer_wrapper_completed'
        outcome = $Outcome
        safeError = $SafeError
        exitCode = $ExitCode
        SAFE_TO_UPLOAD = $false
        PLATFORM_UPLOAD = 0
    } | ConvertTo-Json -Compress | Write-Output
}

function Safe-Code([object]$Value, [string]$Fallback) {
    $candidate = [string]$Value
    if ($candidate -match '^[A-Z0-9_:-]{1,160}$') { return $candidate }
    return $Fallback
}

try {
    $root = (Resolve-Path -LiteralPath $WorktreeRoot).Path
    $queue = (Resolve-Path -LiteralPath $QueueRoot).Path
    $source = (Resolve-Path -LiteralPath $SourceRoot).Path
    $envPath = (Resolve-Path -LiteralPath $EnvFile).Path
    if ((Split-Path -Leaf $queue) -ne $Namespace) { throw 'FIRST_OPERATION_NAMESPACE_MISMATCH' }
    $actualHead = (& git.exe -C $root rev-parse HEAD 2>$null | Out-String).Trim()
    $gitExitCode = $LASTEXITCODE
    if ($gitExitCode -ne 0 -or $actualHead -ne $ExpectedGitHead) { throw 'RUNTIME_GIT_HEAD_MISMATCH' }
    $manifest = Get-Content -LiteralPath (Join-Path $queue 'operation-manifest.json') -Raw -Encoding utf8 | ConvertFrom-Json
    if ([string]$manifest.namespace -ne $Namespace -or [string]$manifest.expectedGitHead -ne $ExpectedGitHead) { throw 'FIRST_OPERATION_TASK_BINDING_MISMATCH' }

    . (Join-Path $root 'scripts\queue-control-integration\common-control-no-upload.ps1') -WorktreeRoot $root -QueueRoot $queue -Namespace $Namespace -EnvFile $envPath
    . (Join-Path $root 'scripts\queue-scheduler\common-no-upload.ps1') -WorktreeRoot $root -EnvFile $envPath
    $env:QUEUE_SCHEDULER_ROOT = $queue
    $env:QUEUE_CONTROL_NAMESPACE = $Namespace
    $env:FIRST_OPERATION_SOURCE_ROOT = $source
    $env:QUEUE_SCHEDULER_EXPECTED_GIT_HEAD = $ExpectedGitHead
    $env:SAFE_TO_UPLOAD = 'false'
    $env:SAFE_TO_PUBLIC_UPLOAD = 'false'
    $env:YOUTUBE_AUTO_UPLOAD = 'false'
    $env:TIKTOK_AUTO_UPLOAD = 'false'
    $env:THREADS_AUTO_POST = 'false'
    $env:COMMENT_AUTOMATION = 'false'
    $output = @(& npm.cmd run daily69:first-day:finalize-natural-closeout --silent -- --queue-root $queue 2>&1)
    $childExit = $LASTEXITCODE
    if ($childExit -eq 0) {
        Write-FinalizerSummary -Outcome success -SafeError '' -ExitCode 0
        exit 0
    }
    $safeError = 'DAILY69_NATURAL_CLOSEOUT_FINALIZER_FAILED'
    foreach ($line in $output) {
        try {
            $value = ([string]$line) | ConvertFrom-Json -ErrorAction Stop
            if ($value.safeError) { $safeError = Safe-Code $value.safeError $safeError; break }
        } catch { }
    }
    $exitCode = if ($childExit -eq 2) { 2 } else { 3 }
    Write-FinalizerSummary -Outcome $(if ($exitCode -eq 2) { 'pending' } else { 'failed' }) -SafeError $safeError -ExitCode $exitCode
    exit $exitCode
} catch {
    $safeError = Safe-Code $_.Exception.Message 'DAILY69_NATURAL_CLOSEOUT_FINALIZER_UNEXPECTED'
    Write-FinalizerSummary -Outcome failed -SafeError $safeError -ExitCode 3
    exit 3
}
