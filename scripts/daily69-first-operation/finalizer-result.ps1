# Separate evidence class: never consumed by the pre-finalizer receipt binder.
function Get-Daily69FinalizerTextHash {
    param([AllowEmptyString()][string]$Text)
    $hasher = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($Text)))).Replace('-', '').ToLowerInvariant() }
    finally { $hasher.Dispose() }
}

function Get-Daily69FinalizerTaskIdentity {
    param([string]$TaskName)
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    if (@($task.Actions).Count -ne 1) { throw 'DAILY69_FINALIZER_TASK_ACTION_INVALID' }
    $sid = ([Security.Principal.WindowsIdentity]::GetCurrent()).User.Value
    Assert-PrincipalSecurityIdentifier -ExpectedSid $sid -ReadbackIdentity ([string]$task.Principal.UserId) | Out-Null
    $action = $task.Actions[0]
    return [pscustomobject]@{
        principalSidSha256 = Get-Daily69FinalizerTextHash $sid.ToLowerInvariant()
        taskActionSha256 = Get-Daily69FinalizerTextHash (([string]$action.Execute) + "`n" + ([string]$action.Arguments) + "`n" + ([string]$action.WorkingDirectory))
    }
}

function ConvertTo-Daily69FinalizerOutcome {
    param([object[]]$Lines, [int]$ChildExitCode)
    $records = @()
    foreach ($line in $Lines) {
        try {
            $value = ([string]$line) | ConvertFrom-Json -ErrorAction Stop
            if ($value.event -in @('daily69_natural_closeout_finalized','daily69_natural_closeout_finalizer_failed')) { $records += $value }
        } catch { }
    }
    $fallback = 'DAILY69_FINALIZER_CHILD_OUTPUT_INVALID'
    if ($records.Count -ne 1) { return [pscustomobject]@{ outcome='failed'; safeError=$fallback; wrapperExitCode=3 } }
    $record = $records[0]
    if ($record.SAFE_TO_UPLOAD -ne $false -or $record.PLATFORM_UPLOAD -ne 0) { return [pscustomobject]@{ outcome='failed'; safeError='DAILY69_FINALIZER_CHILD_SAFETY_INVALID'; wrapperExitCode=3 } }
    if ($ChildExitCode -eq 0 -and $record.event -eq 'daily69_natural_closeout_finalized' -and $record.completion -eq 'PASS') {
        return [pscustomobject]@{ outcome='success'; safeError=''; wrapperExitCode=0 }
    }
    $safeError = if ([string]$record.safeError -match '^[A-Z][A-Z0-9_:-]{0,159}$') { [string]$record.safeError } else { '' }
    if (-not $safeError -and $record.closeout.matrix.gates) {
        foreach ($gate in $record.closeout.matrix.gates) {
            if ($gate.state -ne 'PASS' -and [string]$gate.reason -match '^[A-Z][A-Z0-9_:-]{0,159}$') { $safeError=[string]$gate.reason; break }
        }
    }
    if (-not $safeError) { $safeError=$fallback }
    if ($ChildExitCode -eq 2 -and ($record.completion -eq 'PENDING' -or $record.safeError -eq 'DAILY69_TASK_EVENTS_PENDING')) {
        return [pscustomobject]@{ outcome='pending'; safeError=$safeError; wrapperExitCode=2 }
    }
    return [pscustomobject]@{ outcome='failed'; safeError=$safeError; wrapperExitCode=3 }
}

function Write-Daily69FinalizerResult {
    param([string]$QueueRoot, [System.Collections.IDictionary]$Result)
    $allowed = @('schemaVersion','resultId','namespace','operationDate','expectedGitHead','actualGitHead','taskName','processId','startedAt','finishedAt','childExitCode','wrapperExitCode','outcome','safeError','outputSha256','principalSidSha256','taskActionSha256','SAFE_TO_UPLOAD','PLATFORM_UPLOAD')
    if ($Result.Count -ne $allowed.Count -or @($Result.Keys | Where-Object { $_ -notin $allowed }).Count -gt 0) { throw 'DAILY69_FINALIZER_RESULT_FIELDS_INVALID' }
    if ($Result.schemaVersion -ne 'daily69-finalizer-result-v1' -or $Result.namespace -notmatch '^operation-\d{4}-\d{2}-\d{2}(?:-attempt-[1-9]\d*)?$' -or $Result.operationDate -notmatch '^\d{4}-\d{2}-\d{2}$' -or $Result.expectedGitHead -notmatch '^[a-f0-9]{40}$' -or $Result.actualGitHead -notmatch '^(?:[a-f0-9]{40})?$' -or $Result.taskName -notmatch '^[A-Za-z0-9_-]{1,128}$' -or $Result.safeError -notmatch '^(?:[A-Z][A-Z0-9_:-]{0,159})?$' -or $Result.outputSha256 -notmatch '^[a-f0-9]{64}$' -or $Result.principalSidSha256 -notmatch '^(?:[a-f0-9]{64})?$' -or $Result.taskActionSha256 -notmatch '^(?:[a-f0-9]{64})?$') { throw 'DAILY69_FINALIZER_RESULT_SCHEMA_INVALID' }
    $root = Join-Path $QueueRoot 'finalizer-results'
    New-Item -ItemType Directory -Path $root -Force | Out-Null
    if ([string]$Result.resultId -notmatch '^[a-f0-9]{32}$') { throw 'DAILY69_FINALIZER_RESULT_ID_INVALID' }
    $json = $Result | ConvertTo-Json -Depth 8 -Compress
    $roundtrip = $json | ConvertFrom-Json -ErrorAction Stop
    if ($roundtrip.resultId -ne $Result.resultId -or $roundtrip.SAFE_TO_UPLOAD -ne $false -or $roundtrip.PLATFORM_UPLOAD -ne 0) { throw 'DAILY69_FINALIZER_RESULT_ROUNDTRIP_FAILED' }
    $path = Join-Path $root ($Result.resultId + '.json')
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes($json + "`n")
    $stream = [IO.File]::Open($path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
    return Get-Daily69FinalizerTextHash ($json + "`n")
}

function Receive-Daily69FinalizerProcess {
    param([Diagnostics.Process]$Process, [int]$TimeoutMilliseconds = 720000)
    if ($TimeoutMilliseconds -lt 1 -or $TimeoutMilliseconds -gt 720000) { throw 'DAILY69_FINALIZER_CHILD_TIMEOUT_INVALID' }
    $clock = [Diagnostics.Stopwatch]::StartNew()
    $streams = @()
    try {
        if (-not $Process.Start()) { throw 'DAILY69_FINALIZER_CHILD_START_FAILED' }
        $streams = @($Process.StandardOutput, $Process.StandardError)
        $chunkSize = 32768
        $buffers = @((New-Object char[] $chunkSize), (New-Object char[] $chunkSize))
        $texts = @((New-Object Text.StringBuilder), (New-Object Text.StringBuilder))
        $pending = @($streams[0].ReadAsync($buffers[0], 0, $chunkSize), $streams[1].ReadAsync($buffers[1], 0, $chunkSize))
        $done = @($false, $false)
        $bytes = 1 # separator between stdout and stderr
        $safeError = ''
        while ($true) {
            $madeProgress = $false
            for ($index = 0; $index -lt 2; $index++) {
                if ($done[$index] -or -not $pending[$index].IsCompleted) { continue }
                $madeProgress = $true
                try { $count = $pending[$index].GetAwaiter().GetResult() }
                catch { $safeError = 'DAILY69_FINALIZER_CHILD_OUTPUT_READ_FAILED'; break }
                if ($count -eq 0) { $done[$index] = $true; continue }
                $chunk = New-Object string($buffers[$index], 0, $count)
                $bytes += [Text.Encoding]::UTF8.GetByteCount($chunk)
                if ($bytes -gt 4MB) { $safeError = 'DAILY69_FINALIZER_CHILD_OUTPUT_LIMIT'; break }
                $texts[$index].Append($chunk) | Out-Null
                $pending[$index] = $streams[$index].ReadAsync($buffers[$index], 0, $chunkSize)
            }
            if ($safeError -or ($done[0] -and $done[1] -and $Process.HasExited)) { break }
            if ($clock.ElapsedMilliseconds -ge $TimeoutMilliseconds) { $safeError = 'DAILY69_FINALIZER_CHILD_TIMEOUT'; break }
            if (-not $madeProgress) { [Threading.Thread]::Sleep(10) }
        }
        if ($safeError -and -not $Process.HasExited) {
            try { $Process.Kill() } catch { }
            # Never wait indefinitely for termination or inherited pipe handles.
            $Process.WaitForExit(2000) | Out-Null
        }
        $output = $texts[0].ToString() + "`n" + $texts[1].ToString()
        $lines = @()
        if (-not $safeError) { $lines = @($output -split '\r?\n' | Where-Object { $_.Trim() }) }
        return [pscustomobject]@{ childExitCode = if ($Process.HasExited) { [int]$Process.ExitCode } else { -1 }; lines = $lines; outputSha256 = Get-Daily69FinalizerTextHash $output; safeError = $safeError }
    } finally {
        # Closing the read handles cancels outstanding asynchronous reads; do not
        # access their Result properties while a descendant still owns a writer.
        foreach ($stream in $streams) { try { $stream.BaseStream.Dispose() } catch { } }
        $Process.Dispose()
    }
}

function Invoke-Daily69FinalizerChild {
    param([string]$WorktreeRoot, [string]$QueueRoot, [int]$TimeoutMilliseconds = 720000)
    if ($TimeoutMilliseconds -lt 1 -or $TimeoutMilliseconds -gt 720000) { throw 'DAILY69_FINALIZER_CHILD_TIMEOUT_INVALID' }
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = (Get-Command node.exe -ErrorAction Stop).Source
    $start.Arguments = '--conditions=react-server --import tsx "scripts/daily69-first-operation/finalize-natural-closeout.ts" --queue-root "' + $QueueRoot + '"'
    $start.WorkingDirectory = $WorktreeRoot
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
    $start.StandardErrorEncoding = [Text.UTF8Encoding]::new($false)
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $start
    return Receive-Daily69FinalizerProcess -Process $process -TimeoutMilliseconds $TimeoutMilliseconds
}
