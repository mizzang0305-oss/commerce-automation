[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$WorktreeRoot,
    [Parameter(Mandatory = $true)][string]$QueueRoot,
    [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9_-]{1,96}$')][string]$Namespace,
    [Parameter(Mandatory = $true)][string]$SourceRoot,
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-f0-9]{40}$')][string]$ExpectedGitHead,
    [Parameter(Mandatory = $true)][string]$EnvFile,
    [Parameter(Mandatory = $true)][string]$CodexRuntimeCapsulePath,
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-f0-9]{64}$')][string]$CodexRuntimeCapsuleManifestSha256,
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-f0-9]{64}$')][string]$CodexRuntimeCapsuleBundleDigest,
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-f0-9]{64}$')][string]$CodexRuntimeBinarySha256
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'principal-identity.ps1')
. (Join-Path $PSScriptRoot 'finalizer-result.ps1')
. (Join-Path $PSScriptRoot 'timing-contract.ps1')
. (Join-Path $PSScriptRoot 'runtime-capsule-task-contract.ps1')
$taskName = 'Minz-Commerce-Daily69-Finalizer-NoUpload-V1'
$result = [ordered]@{
    schemaVersion='daily69-finalizer-result-v1'; resultId=[guid]::NewGuid().ToString('N')
    namespace=$Namespace; operationDate=''; expectedGitHead=$ExpectedGitHead; actualGitHead=''
    taskName=$taskName; processId=$PID; startedAt=[datetimeoffset]::UtcNow.ToString('o'); finishedAt=''
    childExitCode=-1; wrapperExitCode=3; outcome='failed'; safeError='DAILY69_FINALIZER_UNEXPECTED'
    outputSha256=Get-Daily69FinalizerTextHash ''; principalSidSha256=''; taskActionSha256=''
    SAFE_TO_UPLOAD=$false; PLATFORM_UPLOAD=0
}
$queue = $null
$evidenceQueue = $null
try {
    $queue = (Resolve-Path -LiteralPath $QueueRoot).Path
    if ((Split-Path -Leaf $queue) -ne $Namespace) { throw 'FIRST_OPERATION_NAMESPACE_MISMATCH' }
    $manifest = Get-Content -LiteralPath (Join-Path $queue 'operation-manifest.json') -Raw -Encoding utf8 | ConvertFrom-Json
    $result.operationDate = [string]$manifest.operationDate
    if ($manifest.namespace -eq $Namespace -and $result.operationDate -match '^\d{4}-\d{2}-\d{2}$') { $evidenceQueue = $queue }
    if ($manifest.namespace -ne $Namespace -or $manifest.expectedGitHead -ne $ExpectedGitHead) { throw 'FIRST_OPERATION_TASK_BINDING_MISMATCH' }
    $root = (Resolve-Path -LiteralPath $WorktreeRoot).Path
    $actualHead = (& git.exe -C $root rev-parse HEAD 2>$null | Out-String).Trim()
    $result.actualGitHead = $actualHead
    if ($LASTEXITCODE -ne 0 -or $actualHead -ne $ExpectedGitHead) { throw 'RUNTIME_GIT_HEAD_MISMATCH' }
    $dirty = (& git.exe -C $root status --porcelain --untracked-files=all 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $dirty) { throw 'RUNTIME_GIT_WORKTREE_NOT_CLEAN' }
    $null = Assert-Daily69TaskCapsule -WorktreeRoot $root -QueueRoot $queue -Namespace $Namespace `
        -CodexRuntimeCapsulePath $CodexRuntimeCapsulePath -CodexRuntimeCapsuleManifestSha256 $CodexRuntimeCapsuleManifestSha256 `
        -CodexRuntimeCapsuleBundleDigest $CodexRuntimeCapsuleBundleDigest -CodexRuntimeBinarySha256 $CodexRuntimeBinarySha256
    $timing = Get-Daily69Timing -OperationDate $result.operationDate
    $now = [datetimeoffset]::UtcNow
    if ($now -lt $timing.finalizerAt.ToUniversalTime() -or $now -ge $timing.finalizerDeadline.ToUniversalTime()) { throw 'DAILY69_FINALIZER_OUTSIDE_WINDOW' }
    $identity = Get-Daily69FinalizerTaskIdentity -TaskName $taskName
    $result.principalSidSha256 = $identity.principalSidSha256
    $result.taskActionSha256 = $identity.taskActionSha256
    $contract = Get-Content -LiteralPath (Join-Path $queue 'task-definitions\finalizer-task-contract.json') -Raw -Encoding utf8 | ConvertFrom-Json
    if ($contract.schemaVersion -ne 'daily69-finalizer-task-contract-v1' -or $contract.namespace -ne $Namespace -or $contract.operationDate -ne $result.operationDate -or $contract.expectedGitHead -ne $ExpectedGitHead -or $contract.taskName -ne $taskName -or $contract.principalSidSha256 -ne $identity.principalSidSha256 -or $contract.taskActionSha256 -ne $identity.taskActionSha256) { throw 'DAILY69_FINALIZER_TASK_CONTRACT_MISMATCH' }
    foreach ($priorTask in @('Minz-Commerce-VideoBatch-NoUpload-V1','Minz-Commerce-ControlRunner-NoUpload-V1','Minz-Commerce-Daily69-Closeout-NoUpload-V1')) {
        if ([string](Get-ScheduledTask -TaskName $priorTask -ErrorAction Stop).State -eq 'Running') { throw 'DAILY69_FINALIZER_PRIOR_TASK_RUNNING' }
    }
    $source = (Resolve-Path -LiteralPath $SourceRoot).Path
    $envPath = (Resolve-Path -LiteralPath $EnvFile).Path
    . (Join-Path $root 'scripts\queue-control-integration\common-control-no-upload.ps1') -WorktreeRoot $root -QueueRoot $queue -Namespace $Namespace -EnvFile $envPath
    . (Join-Path $root 'scripts\queue-scheduler\common-no-upload.ps1') -WorktreeRoot $root -EnvFile $envPath
    $env:QUEUE_SCHEDULER_ROOT=$queue; $env:QUEUE_CONTROL_NAMESPACE=$Namespace; $env:FIRST_OPERATION_SOURCE_ROOT=$source
    $env:QUEUE_SCHEDULER_EXPECTED_GIT_HEAD=$ExpectedGitHead
    foreach ($name in @('SAFE_TO_UPLOAD','SAFE_TO_PUBLIC_UPLOAD','YOUTUBE_AUTO_UPLOAD','TIKTOK_AUTO_UPLOAD','THREADS_AUTO_POST','COMMENT_AUTOMATION')) { [Environment]::SetEnvironmentVariable($name,'false','Process') }
    $capture = Invoke-Daily69FinalizerChild -WorktreeRoot $root -QueueRoot $queue
    $result.childExitCode = $capture.childExitCode
    $result.outputSha256 = $capture.outputSha256
    if ($capture.safeError) { throw $capture.safeError }
    $outcome = ConvertTo-Daily69FinalizerOutcome -Lines $capture.lines -ChildExitCode $capture.childExitCode
    $result.outcome=$outcome.outcome; $result.safeError=$outcome.safeError; $result.wrapperExitCode=$outcome.wrapperExitCode
} catch {
    $code = [string]$_.Exception.Message
    $result.safeError = if ($code -match '^[A-Z][A-Z0-9_:-]{0,159}$') { $code } else { 'DAILY69_FINALIZER_UNEXPECTED' }
    $result.outcome='failed'; $result.wrapperExitCode=3
} finally {
    $result.finishedAt=[datetimeoffset]::UtcNow.ToString('o')
    try {
        if (-not $evidenceQueue) { throw 'DAILY69_FINALIZER_RESULT_ROOT_UNAVAILABLE' }
        $digest = Write-Daily69FinalizerResult -QueueRoot $evidenceQueue -Result $result
        [ordered]@{event='daily69_natural_closeout_finalizer_wrapper_completed';outcome=$result.outcome;safeError=$result.safeError;exitCode=$result.wrapperExitCode;resultId=$result.resultId;resultSha256=$digest;SAFE_TO_UPLOAD=$false;PLATFORM_UPLOAD=0}|ConvertTo-Json -Compress|Write-Output
    } catch {
        $result.wrapperExitCode=3
        [ordered]@{event='daily69_natural_closeout_finalizer_wrapper_completed';outcome='failed';safeError='DAILY69_FINALIZER_RESULT_WRITE_FAILED';exitCode=3;SAFE_TO_UPLOAD=$false;PLATFORM_UPLOAD=0}|ConvertTo-Json -Compress|Write-Output
    }
}
exit $result.wrapperExitCode
