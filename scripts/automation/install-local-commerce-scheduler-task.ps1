[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$TaskName = "CommerceAutomationLocalScheduler",
  [ValidateRange(15, 1440)]
  [int]$IntervalMinutes = 60,
  [string]$RuntimeLink = (Join-Path $env:USERPROFILE ".codex\runtime\commerce-poc-pr231"),
  [switch]$StartNow
)

$ErrorActionPreference = "Stop"
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$runtimeLinkPath = [System.IO.Path]::GetFullPath($RuntimeLink)
$runtimeParent = Split-Path -Parent $runtimeLinkPath
$sourceRunner = Join-Path $PSScriptRoot "run-local-commerce-scheduler-task.ps1"
if (-not (Test-Path -LiteralPath $sourceRunner -PathType Leaf)) {
  throw "LOCAL_SCHEDULER_TASK_RUNNER_NOT_FOUND"
}

if (Test-Path -LiteralPath $runtimeLinkPath) {
  $link = Get-Item -LiteralPath $runtimeLinkPath -Force
  $target = @($link.Target)[0]
  if ($link.LinkType -ne "Junction" -or [System.IO.Path]::GetFullPath($target) -ne $repoRoot) {
    throw "LOCAL_SCHEDULER_RUNTIME_LINK_CONFLICT"
  }
} elseif ($PSCmdlet.ShouldProcess($runtimeLinkPath, "Create short runtime junction to isolated worktree")) {
  New-Item -ItemType Directory -Path $runtimeParent -Force | Out-Null
  New-Item -ItemType Junction -Path $runtimeLinkPath -Target $repoRoot | Out-Null
}

$runnerPath = Join-Path $runtimeLinkPath "scripts\automation\run-local-commerce-scheduler-task.ps1"

$powershellPath = Join-Path $PSHOME "powershell.exe"
$taskCommand = "`"$powershellPath`" -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runnerPath`""
$existingXmlText = @(& schtasks.exe /Query /TN $TaskName /XML 2>$null)
if ($LASTEXITCODE -eq 0) {
  [xml]$existingXml = $existingXmlText -join [Environment]::NewLine
  $namespace = New-Object System.Xml.XmlNamespaceManager($existingXml.NameTable)
  $namespace.AddNamespace("task", "http://schemas.microsoft.com/windows/2004/02/mit/task")
  $existingCommand = $existingXml.SelectSingleNode("//task:Exec/task:Command", $namespace).InnerText
  $existingArguments = $existingXml.SelectSingleNode("//task:Exec/task:Arguments", $namespace).InnerText
  if ($existingCommand -ne $powershellPath -or -not $existingArguments.Contains($runnerPath)) {
    throw "LOCAL_SCHEDULER_TASK_NAME_CONFLICT"
  }
}

if ($PSCmdlet.ShouldProcess($TaskName, "Register current-user local commerce scheduler task")) {
  & schtasks.exe /Create /TN $TaskName /SC MINUTE /MO $IntervalMinutes /TR $taskCommand /F | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "LOCAL_SCHEDULER_TASK_REGISTRATION_FAILED"
  }

  if ($StartNow) {
    & schtasks.exe /Run /TN $TaskName | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "LOCAL_SCHEDULER_TASK_START_FAILED"
    }
  }
}

[pscustomobject]@{
  task_name = $TaskName
  interval_minutes = $IntervalMinutes
  runtime_link = $runtimeLinkPath
  runner = $runnerPath
  start_now = [bool]$StartNow
  overlap_guard = "scheduler_global_lock"
  SAFE_TO_UPLOAD = $false
  SAFE_TO_PUBLIC_UPLOAD = $false
}
