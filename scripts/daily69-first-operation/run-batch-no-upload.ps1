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
$taskName = "Minz-Commerce-VideoBatch-NoUpload-V1"

function Write-BatchSummary {
    param([string]$Outcome, [string]$SafeError, [int]$ExitCode, [string]$Slot)
    [ordered]@{
        event = 'daily69_batch_wrapper_completed'
        outcome = $Outcome
        safeError = $SafeError
        exitCode = $ExitCode
        slot = $Slot
        SAFE_TO_UPLOAD = $false
        PLATFORM_UPLOAD = 0
    } | ConvertTo-Json -Compress | Write-Output
}

function Write-SanitizedBatchResult {
    param([string]$ResolvedQueue, [string]$InvocationId, [object[]]$Lines)
    $directory = Join-Path $ResolvedQueue 'batch-results'
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $path = Join-Path $directory "batch-$InvocationId.jsonl"
    $encoding = New-Object Text.UTF8Encoding($false)
    $stream = [IO.File]::Open($path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
    try {
        $writer = New-Object IO.StreamWriter($stream, $encoding)
        try {
            $record = Select-Daily69SanitizedBatchRecord -Lines $Lines
            $json = $record | ConvertTo-Json -Depth 6 -Compress
            $roundTrip = $json | ConvertFrom-Json -ErrorAction Stop
            if ([string]$roundTrip.event -ne [string]$record.event -or [string]$roundTrip.schemaVersion -ne 'daily69-retained-batch-result-v1') { throw 'BATCH_RESULT_JSON_ROUNDTRIP_FAILED' }
            $writer.WriteLine($json)
            $writer.Flush()
            $stream.Flush($true)
        } finally { $writer.Dispose() }
    } finally { $stream.Dispose() }
    return $record
}

try {
    . (Join-Path $PSScriptRoot "common-first-operation-no-upload.ps1") `
        -WorktreeRoot $WorktreeRoot -QueueRoot $QueueRoot -Namespace $Namespace `
        -SourceRoot $SourceRoot -ExpectedGitHead $ExpectedGitHead -EnvFile $EnvFile `
        -CodexRuntimeCapsulePath $CodexRuntimeCapsulePath -CodexRuntimeCapsuleManifestSha256 $CodexRuntimeCapsuleManifestSha256 `
        -CodexRuntimeCapsuleBundleDigest $CodexRuntimeCapsuleBundleDigest -CodexRuntimeBinarySha256 $CodexRuntimeBinarySha256 `
        -InvocationRole batch -TaskName $taskName -WrapperPath $PSCommandPath

    $slotClaim = Claim-Daily69BatchSlot -ResolvedQueue $resolvedQueue -BoundNamespace $Namespace
    if (-not $slotClaim.claimed) {
        Complete-Daily69InvocationEvidence -Outcome noop -ChildExitCode 0 -WrapperExitCode 0 -SafeError $slotClaim.safeCode
        Write-BatchSummary -Outcome noop -SafeError $slotClaim.safeCode -ExitCode 0 -Slot $slotClaim.slot
        exit 0
    }

    $preflightOutput = @(& npm.cmd run daily69:first-day:preflight --silent -- --runtime --sheets 2>&1)
    $preflightExit = $LASTEXITCODE
    if ($preflightExit -ne 0) {
        $safeError = Get-Daily69SafeCodeFromOutput -Lines $preflightOutput -Fallback 'FIRST_OPERATION_PREFLIGHT_FAILED'
        $resolution = Resolve-Daily69FailureOutcome -SafeCode $safeError
        Stop-FirstOperationFailClosed -Reason $resolution.safeError | Out-Null
        Complete-Daily69InvocationEvidence -Outcome $resolution.outcome -ChildExitCode $preflightExit -WrapperExitCode $resolution.wrapperExitCode -SafeError $resolution.safeError
        Write-BatchSummary -Outcome $resolution.outcome -SafeError $resolution.safeError -ExitCode $resolution.wrapperExitCode -Slot $slotClaim.slot
        exit $resolution.wrapperExitCode
    }

    $batchCapture = Invoke-Daily69Utf8NpmScript -ScriptName 'queue-video:run-next' -WorkingDirectory $resolvedWorktree
    $batchOutput = @($batchCapture.combinedLines)
    $batchExit = $batchCapture.exitCode
    $retainedBatchRecord = Write-SanitizedBatchResult -ResolvedQueue $resolvedQueue -InvocationId $Daily69InvocationId -Lines $batchOutput
    $batchEvidenceValid = Test-Daily69RetainedBatchExitContract -Record $retainedBatchRecord -ChildExitCode $batchExit
    if ($batchEvidenceValid) {
        $projectionOutput = @(& npm.cmd run queue-control:project --silent 2>&1)
        $projectionExit = $LASTEXITCODE
    } else {
        # Never publish queue state or a successful Task receipt when the child
        # exit code is not cross-bound to one exact retained terminal envelope.
        $projectionOutput = @()
        $projectionExit = -1
    }
    $counters = Get-Daily69CountersFromOutput -Lines @(($retainedBatchRecord | ConvertTo-Json -Depth 6 -Compress))

    if (($batchExit -eq 0 -or $batchExit -eq 2) -and -not $batchEvidenceValid) {
        $recordSafeError = ConvertTo-Daily69SafeCode -Value ([string]$retainedBatchRecord.safeError) -Fallback 'BATCH_RESULT_EXIT_CONTRACT_INVALID'
        $safeError = if ([string]::IsNullOrEmpty([string]$retainedBatchRecord.safeError)) { 'BATCH_RESULT_EXIT_CONTRACT_INVALID' } else { $recordSafeError }
        $resolution = Resolve-Daily69FailureOutcome -SafeCode $safeError
    } elseif ($batchExit -eq 0 -and $projectionExit -eq 0) {
        $resolution = [pscustomobject]@{ outcome = 'success'; safeError = ''; wrapperExitCode = 0 }
    } elseif ($batchExit -eq 2 -and $projectionExit -eq 0) {
        # A slot-local partial is an honest retained outcome but a successful
        # scheduler invocation. Keeping wrapper exit 0 allows the next natural
        # trigger to run; childExitCode and BATCH_PARTIAL remain preserved.
        $resolution = [pscustomobject]@{ outcome = 'partial'; safeError = 'BATCH_PARTIAL'; wrapperExitCode = 0 }
    } else {
        $safeError = if ($batchExit -ne 0) {
            Get-Daily69SafeCodeFromOutput -Lines $batchOutput -Fallback $(if ($batchExit -eq 3) { 'QUEUE_BATCH_BLOCKED_PREFLIGHT' } else { 'FIRST_OPERATION_BATCH_FAILED' })
        } else { Get-Daily69SafeCodeFromOutput -Lines $projectionOutput -Fallback 'QUEUE_PROJECTION_FAILED' }
        $resolution = Resolve-Daily69FailureOutcome -SafeCode $safeError
    }
    if ($resolution.wrapperExitCode -ge 3) { Stop-FirstOperationFailClosed -Reason $resolution.safeError | Out-Null }
    Complete-Daily69InvocationEvidence -Outcome $resolution.outcome -ChildExitCode $batchExit -WrapperExitCode $resolution.wrapperExitCode `
        -SafeError $resolution.safeError -Claimed $counters.claimed -Completed $counters.completed -Failed $counters.failed -Retried $counters.retried
    Write-BatchSummary -Outcome $resolution.outcome -SafeError $resolution.safeError -ExitCode $resolution.wrapperExitCode -Slot $slotClaim.slot
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
    Write-BatchSummary -Outcome $resolution.outcome -SafeError $resolution.safeError -ExitCode $resolution.wrapperExitCode -Slot $(if ($slotClaim) { $slotClaim.slot } else { '' })
    exit $resolution.wrapperExitCode
}
