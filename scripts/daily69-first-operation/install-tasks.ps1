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
$names = @("Minz-Commerce-Scout-NoUpload-V1", "Minz-Commerce-VideoBatch-NoUpload-V1", "Minz-Commerce-ControlRunner-NoUpload-V1", "Minz-Commerce-Daily69-Closeout-NoUpload-V1", "Minz-Commerce-Daily69-Finalizer-NoUpload-V1")
$root = (Resolve-Path -LiteralPath $WorktreeRoot).Path
$queue = (Resolve-Path -LiteralPath $QueueRoot).Path
$source = (Resolve-Path -LiteralPath $SourceRoot).Path
$envPath = (Resolve-Path -LiteralPath $EnvFile).Path
$backupRoot = Join-Path $queue "task-definitions"
$operationLocal = [DateTime]::ParseExact($OperationDate, "yyyy-MM-dd", [Globalization.CultureInfo]::InvariantCulture)
if ($operationLocal -le (Get-Date).Date) { throw "FIRST_OPERATION_DATE_MUST_BE_FUTURE" }
$manifestPath = Join-Path $queue "operation-manifest.json"
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ([string]$manifest.schemaVersion -ne "daily69-first-operation-v2" -or [string]$manifest.armStatus -ne "projection_verified") { throw "FIRST_OPERATION_PROJECTION_VERIFICATION_REQUIRED" }
if ([string]$manifest.namespace -ne $Namespace -or [string]$manifest.operationDate -ne $OperationDate -or [string]$manifest.expectedGitHead -ne $ExpectedGitHead) { throw "FIRST_OPERATION_TASK_BINDING_MISMATCH" }
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
    $actionText = (@($task.Actions) | ForEach-Object { [string]$_.Execute + " " + [string]$_.Arguments }) -join " "
    foreach ($required in @($root, $queue, $source, $envPath, $Namespace, $ExpectedGitHead)) {
        if ($actionText -notlike "*$required*") { throw "FIRST_OPERATION_TASK_BINDING_VERIFY_FAILED:$Name" }
    }
    if ([string]$task.State -eq "Disabled") { throw "FIRST_OPERATION_TASK_DISABLED:$Name" }
    if ([string]$task.Settings.MultipleInstances -ne "IgnoreNew" -or -not [bool]$task.Settings.StartWhenAvailable) { throw "FIRST_OPERATION_TASK_SETTINGS_VERIFY_FAILED:$Name" }
    if (-not [bool]$task.Settings.Hidden -or [string]$task.Principal.RunLevel -ne "Limited" -or [string]$task.Principal.LogonType -ne "Interactive" -or [string]$task.Principal.UserId -ne $currentSid) { throw "FIRST_OPERATION_TASK_PRINCIPAL_VERIFY_FAILED:$Name" }
    if (@($task.Actions | Where-Object { [string]$_.WorkingDirectory -ne $root }).Count -gt 0) { throw "FIRST_OPERATION_TASK_WORKDIR_VERIFY_FAILED:$Name" }
    $starts = @($task.Triggers | ForEach-Object { [DateTime]::Parse([string]$_.StartBoundary) })
    if ($starts | Where-Object { $_.Date -ne $operationLocal.Date }) { throw "FIRST_OPERATION_TASK_DATE_VERIFY_FAILED:$Name" }
    if ($Role -eq "batch") {
        $hours = @($starts | Sort-Object | ForEach-Object { $_.Hour })
        if ($hours.Count -ne $expectedBatchHours.Count -or (Compare-Object -ReferenceObject @($expectedBatchHours | Sort-Object) -DifferenceObject $hours)) { throw "FIRST_OPERATION_BATCH_TRIGGERS_VERIFY_FAILED:$Name" }
    }
    if ($Role -eq "control" -and ($starts.Count -ne 1 -or $starts[0].Hour -ne 0 -or $starts[0].Minute -ne 1)) { throw "FIRST_OPERATION_CONTROL_TRIGGER_VERIFY_FAILED:$Name" }
    if ($Role -eq "closeout" -and ($starts.Count -ne 1 -or $starts[0].Hour -ne 23 -or $starts[0].Minute -ne 55)) { throw "FIRST_OPERATION_CLOSEOUT_TRIGGER_VERIFY_FAILED:$Name" }
    if ($Role -eq "finalizer" -and ($starts.Count -ne 1 -or $starts[0].Date -ne $operationLocal.AddDays(1).Date -or $starts[0].Hour -ne 0 -or $starts[0].Minute -ne 5)) { throw "FIRST_OPERATION_FINALIZER_TRIGGER_VERIFY_FAILED:$Name" }
}

$backups = @{}
foreach ($name in $names) {
    Assert-OwnedNoUploadTask $name
    $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    if ($null -ne $task) {
        $xml = Export-ScheduledTask -TaskName $name
        $backups[$name] = $xml
        if (-not $WhatIfPreference) { $xml | Set-Content -LiteralPath (Join-Path $backupRoot "$name.xml") -Encoding Unicode }
    }
}

if ($WhatIfPreference) {
    [pscustomobject]@{ event = "daily69_first_operation_tasks_plan"; operationDate = $OperationDate; namespace = $Namespace; batchTriggers = $expectedBatchCount; finalizerAt = $operationLocal.AddDays(1).AddMinutes(5).ToString('o'); mutationPerformed = $false; SAFE_TO_UPLOAD = $false; PLATFORM_UPLOAD = 0 }
    return
}

$batchScript = (Resolve-Path -LiteralPath (Join-Path $root "scripts\daily69-first-operation\run-batch-no-upload.ps1")).Path
$controlScript = (Resolve-Path -LiteralPath (Join-Path $root "scripts\daily69-first-operation\run-control-no-upload.ps1")).Path
$closeoutScript = (Resolve-Path -LiteralPath (Join-Path $root "scripts\daily69-first-operation\run-closeout-no-upload.ps1")).Path
$finalizerScript = (Resolve-Path -LiteralPath (Join-Path $root "scripts\daily69-first-operation\run-finalizer-no-upload.ps1")).Path
$principal = New-ScheduledTaskPrincipal -UserId $currentSid -LogonType Interactive -RunLevel Limited
$batchSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::FromMinutes(55)) -Hidden -MultipleInstances IgnoreNew -StartWhenAvailable
$controlSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::FromMinutes(5)) -Hidden -MultipleInstances IgnoreNew -StartWhenAvailable
$closeoutSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::FromMinutes(30)) -Hidden -MultipleInstances IgnoreNew -StartWhenAvailable
$finalizerSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::FromMinutes(15)) -Hidden -MultipleInstances IgnoreNew -StartWhenAvailable
$batchTriggers = $expectedBatchHours | Sort-Object | ForEach-Object { New-ScheduledTaskTrigger -Once -At $operationLocal.AddHours($_) }
$controlTrigger = New-ScheduledTaskTrigger -Once -At $operationLocal.AddMinutes(1) -RepetitionInterval ([TimeSpan]::FromMinutes(1)) -RepetitionDuration ([TimeSpan]::FromHours(23.9))
$closeoutTrigger = New-ScheduledTaskTrigger -Once -At $operationLocal.AddHours(23).AddMinutes(55)
$finalizerTrigger = New-ScheduledTaskTrigger -Once -At $operationLocal.AddDays(1).AddMinutes(5)

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
    Push-Location $root
    try {
        & npm.cmd run daily69:first-day:arm-status --silent -- --operation-root $queue --status tasks_armed --promote
        if ($LASTEXITCODE -ne 0) { throw "FIRST_OPERATION_ACTIVE_POINTER_PROMOTION_FAILED" }
    } finally { Pop-Location }
} catch {
    foreach ($name in $names) { if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $name -Confirm:$false } }
    foreach ($name in $backups.Keys) { Register-ScheduledTask -TaskName $name -Xml $backups[$name] -Force | Out-Null }
    Push-Location $root
    try { & npm.cmd run daily69:first-day:arm-status --silent -- --operation-root $queue --status held | Out-Null } catch { }
    finally { Pop-Location }
    throw
}

[pscustomobject]@{ event = "daily69_first_operation_tasks_armed"; operationDate = $OperationDate; batchTriggers = $expectedBatchCount; batchSize = $batchSize; scheduledRemaining = $scheduledRemaining; batchState = [string](Get-ScheduledTask -TaskName $names[1]).State; controlState = [string](Get-ScheduledTask -TaskName $names[2]).State; closeoutState = [string](Get-ScheduledTask -TaskName $names[3]).State; finalizerState = [string](Get-ScheduledTask -TaskName $names[4]).State; scoutState = [string](Get-ScheduledTask -TaskName $names[0]).State; multipleInstances = "IgnoreNew"; startWhenAvailable = $true; operationalLogEnabled = $true; secretsPrinted = $false; SAFE_TO_UPLOAD = $false; PLATFORM_UPLOAD = 0 }
