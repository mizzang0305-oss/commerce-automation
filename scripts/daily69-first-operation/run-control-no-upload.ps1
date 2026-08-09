[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$WorktreeRoot,
    [Parameter(Mandatory = $true)][string]$QueueRoot,
    [Parameter(Mandatory = $true)][string]$Namespace,
    [Parameter(Mandatory = $true)][string]$SourceRoot,
    [Parameter(Mandatory = $true)][string]$ExpectedGitHead,
    [Parameter(Mandatory = $true)][string]$EnvFile
)
$ErrorActionPreference = "Stop"
try {
    . (Join-Path $PSScriptRoot "common-first-operation-no-upload.ps1") -WorktreeRoot $WorktreeRoot -QueueRoot $QueueRoot -Namespace $Namespace -SourceRoot $SourceRoot -ExpectedGitHead $ExpectedGitHead -EnvFile $EnvFile
    & npm.cmd run daily69:first-day:preflight --silent -- --sheets
    if ($LASTEXITCODE -ne 0) { throw "FIRST_OPERATION_PREFLIGHT_FAILED" }
    & npm.cmd run queue-control:run-once --silent
    exit $LASTEXITCODE
} catch {
    $reason = if ($_.Exception.Message -match '^[A-Z0-9_:-]+$') { $_.Exception.Message } else { "FIRST_OPERATION_CONTROL_FAILED" }
    if (Get-Command Stop-FirstOperationFailClosed -ErrorAction SilentlyContinue) { Stop-FirstOperationFailClosed -Reason $reason }
    exit 3
}
