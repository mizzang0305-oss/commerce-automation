param(
    [Parameter(Mandatory = $true)][string]$WorktreeRoot,
    [Parameter(Mandatory = $true)][string]$QueueRoot,
    [Parameter(Mandatory = $true)][string]$Namespace,
    [Parameter(Mandatory = $true)][string]$SourceRoot,
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-f0-9]{40}$')][string]$ExpectedGitHead,
    [Parameter(Mandatory = $true)][string]$EnvFile,
    [Parameter(Mandatory = $true)][ValidateSet('control', 'batch', 'closeout')][string]$InvocationRole,
    [Parameter(Mandatory = $true)][string]$TaskName,
    [Parameter(Mandatory = $true)][string]$WrapperPath,
    [switch]$LibraryOnly
)
$ErrorActionPreference = "Stop"

function ConvertTo-Daily69SafeCode {
    param([AllowNull()][object]$Value, [string]$Fallback = "UNEXPECTED_EXCEPTION")
    $candidate = if ($null -eq $Value) { "" } else { [string]$Value }
    if ($candidate -match '^[A-Z0-9_:-]{1,160}$') { return $candidate }
    return $Fallback
}

function Protect-Daily69Text {
    param([AllowEmptyString()][string]$Value)
    $safe = $Value
    # Child output can itself contain JSON-escaped JSON. Redact those values
    # before the ordinary quoted/unquoted patterns below.
    $safe = [regex]::Replace($safe, '(?i)((?:\\?["'']?)authorization(?:\\?["'']?)\s*[:=]\s*(?:\\?["'']?)(?:bearer\s+)?)([^\\"'',;\s}\]]+)', '$1[REDACTED]')
    $safe = [regex]::Replace($safe, '(?i)((?:\\?["'']?)(?:api[_-]?key|token|access[_-]?token|refresh[_-]?token|secret|client[_-]?secret|password|cookie|private[_-]?key)(?:\\?["'']?)\s*[:=]\s*(?:\\?["'']?))([^\\"'',;\s}\]]+)', '$1[REDACTED]')
    $safe = [regex]::Replace($safe, '(?i)(["'']?authorization["'']?\s*[:=]\s*["'']?)(?:bearer\s+)?([^"'',;\s]+)', '$1[REDACTED]')
    $safe = [regex]::Replace($safe, '(?i)(["'']?(?:api[_-]?key|token|access[_-]?token|refresh[_-]?token|secret|client[_-]?secret|password|cookie|private[_-]?key)["'']?\s*[:=]\s*["'']?)([^"'',;\s]+)', '$1[REDACTED]')
    $safe = [regex]::Replace($safe, '(?i)(bearer\s+)[A-Za-z0-9._~+\/-]+', '$1[REDACTED]')
    return $safe
}

function Get-Daily69SafeCodeFromOutput {
    param([object[]]$Lines, [string]$Fallback)
    foreach ($line in @($Lines)) {
        try {
            $value = ([string]$line) | ConvertFrom-Json -ErrorAction Stop
            foreach ($property in @('safeError', 'safeMessage')) {
                if ($null -ne $value.$property) {
                    $candidate = ConvertTo-Daily69SafeCode -Value $value.$property -Fallback ""
                    if ($candidate) { return $candidate }
                }
            }
        } catch { }
    }
    return ConvertTo-Daily69SafeCode -Value $Fallback
}

function Get-Daily69CountersFromOutput {
    param([object[]]$Lines)
    $counters = [ordered]@{ claimed = 0; completed = 0; failed = 0; retried = 0 }
    foreach ($line in @($Lines)) {
        try {
            $value = ([string]$line) | ConvertFrom-Json -ErrorAction Stop
            foreach ($name in @('claimed', 'completed', 'failed', 'retried')) {
                $candidate = $value.$name
                $parsed = 0
                if ($null -ne $candidate -and [int]::TryParse([string]$candidate, [ref]$parsed) -and $parsed -ge 0) {
                    $counters[$name] = $parsed
                }
            }
        } catch { }
    }
    return [pscustomobject]$counters
}

function Get-Daily69CompletionFromOutput {
    param([object[]]$Lines)
    foreach ($line in @($Lines)) {
        try {
            $value = ([string]$line) | ConvertFrom-Json -ErrorAction Stop
            if ([string]$value.completion -in @('PASS', 'PENDING', 'FAILED')) { return [string]$value.completion }
        } catch { }
    }
    return 'UNKNOWN'
}

function Resolve-Daily69FailureOutcome {
    param([AllowNull()][object]$SafeCode)
    $code = ConvertTo-Daily69SafeCode -Value $SafeCode
    $guardCodes = @(
        'RUNTIME_GIT_HEAD_MISMATCH',
        'FIRST_OPERATION_NAMESPACE_MISMATCH',
        'LOCAL_REVISION_MISMATCH',
        'EXPECTED_REVISION_MISMATCH',
        'STALE_CONTROL_COMMAND',
        'COMMAND_NAMESPACE_MISMATCH',
        'FIRST_OPERATION_PREFLIGHT_FAILED',
        'QUEUE_BATCH_BLOCKED_PREFLIGHT'
    )
    if ($guardCodes -contains $code -or $code -match '(?:^|_)REVISION_MISMATCH$') {
        return [pscustomobject]@{ outcome = 'guard_blocked'; safeError = $code; wrapperExitCode = 3 }
    }
    if ($code -eq 'UNEXPECTED_EXCEPTION') {
        return [pscustomobject]@{ outcome = 'unexpected_exception'; safeError = $code; wrapperExitCode = 5 }
    }
    return [pscustomobject]@{ outcome = 'failed'; safeError = $code; wrapperExitCode = 4 }
}

function Resolve-Daily69ControlOutcome {
    param([int]$ChildExitCode, [object[]]$Lines)
    $eventName = ""
    $status = ""
    $safeCode = ""
    foreach ($line in @($Lines)) {
        try {
            $value = ([string]$line) | ConvertFrom-Json -ErrorAction Stop
            if ($value.event -in @('no_pending_control_command', 'control_command_processed', 'control_runner_failed')) {
                $eventName = [string]$value.event
                $status = [string]$value.status
                if ($null -ne $value.safeError) { $safeCode = ConvertTo-Daily69SafeCode -Value $value.safeError -Fallback "" }
                if (-not $safeCode -and $null -ne $value.safeMessage) { $safeCode = ConvertTo-Daily69SafeCode -Value $value.safeMessage -Fallback "" }
            }
        } catch { }
    }
    if ($eventName -eq 'no_pending_control_command' -and $ChildExitCode -eq 0) {
        return [pscustomobject]@{ outcome = 'noop'; safeError = 'NO_PENDING_CONTROL_COMMAND'; wrapperExitCode = 0 }
    }
    if ($eventName -eq 'control_command_processed' -and $ChildExitCode -eq 0 -and $status -notin @('failed', 'stale_rejected')) {
        return [pscustomobject]@{ outcome = 'success'; safeError = ''; wrapperExitCode = 0 }
    }
    if ($eventName -eq 'control_command_processed' -and $status -in @('failed', 'stale_rejected')) {
        return Resolve-Daily69FailureOutcome -SafeCode $(if ($safeCode) { $safeCode } else { 'CONTROL_COMMAND_FAILED' })
    }
    if ($ChildExitCode -ne 0 -or $eventName -eq 'control_runner_failed') {
        return Resolve-Daily69FailureOutcome -SafeCode $(if ($safeCode) { $safeCode } else { 'CONTROL_RUNNER_FAILED' })
    }
    return [pscustomobject]@{ outcome = 'unexpected_exception'; safeError = 'UNEXPECTED_EXCEPTION'; wrapperExitCode = 5 }
}

function Get-Daily69Sha256 {
    param([string]$Path)
    if (-not $Path -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) { return "" }
    $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    $hash = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($hash.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $hash.Dispose(); $stream.Dispose() }
}

function Get-Daily69StringSha256 {
    param([string]$Value)
    $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
    $hash = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($hash.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant() }
    finally { $hash.Dispose() }
}

function Write-Daily69EvidenceLine {
    param([System.Collections.IDictionary]$Data, [switch]$Create)
    if (-not $script:Daily69InvocationEvidencePath) { return }
    $json = Protect-Daily69Text -Value ($Data | ConvertTo-Json -Depth 6 -Compress)
    $encoding = New-Object Text.UTF8Encoding($false)
    if ($Create) {
        $stream = [IO.File]::Open($script:Daily69InvocationEvidencePath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
    } else {
        $stream = [IO.File]::Open($script:Daily69InvocationEvidencePath, [IO.FileMode]::Append, [IO.FileAccess]::Write, [IO.FileShare]::Read)
    }
    try {
        $writer = New-Object IO.StreamWriter($stream, $encoding)
        try { $writer.WriteLine($json); $writer.Flush(); $stream.Flush($true) }
        finally { $writer.Dispose() }
    } finally { $stream.Dispose() }
}

function Write-Daily69FinalReceipt {
    param([System.Collections.IDictionary]$Data)
    if (-not $script:Daily69InvocationReceiptPath) { return }
    $json = Protect-Daily69Text -Value ($Data | ConvertTo-Json -Depth 8)
    $encoding = New-Object Text.UTF8Encoding($false)
    $stream = [IO.File]::Open($script:Daily69InvocationReceiptPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
    try {
        $writer = New-Object IO.StreamWriter($stream, $encoding)
        try { $writer.WriteLine($json); $writer.Flush(); $stream.Flush($true) }
        finally { $writer.Dispose() }
    } finally { $stream.Dispose() }
}

function Initialize-Daily69InvocationEvidence {
    param(
        [string]$ResolvedQueue,
        [string]$Role,
        [string]$Name,
        [string]$BoundNamespace,
        [string]$ExpectedHead,
        [string]$ActualHead,
        [string]$BoundWrapper
    )
    $now = Get-Daily69KstNow
    $safeNamespace = if ($BoundNamespace -match '^[A-Za-z0-9_-]{1,96}$') { $BoundNamespace } else { 'INVALID_NAMESPACE' }
    $operationDate = if ($safeNamespace -match '^operation-(\d{4}-\d{2}-\d{2})') { $Matches[1] } else { "" }
    $invocationId = '{0}-{1}-p{2}-{3}' -f $now.ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ'), $Role, $PID, ([Guid]::NewGuid().ToString('N').Substring(0, 12))
    $directory = Join-Path (Join-Path $ResolvedQueue 'retained-execution') $Role
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    # The trace is append-only but intentionally not named .json/.jsonl so the
    # post-closeout receipt scanner only sees complete invocation receipts.
    $script:Daily69InvocationEvidencePath = Join-Path $directory "$invocationId.trace"
    $script:Daily69InvocationReceiptPath = Join-Path $directory "$invocationId.json"
    $script:Daily69InvocationQueueRoot = $ResolvedQueue
    $script:Daily69InvocationCompleted = $false
    $script:Daily69InvocationId = $invocationId
    $script:Daily69InvocationStartedAtUtc = $now.ToUniversalTime().ToString('o')
    $script:Daily69InvocationRole = $Role
    $script:Daily69InvocationTaskName = $Name
    $script:Daily69InvocationNamespace = $safeNamespace
    $script:Daily69InvocationOperationDate = $operationDate
    $script:Daily69InvocationExpectedHead = $ExpectedHead
    $script:Daily69InvocationActualHead = $ActualHead
    $parentPid = 0
    try { $parentPid = [int](Get-CimInstance Win32_Process -Filter "ProcessId = $PID" -ErrorAction Stop).ParentProcessId } catch { }
    $taskXmlHash = ""
    try { $taskXmlHash = Get-Daily69StringSha256 -Value (Export-ScheduledTask -TaskName $Name -ErrorAction Stop) } catch { }
    $scheduledBoundary = switch ($Role) {
        'control' { $now.ToString('yyyy-MM-ddTHH:mm:00zzz') }
        'batch' { $now.ToString('yyyy-MM-ddTHH:00:00zzz') }
        'closeout' { "$($now.ToString('yyyy-MM-dd'))T23:55:00$($now.ToString('zzz'))" }
    }
    Write-Daily69EvidenceLine -Create -Data ([ordered]@{
        schemaVersion = 'daily69-retained-invocation-v1'
        event = 'invocation_started'
        invocationId = $invocationId
        taskName = $Name
        role = $Role
        namespace = $safeNamespace
        operationDate = $operationDate
        scheduledBoundaryKstCandidate = $scheduledBoundary
        startedAtUtc = $script:Daily69InvocationStartedAtUtc
        startedAtKst = $now.ToString('o')
        pid = $PID
        parentPid = $parentPid
        expectedGitHead = $ExpectedHead
        actualGitHead = $ActualHead
        taskXmlSha256 = $taskXmlHash
        wrapperSha256 = Get-Daily69Sha256 -Path $BoundWrapper
        queueSnapshotHashBefore = Get-Daily69Sha256 -Path (Join-Path $ResolvedQueue 'queue.json')
        origin = 'UNKNOWN'
        SAFE_TO_UPLOAD = $false
        PLATFORM_UPLOAD = 0
        secretRedacted = $true
    })
}

function Complete-Daily69InvocationEvidence {
    param(
        [ValidateSet('success', 'noop', 'partial', 'pending', 'failed', 'guard_blocked', 'unexpected_exception')][string]$Outcome,
        [int]$ChildExitCode,
        [int]$WrapperExitCode,
        [AllowEmptyString()][string]$SafeError,
        [int]$Claimed = 0,
        [int]$Completed = 0,
        [int]$Failed = 0,
        [int]$Retried = 0
    )
    if (-not $script:Daily69InvocationEvidencePath -or $script:Daily69InvocationCompleted) { return }
    $now = Get-Daily69KstNow
    $safeCode = if ($SafeError) { ConvertTo-Daily69SafeCode -Value $SafeError } else { "" }
    $completedAt = $now.ToUniversalTime().ToString('o')
    $queueCounts = [ordered]@{ readyCount = 0; blockedCount = 0; failedCount = 0; retryCount = 0 }
    $revisions = [ordered]@{ queueRevision = 0; projectionRevision = 0 }
    try {
        $items = @(Get-Content -LiteralPath (Join-Path $script:Daily69InvocationQueueRoot 'queue.json') -Raw -Encoding utf8 | ConvertFrom-Json)
        $queueCounts.readyCount = @($items | Where-Object { $_.status -eq 'video_ready_autoqa' }).Count
        $queueCounts.blockedCount = @($items | Where-Object { $_.status -eq 'blocked' }).Count
        $queueCounts.failedCount = @($items | Where-Object { $_.status -eq 'failed' }).Count
        $queueCounts.retryCount = @($items | Where-Object { $_.status -eq 'retry_wait' }).Count
        $controlState = Get-Content -LiteralPath (Join-Path $script:Daily69InvocationQueueRoot 'control-state.json') -Raw -Encoding utf8 | ConvertFrom-Json
        $revisions.queueRevision = [int]$controlState.localRevision
        $revisions.projectionRevision = [int]$controlState.projectionRevision
    } catch { }
    $receipt = [ordered]@{
        schemaVersion = 'daily69-retained-execution-v1'
        role = $script:Daily69InvocationRole
        invocationId = $script:Daily69InvocationId
        runId = $script:Daily69InvocationId
        namespace = $script:Daily69InvocationNamespace
        operationNamespace = $script:Daily69InvocationNamespace
        operationDate = $script:Daily69InvocationOperationDate
        expectedGitHead = $script:Daily69InvocationExpectedHead
        taskName = $script:Daily69InvocationTaskName
        processId = $PID
        startedAt = $script:Daily69InvocationStartedAtUtc
        startedAtKst = ([TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTimeOffset]::Parse($script:Daily69InvocationStartedAtUtc), 'Korea Standard Time')).ToString('o')
        completedAt = $completedAt
        finishedAtKst = $now.ToString('o')
        exitCode = $WrapperExitCode
        taskEvent = [ordered]@{
            correlated = $false
            startedEventId = 0
            completedEventId = 0
        }
        origin = 'UNKNOWN'
        outcome = $Outcome
        logicalResult = $Outcome
        safeError = $safeCode
        safeErrorCode = $safeCode
        safeMessage = $safeCode
        childExitCode = $ChildExitCode
        actualGitHead = $script:Daily69InvocationActualHead
        claimed = $Claimed
        completed = $Completed
        failed = $Failed
        retried = $Retried
        claimedCount = $Claimed
        processedCount = $Completed + $Failed
        readyCount = $queueCounts.readyCount
        blockedCount = $queueCounts.blockedCount
        failedCount = $queueCounts.failedCount
        retryCount = $queueCounts.retryCount
        queueRevision = $revisions.queueRevision
        projectionRevision = $revisions.projectionRevision
        SAFE_TO_UPLOAD = $false
        PLATFORM_UPLOAD = 0
        GOOGLE_DRIVE_WRITE = 0
        PRODUCTION_DB_WRITE = 0
        R2_WRITE = 0
        secretRedacted = $true
    }
    Write-Daily69FinalReceipt -Data $receipt
    Write-Daily69EvidenceLine -Data ([ordered]@{
        schemaVersion = 'daily69-retained-invocation-v1'
        event = 'invocation_finished'
        invocationId = $script:Daily69InvocationId
        outcome = $Outcome
        safeError = $safeCode
        childExitCode = $ChildExitCode
        wrapperExitCode = $WrapperExitCode
        startedAtUtc = $script:Daily69InvocationStartedAtUtc
        finishedAtUtc = $completedAt
        finishedAtKst = $now.ToString('o')
        queueSnapshotHashAfter = Get-Daily69Sha256 -Path (Join-Path $script:Daily69InvocationQueueRoot 'queue.json')
        claimed = $Claimed
        completed = $Completed
        failed = $Failed
        retried = $Retried
        claimedCount = $Claimed
        processedCount = $Completed + $Failed
        readyCount = $queueCounts.readyCount
        blockedCount = $queueCounts.blockedCount
        failedCount = $queueCounts.failedCount
        retryCount = $queueCounts.retryCount
        queueRevision = $revisions.queueRevision
        projectionRevision = $revisions.projectionRevision
        SAFE_TO_UPLOAD = $false
        PLATFORM_UPLOAD = 0
        GOOGLE_DRIVE_WRITE = 0
        PRODUCTION_DB_WRITE = 0
        R2_WRITE = 0
        secretRedacted = $true
    })
    $script:Daily69InvocationCompleted = $true
}

function Get-Daily69KstNow {
    return [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTimeOffset]::UtcNow, 'Korea Standard Time')
}

function Get-Daily69OperationBinding {
    param([string]$ResolvedQueue, [string]$BoundNamespace)
    $manifestPath = Join-Path $ResolvedQueue 'operation-manifest.json'
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'FIRST_OPERATION_MANIFEST_NOT_FOUND' }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding utf8 | ConvertFrom-Json
    if ([string]$manifest.namespace -ne $BoundNamespace -or [string]$manifest.operationDate -notmatch '^\d{4}-\d{2}-\d{2}$') { throw 'FIRST_OPERATION_NAMESPACE_MISMATCH' }
    return [pscustomobject]@{ namespace = [string]$manifest.namespace; operationDate = [string]$manifest.operationDate }
}

function Test-Daily69NewWorkWindow {
    param(
        [string]$ResolvedQueue,
        [string]$BoundNamespace,
        [ValidateSet('control', 'batch')][string]$Role,
        [DateTimeOffset]$NowKst = [DateTimeOffset]::MinValue
    )
    $binding = Get-Daily69OperationBinding -ResolvedQueue $ResolvedQueue -BoundNamespace $BoundNamespace
    $now = if ($NowKst -eq [DateTimeOffset]::MinValue) { Get-Daily69KstNow } else { $NowKst }
    if ($now.ToString('yyyy-MM-dd') -ne $binding.operationDate) {
        return [pscustomobject]@{ allowed = $false; safeCode = 'FIRST_OPERATION_DATE_NOT_ACTIVE'; dateKst = $now.ToString('yyyy-MM-dd'); hourKst = $now.Hour }
    }
    if ($Role -eq 'control' -and $now.Hour -eq 0 -and $now.Minute -lt 1) {
        return [pscustomobject]@{ allowed = $false; safeCode = 'CONTROL_OPERATION_WINDOW_CLOSED'; dateKst = $now.ToString('yyyy-MM-dd'); hourKst = $now.Hour }
    }
    if ($Role -eq 'batch' -and ($now.Hour -lt 4 -or $now.Hour -gt 23)) {
        return [pscustomobject]@{ allowed = $false; safeCode = 'BATCH_OPERATION_WINDOW_CLOSED'; dateKst = $now.ToString('yyyy-MM-dd'); hourKst = $now.Hour }
    }
    if (($now.Hour -eq 23 -and $now.Minute -ge 50) -or $now.Hour -gt 23) {
        return [pscustomobject]@{ allowed = $false; safeCode = 'OPERATION_DRAIN_WINDOW_NOOP'; dateKst = $now.ToString('yyyy-MM-dd'); hourKst = $now.Hour }
    }
    return [pscustomobject]@{ allowed = $true; safeCode = ''; dateKst = $now.ToString('yyyy-MM-dd'); hourKst = $now.Hour }
}

function Claim-Daily69BatchSlot {
    param(
        [string]$ResolvedQueue,
        [string]$BoundNamespace,
        [DateTimeOffset]$NowKst = [DateTimeOffset]::MinValue
    )
    $window = Test-Daily69NewWorkWindow -ResolvedQueue $ResolvedQueue -BoundNamespace $BoundNamespace -Role batch -NowKst $NowKst
    if (-not $window.allowed) { return [pscustomobject]@{ claimed = $false; safeCode = $window.safeCode; slot = '' } }
    $slot = '{0}-{1:D2}' -f $window.dateKst, $window.hourKst
    $directory = Join-Path (Join-Path $ResolvedQueue 'retained-execution') 'batch-slots'
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $path = Join-Path $directory "$slot.json"
    $payload = [ordered]@{
        schemaVersion = 'daily69-batch-slot-claim-v1'
        slot = $slot
        namespace = $BoundNamespace
        invocationId = $script:Daily69InvocationId
        claimedAtUtc = if ($NowKst -eq [DateTimeOffset]::MinValue) { [DateTimeOffset]::UtcNow.ToString('o') } else { $NowKst.ToUniversalTime().ToString('o') }
        SAFE_TO_UPLOAD = $false
        PLATFORM_UPLOAD = 0
    } | ConvertTo-Json -Compress
    $encoding = New-Object Text.UTF8Encoding($false)
    try {
        $stream = [IO.File]::Open($path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
        try {
            $writer = New-Object IO.StreamWriter($stream, $encoding)
            try { $writer.WriteLine($payload); $writer.Flush(); $stream.Flush($true) }
            finally { $writer.Dispose() }
        } finally { $stream.Dispose() }
        return [pscustomobject]@{ claimed = $true; safeCode = ''; slot = $slot }
    } catch {
        if ($_.Exception.InnerException -is [IO.IOException] -or $_.Exception -is [IO.IOException]) {
            return [pscustomobject]@{ claimed = $false; safeCode = 'BATCH_SLOT_ALREADY_CLAIMED'; slot = $slot }
        }
        throw
    }
}

function Test-Daily69CloseoutIdle {
    param([string]$ResolvedQueue)
    $locks = @('runner.lock', 'queue.mutation.lock', 'runs.mutation.lock')
    $present = @($locks | Where-Object { Test-Path -LiteralPath (Join-Path $ResolvedQueue $_) -PathType Leaf })
    $unresolvedLeases = 0
    $queuePath = Join-Path $ResolvedQueue 'queue.json'
    if (Test-Path -LiteralPath $queuePath -PathType Leaf) {
        $items = @(Get-Content -LiteralPath $queuePath -Raw -Encoding utf8 | ConvertFrom-Json)
        $unresolvedLeases = @($items | Where-Object { $_.leaseOwner -or $_.leaseExpiresAt }).Count
    }
    return [pscustomobject]@{
        idle = ($present.Count -eq 0 -and $unresolvedLeases -eq 0)
        safeCode = if ($present.Count -gt 0 -or $unresolvedLeases -gt 0) { 'FIRST_OPERATION_CLOSEOUT_PENDING_ACTIVE_WORK' } else { '' }
        presentLocks = $present
        unresolvedLeases = $unresolvedLeases
    }
}

function Stop-FirstOperationFailClosed {
    param([string]$Reason)
    $safeReason = ConvertTo-Daily69SafeCode -Value $Reason -Fallback 'FIRST_OPERATION_FAILED'
    try { & npm.cmd run daily69:first-day:emergency-pause --silent | Out-Null } catch { }
    foreach ($name in @("Minz-Commerce-VideoBatch-NoUpload-V1", "Minz-Commerce-ControlRunner-NoUpload-V1")) {
        try { Disable-ScheduledTask -TaskName $name -ErrorAction Stop | Out-Null } catch { }
    }
    return [pscustomobject]@{ event = "daily69_first_operation_kill_switch"; safeError = $safeReason; claim = 0; enabled = $false; isPaused = $true; SAFE_TO_UPLOAD = $false; PLATFORM_UPLOAD = 0 }
}

if ($LibraryOnly) { return }

$resolvedWorktree = (Resolve-Path -LiteralPath $WorktreeRoot).Path
$resolvedQueue = (Resolve-Path -LiteralPath $QueueRoot).Path
$actualHead = (& git.exe -C $resolvedWorktree rev-parse HEAD 2>$null | Out-String).Trim()
$gitExitCode = $LASTEXITCODE
Initialize-Daily69InvocationEvidence -ResolvedQueue $resolvedQueue -Role $InvocationRole -Name $TaskName -BoundNamespace $Namespace -ExpectedHead $ExpectedGitHead -ActualHead $actualHead -BoundWrapper $WrapperPath
if ($Namespace -notmatch '^[A-Za-z0-9_-]{1,96}$' -or (Split-Path -Leaf $resolvedQueue) -ne $Namespace) { throw "FIRST_OPERATION_NAMESPACE_MISMATCH" }
if ($gitExitCode -ne 0 -or $actualHead -ne $ExpectedGitHead) { throw "RUNTIME_GIT_HEAD_MISMATCH" }
$resolvedSource = (Resolve-Path -LiteralPath $SourceRoot).Path
$resolvedEnv = (Resolve-Path -LiteralPath $EnvFile).Path
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
