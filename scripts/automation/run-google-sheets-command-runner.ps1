param(
  [switch]$Once
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$runner = Join-Path $repoRoot "scripts\automation\google-sheets-command-runner.ts"
$arguments = @("--conditions=react-server", "--import", "tsx", $runner)
if ($Once) { $arguments += "--once" }

Push-Location $repoRoot
try {
  & node @arguments
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
