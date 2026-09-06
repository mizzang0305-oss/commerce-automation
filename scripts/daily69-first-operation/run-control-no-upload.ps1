[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$WorktreeRoot,
    [Parameter(Mandatory = $true)][string]$QueueRoot,
    [Parameter(Mandatory = $true)][string]$Namespace,
    [Parameter(Mandatory = $true)][string]$SourceRoot,
    [Parameter(Mandatory = $true)][string]$ExpectedGitHead,
    [Parameter(Mandatory = $true)][string]$EnvFile,
    [Parameter(Mandatory = $true)][string]$CodexRuntimeCapsulePath,
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-f0-9]{64}$')][string]$CodexRuntimeCapsuleManifestSha256,
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-f0-9]{64}$')][string]$CodexRuntimeCapsuleBundleDigest,
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-f0-9]{64}$')][string]$CodexRuntimeBinarySha256
)
$ErrorActionPreference = "Stop"
$taskName = "Minz-Commerce-ControlRunner-NoUpload-V1"

function Write-ControlSummary {
    param([string]$Outcome, [string]$SafeError, [int]$ExitCode)
    [ordered]@{
        event = 'daily69_control_wrapper_completed'
        outcome = $Outcome
        safeError = $SafeError
        exitCode = $ExitCode
        SAFE_TO_UPLOAD = $false
        PLATFORM_UPLOAD = 0
    } | ConvertTo-Json -Compress | Write-Output
}

try {
    . (Join-Path $PSScriptRoot "common-first-operation-no-upload.ps1") `
        -WorktreeRoot $WorktreeRoot -QueueRoot $QueueRoot -Namespace $Namespace `
        -SourceRoot $SourceRoot -ExpectedGitHead $ExpectedGitHead -EnvFile $EnvFile `
        -CodexRuntimeCapsulePath $CodexRuntimeCapsulePath -CodexRuntimeCapsuleManifestSha256 $CodexRuntimeCapsuleManifestSha256 `
        -CodexRuntimeCapsuleBundleDigest $CodexRuntimeCapsuleBundleDigest -CodexRuntimeBinarySha256 $CodexRuntimeBinarySha256 `
        -InvocationRole control -TaskName $taskName -WrapperPath $PSCommandPath

    $window = Test-Daily69NewWorkWindow -ResolvedQueue $resolvedQueue -BoundNamespace $Namespace -Role control
    if (-not $window.allowed) {
        Complete-Daily69InvocationEvidence -Outcome noop -ChildExitCode 0 -WrapperExitCode 0 -SafeError $window.safeCode
        Write-ControlSummary -Outcome noop -SafeError $window.safeCode -ExitCode 0
        exit 0
    }

    $preflightOutput = @(& npm.cmd run daily69:first-day:preflight --silent -- --sheets 2>&1)
    $preflightExit = $LASTEXITCODE
    if ($preflightExit -ne 0) {
        $safeError = Get-Daily69SafeCodeFromOutput -Lines $preflightOutput -Fallback 'FIRST_OPERATION_PREFLIGHT_FAILED'
        $resolution = Resolve-Daily69FailureOutcome -SafeCode $safeError
        Stop-FirstOperationFailClosed -Reason $resolution.safeError | Out-Null
        Complete-Daily69InvocationEvidence -Outcome $resolution.outcome -ChildExitCode $preflightExit -WrapperExitCode $resolution.wrapperExitCode -SafeError $resolution.safeError
        Write-ControlSummary -Outcome $resolution.outcome -SafeError $resolution.safeError -ExitCode $resolution.wrapperExitCode
        exit $resolution.wrapperExitCode
    }

    $controlOutput = @(& npm.cmd run queue-control:run-once --silent 2>&1)
    $controlExit = $LASTEXITCODE
    $resolution = Resolve-Daily69ControlOutcome -ChildExitCode $controlExit -Lines $controlOutput
    $counters = Get-Daily69CountersFromOutput -Lines $controlOutput
    if ($resolution.wrapperExitCode -ne 0) { Stop-FirstOperationFailClosed -Reason $resolution.safeError | Out-Null }
    Complete-Daily69InvocationEvidence -Outcome $resolution.outcome -ChildExitCode $controlExit -WrapperExitCode $resolution.wrapperExitCode `
        -SafeError $resolution.safeError -Claimed $counters.claimed -Completed $counters.completed -Failed $counters.failed -Retried $counters.retried
    Write-ControlSummary -Outcome $resolution.outcome -SafeError $resolution.safeError -ExitCode $resolution.wrapperExitCode
    exit $resolution.wrapperExitCode
} catch {
    $safeError = if (Get-Command ConvertTo-Daily69SafeCode -ErrorAction SilentlyContinue) {
        ConvertTo-Daily69SafeCode -Value $_.Exception.Message
    } else { 'UNEXPECTED_EXCEPTION' }
    $resolution = if (Get-Command Resolve-Daily69FailureOutcome -ErrorAction SilentlyContinue) {
        Resolve-Daily69FailureOutcome -SafeCode $safeError
    } else { [pscustomobject]@{ outcome = 'unexpected_exception'; safeError = 'UNEXPECTED_EXCEPTION'; wrapperExitCode = 5 } }
    if (Get-Command Stop-FirstOperationFailClosed -ErrorAction SilentlyContinue) { Stop-FirstOperationFailClosed -Reason $resolution.safeError | Out-Null }
    if (Get-Command Complete-Daily69InvocationEvidence -ErrorAction SilentlyContinue) {
        try { Complete-Daily69InvocationEvidence -Outcome $resolution.outcome -ChildExitCode -1 -WrapperExitCode $resolution.wrapperExitCode -SafeError $resolution.safeError } catch { }
    }
    Write-ControlSummary -Outcome $resolution.outcome -SafeError $resolution.safeError -ExitCode $resolution.wrapperExitCode
    exit $resolution.wrapperExitCode
}
