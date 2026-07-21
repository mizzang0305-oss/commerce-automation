[CmdletBinding()]
param(
  [string]$InputPath = "data\commerce-poc\activepieces-input.jsonl",
  [string]$AllowedHost = "shop.example",
  [ValidateSet("activepieces", "windmill")]
  [string]$Target = "activepieces"
)

$ErrorActionPreference = "Stop"
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$allowedDataRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot "data\commerce-poc"))
$resolvedInput = if ([System.IO.Path]::IsPathRooted($InputPath)) {
  [System.IO.Path]::GetFullPath($InputPath)
} else {
  [System.IO.Path]::GetFullPath((Join-Path $repoRoot $InputPath))
}

$allowedPrefix = $allowedDataRoot.TrimEnd('\') + '\'
if (-not $resolvedInput.StartsWith($allowedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "LOCAL_SCHEDULER_INPUT_OUTSIDE_COMMERCE_DATA"
}
if (-not (Test-Path -LiteralPath $resolvedInput -PathType Leaf)) {
  throw "LOCAL_SCHEDULER_INPUT_NOT_FOUND"
}

$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
$logDir = Join-Path $allowedDataRoot "task-logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$logPath = Join-Path $logDir "local-scheduler-utf8.log"
$relativeInput = $resolvedInput.Substring($repoRoot.TrimEnd('\').Length).TrimStart('\')

Push-Location $repoRoot
try {
  $startedAt = (Get-Date).ToString("o")
  $commandOutput = @(& $npm run automation:commerce-poc:schedule -- "--input=$relativeInput" "--allowed-host=$AllowedHost" "--target=$Target" 2>&1 |
    ForEach-Object { [string]$_ })
  $exitCode = $LASTEXITCODE
  $logLines = @("started_at=" + $startedAt) + $commandOutput + @("exit_code=" + $exitCode)
  $utf8 = New-Object System.Text.UTF8Encoding($false)
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
