param(
    [Parameter(Mandatory = $true)][string]$WorktreeRoot,
    [string]$EnvFile = "C:\Users\LOVE\MyProjects\commerce-automation\.env.local"
)
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath (Resolve-Path -LiteralPath $WorktreeRoot).Path
if (-not (Test-Path -LiteralPath $EnvFile)) { throw "QUEUE_SCHEDULER_ENV_FILE_MISSING" }
foreach ($line in Get-Content -LiteralPath $EnvFile -Encoding utf8) {
    if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
    $parts = $line -split '=', 2
    $name = $parts[0].Trim()
    $value = $parts[1].Trim().Trim('"').Trim("'")
    if ($name -match '^[A-Z][A-Z0-9_]+$') { [Environment]::SetEnvironmentVariable($name, $value, 'Process') }
}
$voiceRoot = "C:\Users\LOVE\.local\commerce-automation-voice"
if ([string]::IsNullOrWhiteSpace($env:VIDEO_AUTOMATION_ASSET_ROOT)) {
    $env:VIDEO_AUTOMATION_ASSET_ROOT = $resolvedWorktree
}
$env:VIDEO_AUTOMATION_PYTHON = "C:\Users\LOVE\.local\minz-video-lab-whisperx\Scripts\python.exe"
$env:VIDEO_AUTOMATION_TTS_COMMAND = Join-Path $voiceRoot "scripts\melotts_wrapper.cmd"
$env:VIDEO_AUTOMATION_ASR_PYTHON = $env:VIDEO_AUTOMATION_PYTHON
$env:VIDEO_AUTOMATION_ASR_SCRIPT = Join-Path $voiceRoot "scripts\faster_whisper_wrapper.py"
$env:VIDEO_AUTOMATION_ASR_MODEL = Join-Path $voiceRoot "models\faster-whisper-small"
$env:VIDEO_AUTOMATION_HF_HOME = Join-Path $voiceRoot "hf-cache"
$env:MELOTTS_SPEED = "1.2"
$env:QUEUE_SCHEDULER_ENABLED = "true"
$env:SAFE_TO_UPLOAD = "false"
$env:SAFE_TO_PUBLIC_UPLOAD = "false"
$env:YOUTUBE_AUTO_UPLOAD = "false"
$env:PUBLIC_UPLOAD = "false"
$env:UNLISTED_UPLOAD = "false"
$env:TIKTOK_AUTO_UPLOAD = "false"
$env:THREADS_AUTO_POST = "false"
$env:COMMENT_AUTOMATION = "false"
