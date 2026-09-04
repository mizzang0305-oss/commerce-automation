[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory = $true)][string]$WorktreeRoot,
    [Parameter(Mandatory = $true)][string]$QueueRoot,
    [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9_-]{1,96}$')][string]$Namespace,
    [Parameter(Mandatory = $true)][ValidatePattern('^\d{4}-\d{2}-\d{2}$')][string]$OperationDate,
    [Parameter(Mandatory = $true)][string]$SourceRoot,
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-f0-9]{40}$')][string]$ExpectedGitHead,
    [Parameter(Mandatory = $true)][string]$EnvFile
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "principal-identity.ps1")
. (Join-Path $PSScriptRoot 'timing-contract.ps1')
$names = @("Minz-Commerce-Scout-NoUpload-V1", "Minz-Commerce-VideoBatch-NoUpload-V1", "Minz-Commerce-ControlRunner-NoUpload-V1", "Minz-Commerce-Daily69-Closeout-NoUpload-V1", "Minz-Commerce-Daily69-Finalizer-NoUpload-V1")
$root = (Resolve-Path -LiteralPath $WorktreeRoot).Path
$queue = (Resolve-Path -LiteralPath $QueueRoot).Path
$source = (Resolve-Path -LiteralPath $SourceRoot).Path
$envPath = (Resolve-Path -LiteralPath $EnvFile).Path
$backupRoot = Join-Path $queue "task-definitions"
$operationLocal = [DateTime]::ParseExact($OperationDate, "yyyy-MM-dd", [Globalization.CultureInfo]::InvariantCulture)
$timing = Get-Daily69Timing -OperationDate $OperationDate
if ($operationLocal -le (Get-Date).Date) { throw "FIRST_OPERATION_DATE_MUST_BE_FUTURE" }
$manifestPath = Join-Path $queue "operation-manifest.json"
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ([string]$manifest.schemaVersion -ne "daily69-first-operation-v2" -or [string]$manifest.armStatus -ne "projection_verified") { throw "FIRST_OPERATION_PROJECTION_VERIFICATION_REQUIRED" }
if ([string]$manifest.namespace -ne $Namespace -or [string]$manifest.operationDate -ne $OperationDate -or [string]$manifest.expectedGitHead -ne $ExpectedGitHead) { throw "FIRST_OPERATION_TASK_BINDING_MISMATCH" }
$env:QUEUE_SCHEDULER_ROOT = $queue
$env:FIRST_OPERATION_SOURCE_ROOT = $source
$env:SAFE_TO_UPLOAD = "false"
$env:SAFE_TO_PUBLIC_UPLOAD = "false"
$env:YOUTUBE_AUTO_UPLOAD = "false"
$env:PUBLIC_UPLOAD = "false"
$env:UNLISTED_UPLOAD = "false"
$env:TIKTOK_AUTO_UPLOAD = "false"
$env:THREADS_AUTO_POST = "false"
$env:COMMENT_AUTOMATION = "false"
$env:GOOGLE_DRIVE_VIDEO_UPLOAD = "false"
Push-Location $root
try {
    & npm.cmd run daily69:first-day:preflight --silent -- --arming
    if ($LASTEXITCODE -ne 0) { throw "FIRST_OPERATION_MATERIALIZATION_PREFLIGHT_FAILED" }
} finally { Pop-Location }
$operationalLog = Get-WinEvent -ListLog "Microsoft-Windows-TaskScheduler/Operational" -ErrorAction Stop
if (-not [bool]$operationalLog.IsEnabled) { throw "TASK_SCHEDULER_OPERATIONAL_LOG_REQUIRED" }
$batchSize = [int]$manifest.batchSize
if ($batchSize -lt 1) { $batchSize = 3 }
$scheduledRemaining = [int]$manifest.scheduledRemaining
$expectedBatchCount = [int][Math]::Ceiling($scheduledRemaining / [double]$batchSize)
$expectedBatchHours = @($manifest.schedule | ForEach-Object { [int]$_.hourKst })
if ($expectedBatchHours.Count -ne $expectedBatchCount -or $expectedBatchHours.Count -lt 1 -or ($expectedBatchHours | Where-Object { $_ -lt 4 -or $_ -gt 23 })) { throw "FIRST_OPERATION_BATCH_SCHEDULE_INVALID" }
if (@($expectedBatchHours | Select-Object -Unique).Count -ne $expectedBatchHours.Count) { throw "FIRST_OPERATION_BATCH_SCHEDULE_DUPLICATE" }
$currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value

function Assert-OwnedNoUploadTask([string]$Name) {
    $task = Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue
    if ($null -eq $task) { return }
    $actionText = (@($task.Actions) | ForEach-Object { [string]$_.Execute + " " + [string]$_.Arguments }) -join " "
    if ($actionText -notmatch '(?i)commerce-automation' -or [string]$task.Description -notmatch '(?i)no.?upload') { throw "SCHEDULED_TASK_OWNERSHIP_UNVERIFIED:$Name" }
    $xml = Export-ScheduledTask -TaskName $Name
    if ($xml -match '(?i)(authorization|bearer\s|private[_ -]?key|client[_ -]?secret|access[_ -]?key|token\s*[=:])') { throw "SCHEDULED_TASK_SECRET_FINDING:$Name" }
}

function Quote([string]$Value) { return '"' + $Value.Replace('"', '\"') + '"' }
function New-OperationAction([string]$Script) {
    $arguments = "-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File $(Quote $Script) -WorktreeRoot $(Quote $root) -QueueRoot $(Quote $queue) -Namespace $(Quote $Namespace) -SourceRoot $(Quote $source) -ExpectedGitHead $(Quote $ExpectedGitHead) -EnvFile $(Quote $envPath)"
    return New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument $arguments -WorkingDirectory $root
}

function Assert-TaskBinding([string]$Name, [string]$Role) {
    $task = Get-ScheduledTask -TaskName $Name -ErrorAction Stop
    $scriptPath = switch ($Role) { 'batch' { $batchScript }; 'control' { $controlScript }; 'closeout' { $closeoutScript }; 'finalizer' { $finalizerScript } }
    $expectedAction = New-OperationAction $scriptPath
    $actions = @($task.Actions)
    if ($actions.Count -ne 1 -or [string]$actions[0].Execute -cne [string]$expectedAction.Execute -or [string]$actions[0].Arguments -cne [string]$expectedAction.Arguments -or [string]$actions[0].WorkingDirectory -cne $root) { throw "FIRST_OPERATION_TASK_ACTION_VERIFY_FAILED:$Name" }
    $actionText = (@($task.Actions) | ForEach-Object { [string]$_.Execute + " " + [string]$_.Arguments }) -join " "
    foreach ($required in @($root, $queue, $source, $envPath, $Namespace, $ExpectedGitHead)) {
        if ($actionText -notlike "*$required*") { throw "FIRST_OPERATION_TASK_BINDING_VERIFY_FAILED:$Name" }
    }
    if ([string]$task.State -eq "Disabled") { throw "FIRST_OPERATION_TASK_DISABLED:$Name" }
    if ([string]$task.Settings.MultipleInstances -ne "IgnoreNew" -or -not [bool]$task.Settings.StartWhenAvailable) { throw "FIRST_OPERATION_TASK_SETTINGS_VERIFY_FAILED:$Name" }
    try {
        Assert-PrincipalSecurityIdentifier -ExpectedSid $currentSid -ReadbackIdentity ([string]$task.Principal.UserId) | Out-Null
    } catch {
        throw "FIRST_OPERATION_TASK_PRINCIPAL_VERIFY_FAILED:$Name"
    }
    if (-not [bool]$task.Settings.Hidden -or [string]$task.Principal.RunLevel -ne "Limited" -or [string]$task.Principal.LogonType -ne "Interactive") { throw "FIRST_OPERATION_TASK_PRINCIPAL_VERIFY_FAILED:$Name" }
    if (@($task.Actions | Where-Object { [string]$_.WorkingDirectory -ne $root }).Count -gt 0) { throw "FIRST_OPERATION_TASK_WORKDIR_VERIFY_FAILED:$Name" }
    $starts = @($task.Triggers | ForEach-Object { [DateTime]::Parse([string]$_.StartBoundary) })
    $expectedTriggerDate = if ($Role -in @('closeout', 'finalizer')) { $operationLocal.AddDays(1).Date } else { $operationLocal.Date }
    if ($starts | Where-Object { $_.Date -ne $expectedTriggerDate }) { throw "FIRST_OPERATION_TASK_DATE_VERIFY_FAILED:$Name" }
    if ($Role -eq "batch") {
        $hours = @($starts | Sort-Object | ForEach-Object { $_.Hour })
        if ($hours.Count -ne $expectedBatchHours.Count -or (Compare-Object -ReferenceObject @($expectedBatchHours | Sort-Object) -DifferenceObject $hours)) { throw "FIRST_OPERATION_BATCH_TRIGGERS_VERIFY_FAILED:$Name" }
        if (@($starts | Where-Object { $_.Minute -ne 0 -or $_.Second -ne 0 }).Count -gt 0) { throw "FIRST_OPERATION_BATCH_TRIGGERS_VERIFY_FAILED:$Name" }
    }
    if ($Role -eq "control" -and ($starts.Count -ne 1 -or $starts[0] -ne $operationLocal.AddMinutes(1))) { throw "FIRST_OPERATION_CONTROL_TRIGGER_VERIFY_FAILED:$Name" }
    if ($Role -eq "closeout" -and ($starts.Count -ne 1 -or $starts[0] -ne $timing.closeoutAt)) { throw "FIRST_OPERATION_CLOSEOUT_TRIGGER_VERIFY_FAILED:$Name" }
    if ($Role -eq "finalizer" -and ($starts.Count -ne 1 -or $starts[0] -ne $timing.finalizerAt)) { throw "FIRST_OPERATION_FINALIZER_TRIGGER_VERIFY_FAILED:$Name" }
    $limitMinutes = switch ($Role) { 'batch' { $timing.contract.batchExecutionLimitMinutes }; 'control' { 5 }; 'closeout' { $timing.contract.closeoutExecutionLimitMinutes }; 'finalizer' { $timing.contract.finalizerExecutionLimitMinutes } }
    if ([System.Xml.XmlConvert]::ToTimeSpan([string]$task.Settings.ExecutionTimeLimit) -ne [TimeSpan]::FromMinutes($limitMinutes)) { throw "FIRST_OPERATION_TASK_EXECUTION_LIMIT_VERIFY_FAILED:$Name" }
}

function Get-TaskContractHash([string]$Value) {
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($algorithm.ComputeHash([Text.Encoding]::UTF8.GetBytes($Value)))).Replace('-', '').ToLowerInvariant() }
    finally { $algorithm.Dispose() }
}

function Write-FinalizerTaskContract {
    $task = Get-ScheduledTask -TaskName $names[4] -ErrorAction Stop
    $parts = @($task.Actions | ForEach-Object { [string]$_.Execute; [string]$_.Arguments; [string]$_.WorkingDirectory })
    $contract = [ordered]@{ schemaVersion = 'daily69-finalizer-task-contract-v1'; namespace = $Namespace; operationDate = $OperationDate; expectedGitHead = $ExpectedGitHead; taskName = $names[4]; principalSidSha256 = Get-TaskContractHash $currentSid.ToLowerInvariant(); taskActionSha256 = Get-TaskContractHash ($parts -join "`n") }
    $path = Join-Path $backupRoot 'finalizer-task-contract.json'
    if (Test-Path -LiteralPath $path) {
        $existing = Get-Content -LiteralPath $path -Raw -Encoding utf8 | ConvertFrom-Json
        foreach ($key in $contract.Keys) { if ([string]$existing.$key -cne [string]$contract[$key]) { throw 'FIRST_OPERATION_FINALIZER_TASK_CONTRACT_MISMATCH' } }
        return
    }
    $stream = [IO.File]::Open($path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes(($contract | ConvertTo-Json -Compress))
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Flush($true)
    } finally { $stream.Dispose() }
}

$backups = @{}
$scoutOriginallyDisabled = $true
foreach ($name in $names) {
    Assert-OwnedNoUploadTask $name
    $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    if ($null -ne $task) {
        if ($name -eq $names[0]) { $scoutOriginallyDisabled = ([string]$task.State -eq "Disabled") }
        $xml = Export-ScheduledTask -TaskName $name
        $backups[$name] = $xml
        if (-not $WhatIfPreference) { $xml | Set-Content -LiteralPath (Join-Path $backupRoot "$name.xml") -Encoding Unicode }
    }
}

if ($WhatIfPreference) {
    [pscustomobject]@{ event = "daily69_first_operation_tasks_plan"; operationDate = $OperationDate; namespace = $Namespace; batchTriggers = $expectedBatchCount; closeoutAt = $timing.closeoutAt.ToString('o'); finalizerAt = $timing.finalizerAt.ToString('o'); timingContract = $timing.contract; mutationPerformed = $false; SAFE_TO_UPLOAD = $false; PLATFORM_UPLOAD = 0 }
    return
}

$batchScript = (Resolve-Path -LiteralPath (Join-Path $root "scripts\daily69-first-operation\run-batch-no-upload.ps1")).Path
$controlScript = (Resolve-Path -LiteralPath (Join-Path $root "scripts\daily69-first-operation\run-control-no-upload.ps1")).Path
$closeoutScript = (Resolve-Path -LiteralPath (Join-Path $root "scripts\daily69-first-operation\run-closeout-no-upload.ps1")).Path
$finalizerScript = (Resolve-Path -LiteralPath (Join-Path $root "scripts\daily69-first-operation\run-finalizer-no-upload.ps1")).Path
$principal = New-ScheduledTaskPrincipal -UserId $currentSid -LogonType Interactive -RunLevel Limited
$batchSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::FromMinutes($timing.contract.batchExecutionLimitMinutes)) -Hidden -MultipleInstances IgnoreNew -StartWhenAvailable
$controlSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::FromMinutes(5)) -Hidden -MultipleInstances IgnoreNew -StartWhenAvailable
$closeoutSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::FromMinutes($timing.contract.closeoutExecutionLimitMinutes)) -Hidden -MultipleInstances IgnoreNew -StartWhenAvailable
$finalizerSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::FromMinutes($timing.contract.finalizerExecutionLimitMinutes)) -Hidden -MultipleInstances IgnoreNew -StartWhenAvailable
$batchTriggers = $expectedBatchHours | Sort-Object | ForEach-Object { New-ScheduledTaskTrigger -Once -At $operationLocal.AddHours($_) }
$controlTrigger = New-ScheduledTaskTrigger -Once -At $operationLocal.AddMinutes(1) -RepetitionInterval ([TimeSpan]::FromMinutes(1)) -RepetitionDuration ([TimeSpan]::FromHours(23.9))
$closeoutTrigger = New-ScheduledTaskTrigger -Once -At $timing.closeoutAt
$finalizerTrigger = New-ScheduledTaskTrigger -Once -At $timing.finalizerAt

try {
    foreach ($name in $names[1..4]) { if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $name -Confirm:$false } }
    if ($PSCmdlet.ShouldProcess($names[1], "Register first-operation 20-hour no-upload batch task")) { Register-ScheduledTask -TaskName $names[1] -Action (New-OperationAction $batchScript) -Trigger $batchTriggers -Settings $batchSettings -Principal $principal -Description "First operation day local video batches only; no upload." | Out-Null }
    if ($PSCmdlet.ShouldProcess($names[2], "Register first-operation no-upload control runner")) { Register-ScheduledTask -TaskName $names[2] -Action (New-OperationAction $controlScript) -Trigger $controlTrigger -Settings $controlSettings -Principal $principal -Description "First operation day local queue command runner and Sheets projection only; no upload." | Out-Null }
    if ($PSCmdlet.ShouldProcess($names[3], "Register first-operation no-upload closeout")) { Register-ScheduledTask -TaskName $names[3] -Action (New-OperationAction $closeoutScript) -Trigger $closeoutTrigger -Settings $closeoutSettings -Principal $principal -Description "First operation day pause, projection, and local closeout only; no upload." | Out-Null }
    if ($PSCmdlet.ShouldProcess($names[4], "Register first-operation no-upload natural closeout finalizer")) { Register-ScheduledTask -TaskName $names[4] -Action (New-OperationAction $finalizerScript) -Trigger $finalizerTrigger -Settings $finalizerSettings -Principal $principal -Description "Bind natural Task Scheduler evidence and finalize Daily69 closeout; no upload." | Out-Null }
    Disable-ScheduledTask -TaskName $names[0] | Out-Null
    Assert-TaskBinding $names[1] "batch"
    Assert-TaskBinding $names[2] "control"
    Assert-TaskBinding $names[3] "closeout"
    Assert-TaskBinding $names[4] "finalizer"
    if ([string](Get-ScheduledTask -TaskName $names[0] -ErrorAction Stop).State -ne "Disabled") { throw "FIRST_OPERATION_SCOUT_NOT_DISABLED" }
    Write-FinalizerTaskContract
    Push-Location $root
    try {
        & npm.cmd run daily69:first-day:arm-status --silent -- --operation-root $queue --status tasks_armed --promote
        if ($LASTEXITCODE -ne 0) { throw "FIRST_OPERATION_ACTIVE_POINTER_PROMOTION_FAILED" }
    } finally { Pop-Location }
} catch {
    foreach ($name in $names[1..4]) { if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $name -Confirm:$false } }
    foreach ($name in @($backups.Keys | Where-Object { $_ -ne $names[0] })) { Register-ScheduledTask -TaskName $name -Xml $backups[$name] -Force | Out-Null }
    $scout = Get-ScheduledTask -TaskName $names[0] -ErrorAction SilentlyContinue
    if ($null -eq $scout -and $backups.ContainsKey($names[0])) {
        Register-ScheduledTask -TaskName $names[0] -Xml $backups[$names[0]] -Force | Out-Null
    } elseif ($null -ne $scout) {
        if ($scoutOriginallyDisabled) { Disable-ScheduledTask -TaskName $names[0] | Out-Null }
        else { Enable-ScheduledTask -TaskName $names[0] | Out-Null }
    }
    Push-Location $root
    try { & npm.cmd run daily69:first-day:arm-status --silent -- --operation-root $queue --status held | Out-Null } catch { }
    finally { Pop-Location }
    throw
}

[pscustomobject]@{ event = "daily69_first_operation_tasks_armed"; operationDate = $OperationDate; batchTriggers = $expectedBatchCount; batchSize = $batchSize; scheduledRemaining = $scheduledRemaining; batchState = [string](Get-ScheduledTask -TaskName $names[1]).State; controlState = [string](Get-ScheduledTask -TaskName $names[2]).State; closeoutState = [string](Get-ScheduledTask -TaskName $names[3]).State; finalizerState = [string](Get-ScheduledTask -TaskName $names[4]).State; scoutState = [string](Get-ScheduledTask -TaskName $names[0]).State; multipleInstances = "IgnoreNew"; startWhenAvailable = $true; operationalLogEnabled = $true; secretsPrinted = $false; SAFE_TO_UPLOAD = $false; PLATFORM_UPLOAD = 0 }
