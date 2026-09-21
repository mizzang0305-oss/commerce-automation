[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$WorktreeRoot)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common-no-upload.ps1") -WorktreeRoot $WorktreeRoot
& npm.cmd run queue-video:run-next --silent
exit $LASTEXITCODE
