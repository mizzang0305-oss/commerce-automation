[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$WorktreeRoot, [switch]$DueNow)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common-no-upload.ps1") -WorktreeRoot $WorktreeRoot
$arguments = @("run", "queue-video:scout", "--silent")
if ($DueNow) { $arguments += @("--", "--due-now") }
& npm.cmd @arguments
exit $LASTEXITCODE
