[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory = $true)][string]$WorktreeRoot,
    [Parameter(Mandatory = $true)][string]$QueueRoot,
    [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9_-]{1,96}$')][string]$Namespace,
    [switch]$Enable
)
$ErrorActionPreference = "Stop"
$taskName = "Minz-Commerce-ControlRunner-NoUpload-V1"
$root = (Resolve-Path -LiteralPath $WorktreeRoot).Path
$queue = (Resolve-Path -LiteralPath $QueueRoot).Path
$script = (Resolve-Path -LiteralPath (Join-Path $root "scripts\queue-control-integration\run-control-runner-no-upload.ps1")).Path
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { throw "SCHEDULED_TASK_NAME_ALREADY_EXISTS:$taskName" }
function Quote([string]$value) { return '"' + $value.Replace('"', '\"') + '"' }
$arguments = "-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File $(Quote $script) -WorktreeRoot $(Quote $root) -QueueRoot $(Quote $queue) -Namespace $(Quote $Namespace)"
$action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument $arguments -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) -RepetitionInterval ([TimeSpan]::FromMinutes(1))
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::FromMinutes(5)) -Hidden -MultipleInstances IgnoreNew -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
if ($PSCmdlet.ShouldProcess($taskName, "Register one-minute no-upload control runner")) {
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Local JSON queue command runner and Sheets projection only; no upload." | Out-Null
    if (-not $Enable) { Disable-ScheduledTask -TaskName $taskName | Out-Null }
}
[pscustomobject]@{ TaskName = $taskName; Registered = -not $WhatIfPreference; Enabled = [bool]$Enable; IntervalMinutes = 1; Namespace = $Namespace; SAFE_TO_UPLOAD = $false }
