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
    foreach ($name in @("Minz-Commerce-VideoBatch-NoUpload-V1", "Minz-Commerce-ControlRunner-NoUpload-V1")) { Disable-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue | Out-Null }
    & npm.cmd run daily69:first-day:preflight --silent -- --sheets
    if ($LASTEXITCODE -ne 0) { throw "FIRST_OPERATION_PREFLIGHT_FAILED" }
    & npm.cmd run daily69:first-day:closeout --silent
    $closeoutExit = $LASTEXITCODE
    & npm.cmd run queue-control:project --silent
    Disable-ScheduledTask -TaskName "Minz-Commerce-Daily69-Closeout-NoUpload-V1" -ErrorAction SilentlyContinue | Out-Null
    if ($closeoutExit -ne 0) { exit $closeoutExit }
    exit $LASTEXITCODE
} catch {
    $reason = if ($_.Exception.Message -match '^[A-Z0-9_:-]+$') { $_.Exception.Message } else { "FIRST_OPERATION_CLOSEOUT_FAILED" }
    if (Get-Command Stop-FirstOperationFailClosed -ErrorAction SilentlyContinue) { Stop-FirstOperationFailClosed -Reason $reason }
    Disable-ScheduledTask -TaskName "Minz-Commerce-Daily69-Closeout-NoUpload-V1" -ErrorAction SilentlyContinue | Out-Null
    exit 3
}
