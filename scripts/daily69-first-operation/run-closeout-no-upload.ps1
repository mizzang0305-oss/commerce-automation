[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$WorktreeRoot,
    [Parameter(Mandatory = $true)][string]$QueueRoot,
    [Parameter(Mandatory = $true)][string]$Namespace,
    [Parameter(Mandatory = $true)][string]$SourceRoot,
    [Parameter(Mandatory = $true)][string]$ExpectedGitHead,
    [Parameter(Mandatory = $true)][string]$EnvFile
)
$ErrorActionPreference = "Stop"
$taskName = "Minz-Commerce-Daily69-Closeout-NoUpload-V1"

function Write-CloseoutSummary {
    param([string]$Outcome, [string]$SafeError, [int]$ExitCode, [string]$State)
    [ordered]@{
        event = 'daily69_closeout_wrapper_completed'
        state = $State
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
        -InvocationRole closeout -TaskName $taskName -WrapperPath $PSCommandPath

    $idle = Test-Daily69CloseoutIdle -ResolvedQueue $resolvedQueue
    if (-not $idle.idle) {
        Complete-Daily69InvocationEvidence -Outcome guard_blocked -ChildExitCode 3 -WrapperExitCode 3 -SafeError $idle.safeCode
        Disable-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue | Out-Null
        Write-CloseoutSummary -Outcome guard_blocked -SafeError $idle.safeCode -ExitCode 3 -State PENDING
        exit 3
    }

    foreach ($name in @("Minz-Commerce-VideoBatch-NoUpload-V1", "Minz-Commerce-ControlRunner-NoUpload-V1")) {
        Disable-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue | Out-Null
    }
    $preflightOutput = @(& npm.cmd run daily69:first-day:preflight --silent -- --sheets 2>&1)
    $preflightExit = $LASTEXITCODE
    if ($preflightExit -ne 0) {
        $safeError = Get-Daily69SafeCodeFromOutput -Lines $preflightOutput -Fallback 'FIRST_OPERATION_PREFLIGHT_FAILED'
        $resolution = Resolve-Daily69FailureOutcome -SafeCode $safeError
        Stop-FirstOperationFailClosed -Reason $resolution.safeError | Out-Null
        Disable-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue | Out-Null
        Complete-Daily69InvocationEvidence -Outcome $resolution.outcome -ChildExitCode $preflightExit -WrapperExitCode $resolution.wrapperExitCode -SafeError $resolution.safeError
        Write-CloseoutSummary -Outcome $resolution.outcome -SafeError $resolution.safeError -ExitCode $resolution.wrapperExitCode -State FAILED
        exit $resolution.wrapperExitCode
    }

    # The Task Scheduler 201/102 completion events for this action do not exist
    # until this PowerShell process exits. Project the final state here and let
    # the separately scheduled finalizer bind those events before it runs the
    # exact Level-3 closeout validator.
    $projectionOutput = @(& npm.cmd run queue-control:project --silent 2>&1)
    $projectionExit = $LASTEXITCODE
    Disable-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue | Out-Null
    if ($projectionExit -eq 0) {
        $resolution = [pscustomobject]@{ outcome = 'success'; safeError = ''; wrapperExitCode = 0 }
    } else {
        $safeError = Get-Daily69SafeCodeFromOutput -Lines $projectionOutput -Fallback 'QUEUE_PROJECTION_FAILED'
        $resolution = Resolve-Daily69FailureOutcome -SafeCode $safeError
    }
    if ($resolution.wrapperExitCode -ge 3) { Stop-FirstOperationFailClosed -Reason $resolution.safeError | Out-Null }
    $counters = Get-Daily69CountersFromOutput -Lines $projectionOutput
    Complete-Daily69InvocationEvidence -Outcome $resolution.outcome -ChildExitCode $projectionExit -WrapperExitCode $resolution.wrapperExitCode `
        -SafeError $resolution.safeError -Claimed $counters.claimed -Completed $counters.completed -Failed $counters.failed -Retried $counters.retried
    $closeoutState = if ($resolution.wrapperExitCode -eq 0) { 'PENDING_FINALIZER' } else { 'FAILED' }
    Write-CloseoutSummary -Outcome $resolution.outcome -SafeError $resolution.safeError -ExitCode $resolution.wrapperExitCode -State $closeoutState
    exit $resolution.wrapperExitCode
} catch {
    $safeError = if (Get-Command ConvertTo-Daily69SafeCode -ErrorAction SilentlyContinue) {
        ConvertTo-Daily69SafeCode -Value $_.Exception.Message
    } else { 'UNEXPECTED_EXCEPTION' }
    $resolution = if (Get-Command Resolve-Daily69FailureOutcome -ErrorAction SilentlyContinue) {
        Resolve-Daily69FailureOutcome -SafeCode $safeError
    } else { [pscustomobject]@{ outcome = 'unexpected_exception'; safeError = 'UNEXPECTED_EXCEPTION'; wrapperExitCode = 5 } }
    if (Get-Command Stop-FirstOperationFailClosed -ErrorAction SilentlyContinue) { Stop-FirstOperationFailClosed -Reason $resolution.safeError | Out-Null }
    Disable-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue | Out-Null
    if (Get-Command Complete-Daily69InvocationEvidence -ErrorAction SilentlyContinue) {
        try { Complete-Daily69InvocationEvidence -Outcome $resolution.outcome -ChildExitCode -1 -WrapperExitCode $resolution.wrapperExitCode -SafeError $resolution.safeError } catch { }
    }
    Write-CloseoutSummary -Outcome $resolution.outcome -SafeError $resolution.safeError -ExitCode $resolution.wrapperExitCode -State FAILED
    exit $resolution.wrapperExitCode
}
