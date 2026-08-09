[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$WorktreeRoot,
    [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$OutputRoot
)
$ErrorActionPreference = "Stop"
$safetyFlags = [ordered]@{
    QUEUE_SCHEDULER_ENABLED = "false"; SAFE_TO_UPLOAD = "false"; SAFE_TO_PUBLIC_UPLOAD = "false"
    YOUTUBE_AUTO_UPLOAD = "false"; PUBLIC_UPLOAD = "false"; UNLISTED_UPLOAD = "false"
    TIKTOK_AUTO_UPLOAD = "false"; THREADS_AUTO_POST = "false"; COMMENT_AUTOMATION = "false"
    GOOGLE_SHEETS_WRITE = "0"; GOOGLE_DRIVE_WRITE = "0"; DRIVE_WRITE = "0"; R2_WRITE = "0"
    DB_WRITE = "0"; PRODUCTION_DB_WRITE = "0"; SUPABASE_WRITE = "0"
    FINAL_VIDEO_RENDER_COUNT = "0"; TTS_EXECUTION_COUNT = "0"; ASR_EXECUTION_COUNT = "0"; WHISPERX_EXECUTION_COUNT = "0"
    PLATFORM_UPLOAD = "0"; PRODUCTION_DEPLOY = "0"
}
$previousValues = @{}; $locationPushed = $false; $exitCode = 1
try {
    foreach ($key in $safetyFlags.Keys) { $previousValues[$key] = [Environment]::GetEnvironmentVariable($key, "Process"); [Environment]::SetEnvironmentVariable($key, $safetyFlags[$key], "Process") }
    Push-Location -LiteralPath $WorktreeRoot; $locationPushed = $true
    & npx.cmd tsx scripts/usage-evidence/run-v5-slot069-proof-only.ts --worktree-root $WorktreeRoot --output-root $OutputRoot
    $exitCode = $LASTEXITCODE
}
finally {
    if ($locationPushed) { Pop-Location }
    foreach ($key in $safetyFlags.Keys) { [Environment]::SetEnvironmentVariable($key, $previousValues[$key], "Process") }
}
exit $exitCode
