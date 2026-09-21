[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$WorktreeRoot,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$EnvFile,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$BaselineRegistry,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$CandidateRegistry,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$OutputRoot,

    [Parameter(Mandatory = $false)]
    [ValidateRange(0, 60)]
    [int]$PriorProviderCalls = 0
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
    & npx.cmd tsx scripts/usage-evidence/run-v3-live-capacity-proof.ts `
        --worktree-root $WorktreeRoot `
        --env-file $EnvFile `
        --baseline-registry $BaselineRegistry `
        --candidate-registry $CandidateRegistry `
        --output-root $OutputRoot `
        --prior-provider-calls $PriorProviderCalls
    $exitCode = $LASTEXITCODE
}
finally {
    if ($locationPushed) {
        Pop-Location
    }
    foreach ($key in $safetyFlags.Keys) {
        [Environment]::SetEnvironmentVariable($key, $previousValues[$key], "Process")
    }
}

exit $exitCode
