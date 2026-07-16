[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory = $true)]
    [string]$WorkerRoot,

    [Parameter(Mandatory = $true)]
    [string]$PythonExe,

    [Parameter(Mandatory = $true)]
    [string]$RuntimeDir,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^https://')]
    [string]$WebAppBaseUrl,

    [string[]]$EnvFile = @(),

    [string]$TaskName = "Minz-Commerce-Automation-Worker",

    [ValidateRange(1, 60)]
    [int]$RecoveryIntervalMinutes = 1,

    [ValidateRange(1, 3650)]
    [int]$RecoveryDurationDays = 3650,

    [ValidateRange(1, 255)]
    [int]$RestartCount = 3,

    [switch]$StartNow
)

$ErrorActionPreference = "Stop"

function Resolve-ExistingPath([string]$Path, [string]$Label) {
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "$Label does not exist."
    }
    return (Resolve-Path -LiteralPath $Path).Path
}

function Quote-TaskArgument([string]$Value) {
    return '"' + ($Value -replace '(\\*)"', '$1$1\"' -replace '(\\+)$', '$1$1') + '"'
}

$resolvedWorkerRoot = Resolve-ExistingPath $WorkerRoot "WorkerRoot"
$resolvedPythonExe = Resolve-ExistingPath $PythonExe "PythonExe"
$resolvedRuntimeDir = [IO.Path]::GetFullPath($RuntimeDir)
$repoLauncher = Join-Path $PSScriptRoot "run_windows_persistent_worker.py"
$resolvedRepoLauncher = Resolve-ExistingPath $repoLauncher "Worker launcher"
$resolvedEnvFiles = @($EnvFile | ForEach-Object { Resolve-ExistingPath $_ "EnvFile" })

New-Item -ItemType Directory -Path $resolvedRuntimeDir -Force | Out-Null
$packageDir = Join-Path $resolvedRuntimeDir "package"
New-Item -ItemType Directory -Path $packageDir -Force | Out-Null
$installedLauncher = Join-Path $packageDir "run_windows_persistent_worker.py"
Copy-Item -LiteralPath $resolvedRepoLauncher -Destination $installedLauncher -Force

$arguments = @(
    (Quote-TaskArgument $installedLauncher),
    "--worker-root", (Quote-TaskArgument $resolvedWorkerRoot),
    "--runtime-dir", (Quote-TaskArgument $resolvedRuntimeDir),
    "--web-app-base-url", (Quote-TaskArgument ($WebAppBaseUrl.TrimEnd('/')))
)
foreach ($path in $resolvedEnvFiles) {
    $arguments += @("--env-file", (Quote-TaskArgument $path))
}

$action = New-ScheduledTaskAction -Execute $resolvedPythonExe -Argument ($arguments -join " ") -WorkingDirectory $resolvedWorkerRoot
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$recoveryInterval = New-TimeSpan -Minutes $RecoveryIntervalMinutes
$recoveryDuration = New-TimeSpan -Days $RecoveryDurationDays
$recoveryTrigger = New-ScheduledTaskTrigger `
    -Once `
    -At ((Get-Date).Add($recoveryInterval)) `
    -RepetitionInterval $recoveryInterval `
    -RepetitionDuration $recoveryDuration
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -Hidden `
    -MultipleInstances IgnoreNew `
    -RestartCount $RestartCount `
    -RestartInterval $recoveryInterval `
    -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal `
    -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) `
    -LogonType Interactive `
    -RunLevel Limited

if ($PSCmdlet.ShouldProcess($TaskName, "Register current-user worker auto-start task")) {
    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $action `
        -Trigger @($logonTrigger, $recoveryTrigger) `
        -Settings $settings `
        -Principal $principal `
        -Description "Persistent commerce-automation Worker; secrets stay in local env files." `
        -Force | Out-Null
    if ($StartNow) {
        Start-ScheduledTask -TaskName $TaskName
    }
}

[pscustomobject]@{
    TaskName = $TaskName
    Registered = [bool](Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)
    StartedNow = [bool]$StartNow
    WorkerRoot = $resolvedWorkerRoot
    RuntimeDir = $resolvedRuntimeDir
    EnvFileCount = $resolvedEnvFiles.Count
    RecoveryIntervalMinutes = $RecoveryIntervalMinutes
    RecoveryDurationDays = $RecoveryDurationDays
    RestartCount = $RestartCount
    SecretsPrinted = $false
}
