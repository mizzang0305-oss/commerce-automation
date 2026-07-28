param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("morning_commute", "lunch_break", "evening_commute", "before_bed")]
  [string]$SlotId
)

$ErrorActionPreference = "Stop"
$apiBaseUrl = [Environment]::GetEnvironmentVariable("COMMERCE_WEB_APP_BASE_URL", "Process")
$apiSecret = [Environment]::GetEnvironmentVariable("SCHEDULED_PRIVATE_PILOT_API_SECRET", "Process")
if ([string]::IsNullOrWhiteSpace($apiBaseUrl) -or [string]::IsNullOrWhiteSpace($apiSecret)) {
  throw "Scheduled private pilot API configuration is missing."
}

$lockRoot = Join-Path ([System.IO.Path]::GetTempPath()) "commerce-automation-scheduled-pilot"
[System.IO.Directory]::CreateDirectory($lockRoot) | Out-Null
$lockPath = Join-Path $lockRoot "scheduled-private-pilot.lock"
$staleAfter = [TimeSpan]::FromMinutes(45)

if ([System.IO.File]::Exists($lockPath)) {
  $age = [DateTimeOffset]::UtcNow - [System.IO.File]::GetLastWriteTimeUtc($lockPath)
  if ($age -gt $staleAfter) {
    Remove-Item -LiteralPath $lockPath -Force
  }
}

$lockStream = $null
$lockAcquired = $false
try {
  try {
    $lockStream = [System.IO.File]::Open(
      $lockPath,
      [System.IO.FileMode]::CreateNew,
      [System.IO.FileAccess]::Write,
      [System.IO.FileShare]::None
    )
    $lockAcquired = $true
  } catch [System.IO.IOException] {
    Write-Output '{"ok":false,"blocker":"SCHEDULER_OVERLAP_LOCKED","external_api_called":false}'
    exit 0
  }

  $writer = [System.IO.StreamWriter]::new($lockStream, [System.Text.UTF8Encoding]::new($false))
  $writer.Write([DateTimeOffset]::UtcNow.ToString("O"))
  $writer.Flush()

  $headers = @{ Authorization = "Bearer $apiSecret" }
  $body = @{ slot_id = $SlotId } | ConvertTo-Json -Compress
  $response = Invoke-RestMethod `
    -Method Post `
    -Uri ($apiBaseUrl.TrimEnd("/") + "/api/automation/scheduled-private-pilot") `
    -Headers $headers `
    -ContentType "application/json" `
    -Body $body
  $response | ConvertTo-Json -Compress -Depth 5
} finally {
  if ($null -ne $lockStream) {
    $lockStream.Dispose()
  }
  if ($lockAcquired -and [System.IO.File]::Exists($lockPath)) {
    Remove-Item -LiteralPath $lockPath -Force
  }
}
