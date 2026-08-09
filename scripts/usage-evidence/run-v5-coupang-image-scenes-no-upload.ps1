[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("prepare", "compose", "finalize")]
    [string]$Phase,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$WorktreeRoot,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$EnvFile,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$Queue,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$Reserve,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$BaselineRegistry,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$OutputRoot,

    [Parameter(Mandatory = $false)]
    [string]$ReviewFile = ""
)

$ErrorActionPreference = "Stop"
$safetyFlags = [ordered]@{
    QUEUE_SCHEDULER_ENABLED = "false"
    SAFE_TO_UPLOAD = "false"
    SAFE_TO_PUBLIC_UPLOAD = "false"
    YOUTUBE_AUTO_UPLOAD = "false"
    PUBLIC_UPLOAD = "false"
    UNLISTED_UPLOAD = "false"
    TIKTOK_AUTO_UPLOAD = "false"
    THREADS_AUTO_POST = "false"
    COMMENT_AUTOMATION = "false"
    GOOGLE_SHEETS_WRITE = "0"
    GOOGLE_DRIVE_WRITE = "0"
    DRIVE_WRITE = "0"
    R2_WRITE = "0"
    DB_WRITE = "0"
    PRODUCTION_DB_WRITE = "0"
    SUPABASE_WRITE = "0"
    FINAL_PRODUCT_VIDEO_RENDER_COUNT = "0"
    TTS_EXECUTION_COUNT = "0"
    ASR_EXECUTION_COUNT = "0"
    WHISPERX_EXECUTION_COUNT = "0"
    PLATFORM_UPLOAD = "0"
    PRODUCTION_DEPLOY = "0"
}
$previousValues = @{}
$exitCode = 1
$locationPushed = $false

try {
    foreach ($key in $safetyFlags.Keys) {
        $previousValues[$key] = [Environment]::GetEnvironmentVariable($key, "Process")
        [Environment]::SetEnvironmentVariable($key, $safetyFlags[$key], "Process")
    }
    Push-Location -LiteralPath $WorktreeRoot
    $locationPushed = $true
    $arguments = @(
        "tsx",
        "scripts/usage-evidence/run-v5-coupang-image-scenes.ts",
        "--phase", $Phase,
        "--worktree-root", $WorktreeRoot,
        "--env-file", $EnvFile,
        "--queue", $Queue,
        "--reserve", $Reserve,
        "--baseline-registry", $BaselineRegistry,
        "--output-root", $OutputRoot
    )
    if ($ReviewFile) { $arguments += @("--review-file", $ReviewFile) }
    & npx.cmd @arguments
    $exitCode = $LASTEXITCODE
}
finally {
    if ($locationPushed) { Pop-Location }
    foreach ($key in $safetyFlags.Keys) {
        [Environment]::SetEnvironmentVariable($key, $previousValues[$key], "Process")
    }
}

exit $exitCode
