[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$WorktreeRoot,
    [Parameter(Mandatory = $true)][string]$QueueRoot,
    [Parameter(Mandatory = $true)][string]$Namespace,
    [string]$EnvFile = "C:\Users\LOVE\MyProjects\commerce-automation\.env.local"
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common-control-no-upload.ps1") -WorktreeRoot $WorktreeRoot -QueueRoot $QueueRoot -Namespace $Namespace -EnvFile $EnvFile
& npm.cmd run queue-control:run-once --silent
exit $LASTEXITCODE
