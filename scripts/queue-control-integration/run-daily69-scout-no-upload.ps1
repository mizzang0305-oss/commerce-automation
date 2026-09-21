[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$WorktreeRoot,
    [Parameter(Mandatory = $true)][string]$QueueRoot,
    [Parameter(Mandatory = $true)][string]$Namespace,
    [string]$EnvFile = "C:\Users\LOVE\MyProjects\commerce-automation\.env.local"
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common-control-no-upload.ps1") -WorktreeRoot $WorktreeRoot -QueueRoot $QueueRoot -Namespace $Namespace -EnvFile $EnvFile
. (Join-Path $WorktreeRoot "scripts\queue-scheduler\common-no-upload.ps1") -WorktreeRoot $WorktreeRoot -EnvFile $EnvFile
& npm.cmd run queue-video:scout --silent
$queueExit = $LASTEXITCODE
& npm.cmd run queue-control:project --silent
if ($queueExit -ne 0) { exit $queueExit }
exit $LASTEXITCODE
