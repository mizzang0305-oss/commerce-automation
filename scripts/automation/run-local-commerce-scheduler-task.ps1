[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("morning_commute", "lunch_break", "evening_commute", "before_bed")]
  [string]$SlotId,
  [switch]$EnableLiveSearch
)

$ErrorActionPreference = "Stop"
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = $utf8
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$allowedDataRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot "data\commerce-poc"))
$envPathPointer = $repoRoot + ".env-path"
if ($EnableLiveSearch) {
  if (-not (Test-Path -LiteralPath $envPathPointer -PathType Leaf)) {
    throw "LOCAL_SCHEDULER_CREDENTIAL_ENV_POINTER_MISSING"
  }
  $credentialEnvPath = [System.IO.Path]::GetFullPath((Get-Content -LiteralPath $envPathPointer -Raw).Trim())
  if (-not (Test-Path -LiteralPath $credentialEnvPath -PathType Leaf)) {
    throw "LOCAL_SCHEDULER_CREDENTIAL_ENV_FILE_MISSING"
  }
  $allowedCredentialKeys = @(
    "COUPANG_PARTNERS_PROVIDER_ENABLED",
    "COUPANG_PARTNERS_ACCESS_KEY",
    "COUPANG_ACCESS_KEY",
    "COUPANG_PARTNERS_SECRET_KEY",
    "COUPANG_SECRET_KEY",
    "COUPANG_CUSTOMER_ID",
    "COUPANG_PARTNER_ID",
    "COUPANG_PARTNERS_CUSTOMER_ID",
    "COUPANG_PARTNERS_BASE_URL"
  )
  foreach ($line in Get-Content -LiteralPath $credentialEnvPath) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
    $index = $trimmed.IndexOf("=")
    if ($index -le 0) { continue }
    $key = $trimmed.Substring(0, $index).Trim()
    $value = $trimmed.Substring($index + 1).Trim().Trim('"').Trim("'")
    if ($key -in $allowedCredentialKeys -and -not [Environment]::GetEnvironmentVariable($key, "Process")) {
      [Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
  }
}
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
$logDir = Join-Path $allowedDataRoot "task-logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$logPath = Join-Path $logDir "local-scheduler-utf8.log"
$stdoutPath = Join-Path $logDir ("provider-plan-" + $SlotId + ".stdout.tmp")
$stderrPath = Join-Path $logDir ("provider-plan-" + $SlotId + ".stderr.tmp")
$draftStdoutPath = Join-Path $logDir ("video-draft-" + $SlotId + ".stdout.tmp")
$draftStderrPath = Join-Path $logDir ("video-draft-" + $SlotId + ".stderr.tmp")
Push-Location $repoRoot
try {
  $startedAt = (Get-Date).ToString("o")
  $providerArguments = @(
    "run",
    "automation:commerce-poc:provider-plan",
    "--",
    "--slot-id=$SlotId"
  )
  if ($EnableLiveSearch) {
    $providerArguments += "--execute-live-search=APPROVE_COUPANG_SCHEDULED_PRODUCT_SEARCH"
  }
  $process = Start-Process -FilePath $npm -ArgumentList @(
    $providerArguments
  ) -WorkingDirectory $repoRoot -Wait -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
  $commandOutput = @(
    @(Get-Content -LiteralPath $stdoutPath -Encoding UTF8 -ErrorAction SilentlyContinue)
    @(Get-Content -LiteralPath $stderrPath -Encoding UTF8 -ErrorAction SilentlyContinue)
  )
  $exitCode = $process.ExitCode
  if ($exitCode -eq 0 -and $EnableLiveSearch) {
    $draftProcess = Start-Process -FilePath $npm -ArgumentList @(
      "run",
      "automation:commerce-poc:render-video-draft",
      "--",
      "--slot-id=$SlotId",
      "--render=APPROVE_SCHEDULED_PRODUCT_VIDEO_DRAFT_RENDER"
    ) -WorkingDirectory $repoRoot -Wait -WindowStyle Hidden -RedirectStandardOutput $draftStdoutPath -RedirectStandardError $draftStderrPath -PassThru
    $commandOutput += @(
      "video_draft_stage=started",
      @(Get-Content -LiteralPath $draftStdoutPath -Encoding UTF8 -ErrorAction SilentlyContinue),
      @(Get-Content -LiteralPath $draftStderrPath -Encoding UTF8 -ErrorAction SilentlyContinue)
    )
    $exitCode = $draftProcess.ExitCode
  }
  $logLines = @(
    "started_at=" + $startedAt,
    "slot_id=" + $SlotId,
    "live_search_enabled=" + [bool]$EnableLiveSearch
  ) + $commandOutput + @("exit_code=" + $exitCode)
  $writer = New-Object System.IO.StreamWriter($logPath, $true, $utf8)
  try {
    foreach ($line in $logLines) {
      $writer.WriteLine($line)
    }
  } finally {
    $writer.Dispose()
  }
  $commandOutput | Write-Output
  exit $exitCode
} finally {
  Pop-Location
}
