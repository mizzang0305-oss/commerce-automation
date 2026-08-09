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
$names = @("Minz-Commerce-Scout-NoUpload-V1", "Minz-Commerce-VideoBatch-NoUpload-V1", "Minz-Commerce-ControlRunner-NoUpload-V1", "Minz-Commerce-Daily69-Closeout-NoUpload-V1")
$root = (Resolve-Path -LiteralPath $WorktreeRoot).Path
$queue = (Resolve-Path -LiteralPath $QueueRoot).Path
$source = (Resolve-Path -LiteralPath $SourceRoot).Path
$envPath = (Resolve-Path -LiteralPath $EnvFile).Path
$backupRoot = Join-Path $queue "task-definitions"
$operationLocal = [DateTime]::ParseExact($OperationDate, "yyyy-MM-dd", [Globalization.CultureInfo]::InvariantCulture)
if ($operationLocal -le (Get-Date).Date) { throw "FIRST_OPERATION_DATE_MUST_BE_FUTURE" }

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

$backups = @{}
foreach ($name in $names) {
    Assert-OwnedNoUploadTask $name
    $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    if ($null -ne $task) {
        $xml = Export-ScheduledTask -TaskName $name
        $backups[$name] = $xml
        $xml | Set-Content -LiteralPath (Join-Path $backupRoot "$name.xml") -Encoding Unicode
    }
}

$batchScript = (Resolve-Path -LiteralPath (Join-Path $root "scripts\daily69-first-operation\run-batch-no-upload.ps1")).Path
$controlScript = (Resolve-Path -LiteralPath (Join-Path $root "scripts\daily69-first-operation\run-control-no-upload.ps1")).Path
$closeoutScript = (Resolve-Path -LiteralPath (Join-Path $root "scripts\daily69-first-operation\run-closeout-no-upload.ps1")).Path
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$batchSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::FromMinutes(55)) -Hidden -MultipleInstances IgnoreNew -StartWhenAvailable
$controlSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::FromMinutes(5)) -Hidden -MultipleInstances IgnoreNew -StartWhenAvailable
$closeoutSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::FromMinutes(30)) -Hidden -MultipleInstances IgnoreNew -StartWhenAvailable
$batchTriggers = 4..23 | ForEach-Object { New-ScheduledTaskTrigger -Once -At $operationLocal.AddHours($_) }
$controlTrigger = New-ScheduledTaskTrigger -Once -At $operationLocal.AddMinutes(1) -RepetitionInterval ([TimeSpan]::FromMinutes(1)) -RepetitionDuration ([TimeSpan]::FromHours(23.9))
$closeoutTrigger = New-ScheduledTaskTrigger -Once -At $operationLocal.AddHours(23).AddMinutes(55)

try {
    foreach ($name in $names[1..3]) { if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $name -Confirm:$false } }
    if ($PSCmdlet.ShouldProcess($names[1], "Register first-operation 20-hour no-upload batch task")) { Register-ScheduledTask -TaskName $names[1] -Action (New-OperationAction $batchScript) -Trigger $batchTriggers -Settings $batchSettings -Principal $principal -Description "First operation day local video batches only; no upload." | Out-Null }
    if ($PSCmdlet.ShouldProcess($names[2], "Register first-operation no-upload control runner")) { Register-ScheduledTask -TaskName $names[2] -Action (New-OperationAction $controlScript) -Trigger $controlTrigger -Settings $controlSettings -Principal $principal -Description "First operation day local queue command runner and Sheets projection only; no upload." | Out-Null }
    if ($PSCmdlet.ShouldProcess($names[3], "Register first-operation no-upload closeout")) { Register-ScheduledTask -TaskName $names[3] -Action (New-OperationAction $closeoutScript) -Trigger $closeoutTrigger -Settings $closeoutSettings -Principal $principal -Description "First operation day pause, projection, and local closeout only; no upload." | Out-Null }
    Disable-ScheduledTask -TaskName $names[0] | Out-Null
} catch {
    foreach ($name in $names[1..3]) { if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $name -Confirm:$false } }
    foreach ($name in $backups.Keys) { Register-ScheduledTask -TaskName $name -Xml $backups[$name] | Out-Null }
    throw
}

[pscustomobject]@{ event = "daily69_first_operation_tasks_armed"; operationDate = $OperationDate; batchTriggers = 20; batchSize = 3; batchState = [string](Get-ScheduledTask -TaskName $names[1]).State; controlState = [string](Get-ScheduledTask -TaskName $names[2]).State; closeoutState = [string](Get-ScheduledTask -TaskName $names[3]).State; scoutState = [string](Get-ScheduledTask -TaskName $names[0]).State; multipleInstances = "IgnoreNew"; startWhenAvailable = $true; secretsPrinted = $false; SAFE_TO_UPLOAD = $false; PLATFORM_UPLOAD = 0 }
