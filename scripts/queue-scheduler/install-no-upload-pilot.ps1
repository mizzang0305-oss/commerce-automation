[CmdletBinding(SupportsShouldProcess)]
param([Parameter(Mandatory = $true)][string]$WorktreeRoot)
$ErrorActionPreference = "Stop"
$scoutName = "Minz-Commerce-Scout-NoUpload-V1"
$batchName = "Minz-Commerce-VideoBatch-NoUpload-V1"
$root = (Resolve-Path -LiteralPath $WorktreeRoot).Path
$scoutScript = (Resolve-Path -LiteralPath (Join-Path $root "scripts\queue-scheduler\run-nightly-scout-no-upload.ps1")).Path
$batchScript = (Resolve-Path -LiteralPath (Join-Path $root "scripts\queue-scheduler\run-video-batch-no-upload.ps1")).Path
foreach ($name in @($scoutName, $batchName)) {
    if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) { throw "SCHEDULED_TASK_NAME_ALREADY_EXISTS:$name" }
}
function Quote([string]$value) { return '"' + $value.Replace('"', '\"') + '"' }
function New-NoUploadAction([string]$script) {
    $args = "-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File $(Quote $script) -WorktreeRoot $(Quote $root)"
    return New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument $args -WorkingDirectory $root
}
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::FromHours(4)) -Hidden -MultipleInstances IgnoreNew -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$scoutTrigger = New-ScheduledTaskTrigger -Daily -At "00:05"
$batchTriggers = 1..23 | ForEach-Object { New-ScheduledTaskTrigger -Daily -At ((Get-Date).Date.AddHours($_)) }
if ($PSCmdlet.ShouldProcess($scoutName, "Register no-upload nightly live product scout")) { Register-ScheduledTask -TaskName $scoutName -Action (New-NoUploadAction $scoutScript) -Trigger $scoutTrigger -Settings $settings -Principal $principal -Description "Local live product queue discovery only; no upload." | Out-Null }
if ($PSCmdlet.ShouldProcess($batchName, "Register no-upload hourly local video batch")) { Register-ScheduledTask -TaskName $batchName -Action (New-NoUploadAction $batchScript) -Trigger $batchTriggers -Settings $settings -Principal $principal -Description "Local queue video batch only; no upload." | Out-Null }
if (-not $WhatIfPreference) {
    Push-Location $root
    try {
        & npm.cmd run queue-video:configure-pilot --silent
        if ($LASTEXITCODE -ne 0) {
            Disable-ScheduledTask -TaskName $scoutName | Out-Null
            Disable-ScheduledTask -TaskName $batchName | Out-Null
            throw "QUEUE_PILOT_CONFIGURATION_FAILED"
        }
    } finally { Pop-Location }
}
[pscustomobject]@{ ScoutTask = $scoutName; BatchTask = $batchName; Registered = -not $WhatIfPreference; WorktreeRoot = $root; MultipleInstances = "IgnoreNew"; StartWhenAvailable = $true; SecretsPrinted = $false; SAFE_TO_UPLOAD = $false }
