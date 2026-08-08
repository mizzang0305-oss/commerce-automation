param()

$ErrorActionPreference = "Stop"
$runner = (Resolve-Path (Join-Path $PSScriptRoot "run-google-sheets-command-runner.ps1")).Path

Write-Output "TASK_SCHEDULER_INSTALL_NOT_APPROVED"
Write-Output "No scheduled task was created or changed."
Write-Output "After separate approval, use this runner path in a manually reviewed Task Scheduler definition:"
Write-Output $runner
