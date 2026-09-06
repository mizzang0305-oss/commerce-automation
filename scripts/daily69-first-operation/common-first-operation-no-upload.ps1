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
    [string]$CodexRuntimeCapsulePath,
    [string]$CodexRuntimeCapsuleManifestSha256,
    [string]$CodexRuntimeCapsuleBundleDigest,
    [string]$CodexRuntimeBinarySha256,
    [switch]$LibraryOnly
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot 'timing-contract.ps1')
. (Join-Path $PSScriptRoot 'runtime-capsule-task-contract.ps1')

function Read-Daily69QueueItems {
    param([Parameter(Mandatory = $true)][string]$Path)
    $raw = Get-Content -LiteralPath $Path -Raw -Encoding utf8
    if (-not $raw.TrimStart().StartsWith('[')) { throw 'FIRST_OPERATION_QUEUE_INVALID' }
    # Assign before enumerating: Windows PowerShell 5.1 emits JSON arrays as one
    # pipeline object, unlike PowerShell 7. @(... | ConvertFrom-Json) nests it.
    $parsed = $raw | ConvertFrom-Json -ErrorAction Stop
    foreach ($item in $parsed) {
        if ($null -eq $item -or $item -isnot [pscustomobject]) { throw 'FIRST_OPERATION_QUEUE_INVALID' }
        Write-Output $item
    }
}

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

function Invoke-Daily69Utf8Process {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [AllowEmptyString()][string]$Arguments,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory
    )
    $resolvedWorkingDirectory = (Resolve-Path -LiteralPath $WorkingDirectory).Path
    $startInfo = New-Object Diagnostics.ProcessStartInfo
    $startInfo.FileName = $FilePath
    $startInfo.Arguments = $Arguments
    $startInfo.WorkingDirectory = $resolvedWorkingDirectory
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $utf8 = New-Object Text.UTF8Encoding($false)
    $startInfo.StandardOutputEncoding = $utf8
    $startInfo.StandardErrorEncoding = $utf8
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $startInfo
    try {
        if (-not $process.Start()) { throw 'DAILY69_UTF8_CHILD_START_FAILED' }
        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        $process.WaitForExit()
        $stdout = $stdoutTask.Result
        $stderr = $stderrTask.Result
        $captureLimit = 1MB
        if ($stdout.Length -gt $captureLimit -or $stderr.Length -gt $captureLimit) {
            $stdout = 'DAILY69_UTF8_CAPTURE_LIMIT_EXCEEDED'
            $stderr = ''
        }
        $split = {
            param([AllowEmptyString()][string]$Text)
            if ([string]::IsNullOrWhiteSpace($Text)) { return @() }
            return @($Text -split '\r?\n' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
        }
        $stdoutLines = @(& $split $stdout)
        $stderrLines = @(& $split $stderr)
        return [pscustomobject]@{
            exitCode = [int]$process.ExitCode
            stdoutLines = $stdoutLines
            stderrLines = $stderrLines
            combinedLines = @($stdoutLines) + @($stderrLines)
            stdoutEncoding = 'utf-8'
            stderrEncoding = 'utf-8'
        }
    } finally { $process.Dispose() }
}

function Invoke-Daily69Utf8NpmScript {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('queue-video:run-next')][string]$ScriptName,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory
    )
    $npmPath = (Get-Command npm.cmd -ErrorAction Stop).Source
    $commandPath = if ($env:ComSpec) { $env:ComSpec } else { Join-Path $env:SystemRoot 'System32\cmd.exe' }
    $arguments = '/d /s /c ""{0}" run {1} --silent"' -f $npmPath, $ScriptName
    return Invoke-Daily69Utf8Process -FilePath $commandPath -Arguments $arguments -WorkingDirectory $WorkingDirectory
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
                $candidate = if ($null -ne $value.$name) { $value.$name } else { $value.run.$name }
                $parsed = 0
                if ($null -ne $candidate -and [int]::TryParse([string]$candidate, [ref]$parsed) -and $parsed -ge 0) {
                    $counters[$name] = $parsed
                }
            }
        } catch { }
    }
    return [pscustomobject]$counters
}

function ConvertTo-Daily69SanitizedBatchRecord {
    param([AllowNull()][object]$Line)
    $record = [ordered]@{
        schemaVersion = 'daily69-retained-batch-result-v1'
        event = 'evidence_capture_error'
        status = ''
        safeError = 'RAW_BATCH_RESULT_UNPARSEABLE'
        claimed = 0
        completed = 0
        blocked = 0
        failed = 0
        retried = 0
        run = [ordered]@{ runId = ''; status = ''; claimed = 0; completed = 0; blocked = 0; failed = 0; retried = 0 }
        results = @()
        SAFE_TO_UPLOAD = $false
        SAFE_TO_PUBLIC_UPLOAD = $false
        PLATFORM_UPLOAD = 0
        PRODUCTION_DB_WRITE = 0
        R2_WRITE = 0
    }
    try {
        $text = ([string]$Line).TrimStart([char]0xFEFF)
        $value = $text | ConvertFrom-Json -ErrorAction Stop
        if ([string]$value.schemaVersion -ne 'daily69-retained-batch-result-v1') {
            $record.safeError = 'RAW_BATCH_RESULT_CONTRACT_INVALID'
            return [pscustomobject]$record
        }
        $event = [string]$value.event
        if ($event -notin @('queue_batch_complete', 'queue_batch_failed')) {
            $record.safeError = 'RAW_BATCH_RESULT_CONTRACT_INVALID'
            return [pscustomobject]$record
        }
        if ($event -eq 'queue_batch_failed') {
            $record.event = $event
            $record.status = 'failed'
            $record.run.status = 'failed'
            foreach ($property in @('safeError', 'safeMessage')) {
                if ($value.$property) { $record.safeError = ConvertTo-Daily69SafeCode -Value $value.$property -Fallback 'REDACTED_CHILD_ERROR'; break }
            }
            return [pscustomobject]$record
        }
        $candidateStatus = if ($value.status) { [string]$value.status } elseif ($value.run.status) { [string]$value.run.status } else { '' }
        if ($candidateStatus -notin @('success', 'partial', 'failed', 'blocked_preflight', 'noop')) {
            $record.safeError = 'RAW_BATCH_RESULT_CONTRACT_INVALID'
            return [pscustomobject]$record
        }
        $record.status = $candidateStatus
        foreach ($name in @('claimed', 'completed', 'blocked', 'failed', 'retried')) {
            $candidate = if ($null -ne $value.$name) { $value.$name } else { $value.run.$name }
            $parsed = 0
            if ($null -eq $candidate -or -not [int]::TryParse([string]$candidate, [ref]$parsed) -or $parsed -lt 0) {
                $record.safeError = 'RAW_BATCH_RESULT_CONTRACT_INVALID'
                return [pscustomobject]$record
            }
            $record[$name] = $parsed
        }
        $runId = [string]$value.run.runId
        if ($runId -notmatch '^batch-[0-9]{14}$') {
            $record.safeError = 'RAW_BATCH_RESULT_CONTRACT_INVALID'
            return [pscustomobject]$record
        }
        $record.run.runId = $runId
        foreach ($name in @('status', 'claimed', 'completed', 'blocked', 'failed', 'retried')) { $record.run[$name] = $record[$name] }
        $safeResults = @()
        foreach ($result in @($value.results)) {
            $queueId = [string]$result.queueId
            if ($queueId -match '^[A-Za-z0-9:_-]{1,160}$') { $safeResults += [ordered]@{ queueId = $queueId } }
        }
        $record.results = @($safeResults)
        $record.event = $event
        $record.safeError = ''
    } catch { }
    return [pscustomobject]$record
}

function Select-Daily69SanitizedBatchRecord {
    param([object[]]$Lines)
    $records = @()
    $contractRejected = 0
    foreach ($line in @($Lines)) {
        $candidate = ConvertTo-Daily69SanitizedBatchRecord -Line $line
        if ($candidate.event -eq 'queue_batch_complete') {
            $ids = @($candidate.results | ForEach-Object { [string]$_.queueId })
            $valid = [string]$candidate.run.runId -match '^batch-[0-9]{14}$' `
                -and [int]$candidate.claimed -eq $ids.Count `
                -and ([int]$candidate.completed + [int]$candidate.blocked + [int]$candidate.failed + [int]$candidate.retried) -eq [int]$candidate.claimed `
                -and @($ids | Select-Object -Unique).Count -eq $ids.Count
            if ($valid) { $records += $candidate } else { $contractRejected += 1 }
        } elseif ($candidate.event -eq 'queue_batch_failed') { $records += $candidate }
        elseif ($candidate.safeError -eq 'RAW_BATCH_RESULT_CONTRACT_INVALID') { $contractRejected += 1 }
    }
    if ($records.Count -eq 1) { return $records[0] }
    $reason = if ($records.Count -gt 1) { 'RAW_BATCH_RESULT_AMBIGUOUS' } elseif ($contractRejected -gt 0) { 'RAW_BATCH_RESULT_CONTRACT_INVALID' } else { 'RAW_BATCH_RESULT_UNPARSEABLE' }
    return [pscustomobject][ordered]@{
        schemaVersion = 'daily69-retained-batch-result-v1'
        event = 'evidence_capture_error'
        status = 'failed'
        safeError = $reason
        claimed = 0
        completed = 0
        blocked = 0
        failed = 0
        retried = 0
        run = [ordered]@{ runId = ''; status = 'failed'; claimed = 0; completed = 0; blocked = 0; failed = 0; retried = 0 }
        results = @()
        capturedLineCount = @($Lines).Count
        SAFE_TO_UPLOAD = $false
        SAFE_TO_PUBLIC_UPLOAD = $false
        PLATFORM_UPLOAD = 0
        PRODUCTION_DB_WRITE = 0
        R2_WRITE = 0
    }
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
    if ($guardCodes -contains $code -or $code -match '(?:^|_)REVISION_MISMATCH$' -or $code -cmatch '^CODEX_CAPSULE_') {
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
        'closeout' { if ($operationDate) { (Get-Daily69Timing -OperationDate $operationDate).closeoutAt.ToString('yyyy-MM-ddTHH:mm:ss') + '+09:00' } else { '' } }
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
        $items = @(Read-Daily69QueueItems -Path (Join-Path $script:Daily69InvocationQueueRoot 'queue.json'))
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
    $locks = @('runner.lock', 'command-runner.lock', 'queue.mutation.lock', 'runs.mutation.lock')
    $present = @($locks | Where-Object { Test-Path -LiteralPath (Join-Path $ResolvedQueue $_) -PathType Leaf })
    $unresolvedLeases = 0
    $queuePath = Join-Path $ResolvedQueue 'queue.json'
    try { $items = @(Read-Daily69QueueItems -Path $queuePath) }
    catch { return [pscustomobject]@{ idle = $false; safeCode = 'FIRST_OPERATION_QUEUE_INVALID'; presentLocks = $present; unresolvedLeases = 0; processingCount = 0; claimedCount = 0 } }
    $unresolvedLeases = @($items | Where-Object { $_.leaseOwner -or $_.leaseExpiresAt }).Count
    $processingCount = @($items | Where-Object { $_.status -eq 'processing' }).Count
    $claimedCount = @($items | Where-Object { $_.status -eq 'claimed' }).Count
    return [pscustomobject]@{
        idle = ($present.Count -eq 0 -and $unresolvedLeases -eq 0 -and $processingCount -eq 0 -and $claimedCount -eq 0)
        safeCode = if ($present.Count -gt 0 -or $unresolvedLeases -gt 0 -or $processingCount -gt 0 -or $claimedCount -gt 0) { 'FIRST_OPERATION_CLOSEOUT_PENDING_ACTIVE_WORK' } else { '' }
        presentLocks = $present
        unresolvedLeases = $unresolvedLeases
        processingCount = $processingCount
        claimedCount = $claimedCount
    }
}

function Wait-Daily69CloseoutIdle {
    param(
        [Parameter(Mandatory = $true)][string]$ResolvedQueue,
        [ValidateRange(1, 900)][int]$MaximumWaitSeconds = 600,
        [ValidateRange(1, 30)][int]$PollIntervalSeconds = 5,
        [scriptblock]$IdleProbe = { param($queue) Test-Daily69CloseoutIdle -ResolvedQueue $queue },
        [scriptblock]$Sleep = { param($seconds) Start-Sleep -Seconds $seconds }
    )
    if ($PollIntervalSeconds -gt $MaximumWaitSeconds) { throw 'FIRST_OPERATION_IDLE_WAIT_CONTRACT_INVALID' }
    $clock = [Diagnostics.Stopwatch]::StartNew()
    $scheduledWait = 0
    $checks = 0
    while ($true) {
        $idle = & $IdleProbe $ResolvedQueue
        $checks += 1
        $elapsed = [Math]::Max($clock.Elapsed.TotalSeconds, $scheduledWait)
        $valid = $null -ne $idle -and $idle.idle -is [bool] -and $null -ne $idle.unresolvedLeases
        if (-not $valid) { throw 'FIRST_OPERATION_IDLE_PROBE_INVALID' }
        Write-Daily69EvidenceLine -Data ([ordered]@{ schemaVersion = 'daily69-closeout-idle-wait-v1'; event = 'closeout_idle_checked'; check = $checks; elapsedSeconds = [Math]::Round($elapsed, 3); maximumWaitSeconds = $MaximumWaitSeconds; idle = $idle.idle; presentLockCount = @($idle.presentLocks).Count; unresolvedLeases = $idle.unresolvedLeases; processingCount = $idle.processingCount; claimedCount = $idle.claimedCount; safeError = $idle.safeCode; SAFE_TO_UPLOAD = $false; PLATFORM_UPLOAD = 0 })
        if ($idle.idle -or $idle.safeCode -ne 'FIRST_OPERATION_CLOSEOUT_PENDING_ACTIVE_WORK' -or $elapsed -ge $MaximumWaitSeconds) {
            return [pscustomobject]@{ idle = $idle.idle; safeCode = $idle.safeCode; checks = $checks; elapsedSeconds = $elapsed; timedOut = (-not $idle.idle -and $elapsed -ge $MaximumWaitSeconds) }
        }
        $delay = [Math]::Min($PollIntervalSeconds, $MaximumWaitSeconds - $elapsed)
        & $Sleep $delay
        # Also cap iterations when a test clock/sleeper does not advance.
        $scheduledWait += $delay
    }
}

function Stop-FirstOperationFailClosed {
    param([string]$Reason)
    $safeReason = ConvertTo-Daily69SafeCode -Value $Reason -Fallback 'FIRST_OPERATION_FAILED'
    # Capsule rejection occurs before credential-environment import. Never let
    # the existing pause command consume an ambient queue root or working dir.
    if ($script:Daily69FailClosedQueueRoot -and $script:Daily69FailClosedWorktreeRoot) {
        $savedQueueRoot = $env:QUEUE_SCHEDULER_ROOT
        Push-Location $script:Daily69FailClosedWorktreeRoot
        try {
            $env:QUEUE_SCHEDULER_ROOT = $script:Daily69FailClosedQueueRoot
            & npm.cmd run daily69:first-day:emergency-pause --silent | Out-Null
        } catch { }
        finally { $env:QUEUE_SCHEDULER_ROOT = $savedQueueRoot; Pop-Location }
    }
    foreach ($name in @("Minz-Commerce-VideoBatch-NoUpload-V1", "Minz-Commerce-ControlRunner-NoUpload-V1")) {
        try { Disable-ScheduledTask -TaskName $name -ErrorAction Stop | Out-Null } catch { }
    }
    return [pscustomobject]@{ event = "daily69_first_operation_kill_switch"; safeError = $safeReason; claim = 0; enabled = $false; isPaused = $true; SAFE_TO_UPLOAD = $false; PLATFORM_UPLOAD = 0 }
}

if ($LibraryOnly) { return }

$script:Daily69FailClosedQueueRoot = $null
$script:Daily69FailClosedWorktreeRoot = $null
$resolvedWorktree = (Resolve-Path -LiteralPath $WorktreeRoot).Path
$resolvedQueue = (Resolve-Path -LiteralPath $QueueRoot).Path
$actualHead = (& git.exe -C $resolvedWorktree rev-parse HEAD 2>$null | Out-String).Trim()
$gitExitCode = $LASTEXITCODE
Initialize-Daily69InvocationEvidence -ResolvedQueue $resolvedQueue -Role $InvocationRole -Name $TaskName -BoundNamespace $Namespace -ExpectedHead $ExpectedGitHead -ActualHead $actualHead -BoundWrapper $WrapperPath
if ($Namespace -notmatch '^[A-Za-z0-9_-]{1,96}$' -or (Split-Path -Leaf $resolvedQueue) -ne $Namespace) { throw "FIRST_OPERATION_NAMESPACE_MISMATCH" }
if ($gitExitCode -ne 0 -or $actualHead -ne $ExpectedGitHead) { throw "RUNTIME_GIT_HEAD_MISMATCH" }
$dirty = (& git.exe -C $resolvedWorktree status --porcelain --untracked-files=all 2>$null | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $dirty) { throw 'RUNTIME_GIT_WORKTREE_NOT_CLEAN' }
$script:Daily69FailClosedQueueRoot = $resolvedQueue
$script:Daily69FailClosedWorktreeRoot = $resolvedWorktree
# Verify Task arguments and all capsule bytes before environment/auth loading,
# hourly slot claims, control commands, or closeout projection side effects.
$null = Assert-Daily69TaskCapsule -WorktreeRoot $resolvedWorktree -QueueRoot $resolvedQueue -Namespace $Namespace `
    -CodexRuntimeCapsulePath $CodexRuntimeCapsulePath -CodexRuntimeCapsuleManifestSha256 $CodexRuntimeCapsuleManifestSha256 `
    -CodexRuntimeCapsuleBundleDigest $CodexRuntimeCapsuleBundleDigest -CodexRuntimeBinarySha256 $CodexRuntimeBinarySha256
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
