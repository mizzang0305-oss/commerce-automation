[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$TaskName = "CommerceAutomationLocalScheduler",
  [string]$RuntimeLink = (Join-Path $env:USERPROFILE ".codex\r\c231"),
  [string]$CredentialEnvFile,
  [switch]$EnableLiveSearch,
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
$legacyRunnerPath = Join-Path $env:USERPROFILE ".codex\runtime\commerce-poc-pr231\scripts\automation\run-local-commerce-scheduler-task.ps1"
$envPathPointer = $runtimeLinkPath + ".env-path"
if ($EnableLiveSearch) {
  if (-not $CredentialEnvFile) {
    throw "LOCAL_SCHEDULER_CREDENTIAL_ENV_FILE_REQUIRED"
  }
  $resolvedCredentialEnvFile = [System.IO.Path]::GetFullPath($CredentialEnvFile)
  if (-not (Test-Path -LiteralPath $resolvedCredentialEnvFile -PathType Leaf)) {
    throw "LOCAL_SCHEDULER_CREDENTIAL_ENV_FILE_MISSING"
  }
  if ($PSCmdlet.ShouldProcess($envPathPointer, "Write credential env path pointer without credential values")) {
    $resolvedCredentialEnvFile | Set-Content -LiteralPath $envPathPointer -Encoding UTF8
  }
}

$powershellPath = Join-Path $PSHOME "powershell.exe"
$slots = @(
  [pscustomobject]@{ suffix = ""; id = "morning_commute"; time = "07:30" },
  [pscustomobject]@{ suffix = "-LunchBreak"; id = "lunch_break"; time = "12:20" },
  [pscustomobject]@{ suffix = "-EveningCommute"; id = "evening_commute"; time = "18:30" },
  [pscustomobject]@{ suffix = "-BeforeBed"; id = "before_bed"; time = "22:30" }
)

foreach ($slot in $slots) {
  $slotTaskName = $TaskName + $slot.suffix
  $liveSearchArgument = if ($EnableLiveSearch) { " -EnableLiveSearch" } else { "" }
  # Use PowerShell's unique -WindowStyle abbreviation so the scheduled window
  # stays hidden without pushing the final fail-closed live-search flag beyond
  # Task Scheduler's command-length boundary.
  $taskCommand = "`"$powershellPath`" -NoProfile -NonInteractive -W Hidden -ExecutionPolicy Bypass -File `"$runnerPath`" -SlotId $($slot.id)$liveSearchArgument"
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "SilentlyContinue"
  $existingXmlText = @(& schtasks.exe /Query /TN $slotTaskName /XML 2>$null)
  $queryExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  if ($queryExitCode -eq 0) {
    [xml]$existingXml = $existingXmlText -join [Environment]::NewLine
    $namespace = New-Object System.Xml.XmlNamespaceManager($existingXml.NameTable)
    $namespace.AddNamespace("task", "http://schemas.microsoft.com/windows/2004/02/mit/task")
    $existingCommand = $existingXml.SelectSingleNode("//task:Exec/task:Command", $namespace).InnerText
    $existingArguments = $existingXml.SelectSingleNode("//task:Exec/task:Arguments", $namespace).InnerText
    $managedRunner = $existingArguments.Contains($runnerPath) -or $existingArguments.Contains($legacyRunnerPath)
    if ($existingCommand -ne $powershellPath -or -not $managedRunner) {
      throw "LOCAL_SCHEDULER_TASK_NAME_CONFLICT:$slotTaskName"
    }
  }

  if ($PSCmdlet.ShouldProcess($slotTaskName, "Register $($slot.time) Asia/Seoul provider planning task")) {
    & schtasks.exe /Create /TN $slotTaskName /SC DAILY /ST $slot.time /TR $taskCommand /F | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "LOCAL_SCHEDULER_TASK_REGISTRATION_FAILED:$slotTaskName"
    }
  }
}

if ($StartNow -and $PSCmdlet.ShouldProcess($TaskName, "Start morning provider planning task now")) {
  & schtasks.exe /Run /TN $TaskName | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "LOCAL_SCHEDULER_TASK_START_FAILED"
  }
}

[pscustomobject]@{
  task_name = $TaskName
  tasks = @($slots | ForEach-Object {
    [pscustomobject]@{
      task_name = $TaskName + $_.suffix
      slot_id = $_.id
      local_time = $_.time
      timezone = "Asia/Seoul"
    }
  })
  runtime_link = $runtimeLinkPath
  runner = $runnerPath
  start_now = [bool]$StartNow
  overlap_guard = "scheduler_global_lock"
  provider_mode = if ($EnableLiveSearch) { "approved_live_search" } else { "readiness_and_keyword_plan_only" }
  credential_env_pointer = if ($EnableLiveSearch) { $envPathPointer } else { $null }
  external_api_called = $false
  publish_attempted = $false
  SAFE_TO_UPLOAD = $false
  SAFE_TO_PUBLIC_UPLOAD = $false
}
