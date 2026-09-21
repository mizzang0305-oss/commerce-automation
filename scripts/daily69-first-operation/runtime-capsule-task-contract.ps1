# This library never launches Codex, reads credentials, or changes Task state.
# The TypeScript verifier owns cryptographic and approved-root validation.
function Get-Daily69TaskCapsuleBinding {
    param([Parameter(Mandatory = $true)][object]$Manifest)
    $runtime = $Manifest.codexReviewRuntime
    $capsule = $runtime.capsule
    if ([string]$runtime.schemaVersion -cne 'daily69-codex-cli-runtime-v2' -or [string]$capsule.schemaVersion -cne 'daily69-codex-runtime-capsule-v1') { throw 'CODEX_CAPSULE_TASK_BINDING_REQUIRED' }
    $path = [string]$capsule.canonicalPath
    if ([string]::IsNullOrWhiteSpace($path) -or $path -match '[\x00-\x1f"\x7f]' -or -not [IO.Path]::IsPathRooted($path)) { throw 'CODEX_CAPSULE_TASK_BINDING_INVALID' }
    foreach ($value in @($capsule.manifestSha256, $capsule.bundleDigest, $capsule.binarySha256)) {
        if ([string]$value -cnotmatch '^[a-f0-9]{64}$') { throw 'CODEX_CAPSULE_TASK_BINDING_INVALID' }
    }
    if ([string]$runtime.command -cne (Join-Path $path 'codex.exe') -or [string]$runtime.commandSha256 -cne [string]$capsule.binarySha256) { throw 'CODEX_CAPSULE_TASK_BINDING_MISMATCH' }
    return [pscustomobject]@{
        canonicalPath = $path
        manifestSha256 = [string]$capsule.manifestSha256
        bundleDigest = [string]$capsule.bundleDigest
        binarySha256 = [string]$capsule.binarySha256
    }
}

function Get-Daily69CapsuleTaskArguments {
    param([Parameter(Mandatory = $true)][object]$Binding)
    # These values have already been read from and compared with the operation
    # manifest. Reject command-line metacharacters instead of escaping them.
    if ([string]$Binding.canonicalPath -match '[\x00-\x1f"\x7f]' -or [string]::IsNullOrWhiteSpace([string]$Binding.canonicalPath)) { throw 'CODEX_CAPSULE_TASK_BINDING_INVALID' }
    foreach ($value in @($Binding.manifestSha256, $Binding.bundleDigest, $Binding.binarySha256)) {
        if ([string]$value -cnotmatch '^[a-f0-9]{64}$') { throw 'CODEX_CAPSULE_TASK_BINDING_INVALID' }
    }
    return '-CodexRuntimeCapsulePath "' + $Binding.canonicalPath + '" -CodexRuntimeCapsuleManifestSha256 "' + $Binding.manifestSha256 + '" -CodexRuntimeCapsuleBundleDigest "' + $Binding.bundleDigest + '" -CodexRuntimeBinarySha256 "' + $Binding.binarySha256 + '"'
}

function Invoke-Daily69CapsuleVerifierProcess {
    param([string]$WorktreeRoot, [string[]]$VerifierArguments)
    try { $node = @(Get-Command node.exe -CommandType Application -ErrorAction Stop)[0].Source }
    catch { throw 'CODEX_CAPSULE_TASK_VERIFICATION_FAILED' }
    $verifier = Join-Path $WorktreeRoot 'scripts\daily69-first-operation\verify-runtime-capsule.ts'
    $arguments = @('--conditions=react-server', '--import', 'tsx', $verifier) + $VerifierArguments
    $savedPreference = $ErrorActionPreference
    Push-Location $WorktreeRoot
    try {
        # Capture structured stderr as data on Windows PowerShell 5.1. Never
        # forward raw child output or turn a native error into implicit success.
        $ErrorActionPreference = 'Continue'
        $lines = @(& $node @arguments 2>&1)
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $savedPreference
        Pop-Location
    }
    return [pscustomobject]@{ exitCode = $exitCode; lines = $lines }
}

function Assert-Daily69TaskCapsule {
    param(
        [Parameter(Mandatory = $true)][string]$WorktreeRoot,
        [Parameter(Mandatory = $true)][string]$QueueRoot,
        [Parameter(Mandatory = $true)][string]$Namespace,
        [Parameter(Mandatory = $true)][string]$CodexRuntimeCapsulePath,
        [Parameter(Mandatory = $true)][string]$CodexRuntimeCapsuleManifestSha256,
        [Parameter(Mandatory = $true)][string]$CodexRuntimeCapsuleBundleDigest,
        [Parameter(Mandatory = $true)][string]$CodexRuntimeBinarySha256
    )
    $manifest = Get-Content -LiteralPath (Join-Path $QueueRoot 'operation-manifest.json') -Raw -Encoding utf8 | ConvertFrom-Json -ErrorAction Stop
    if ([string]$manifest.namespace -cne $Namespace) { throw 'CODEX_CAPSULE_TASK_NAMESPACE_MISMATCH' }
    $binding = Get-Daily69TaskCapsuleBinding -Manifest $manifest
    if ($binding.canonicalPath -cne $CodexRuntimeCapsulePath -or $binding.manifestSha256 -cne $CodexRuntimeCapsuleManifestSha256 -or $binding.bundleDigest -cne $CodexRuntimeCapsuleBundleDigest -or $binding.binarySha256 -cne $CodexRuntimeBinarySha256) { throw 'CODEX_CAPSULE_TASK_BINDING_MISMATCH' }
    $arguments = @('--operation-root', $QueueRoot, '--namespace', $Namespace, '--capsule-path', $CodexRuntimeCapsulePath, '--manifest-sha256', $CodexRuntimeCapsuleManifestSha256, '--bundle-digest', $CodexRuntimeCapsuleBundleDigest, '--binary-sha256', $CodexRuntimeBinarySha256)
    $capture = Invoke-Daily69CapsuleVerifierProcess -WorktreeRoot $WorktreeRoot -VerifierArguments $arguments
    $lines = @($capture.lines | ForEach-Object { [string]$_ } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    $record = $null
    if ($lines.Count -eq 1) {
        try { $record = $lines[0] | ConvertFrom-Json -ErrorAction Stop } catch { }
    }
    if ($capture.exitCode -ne 0) {
        $code = [string]$record.safeError
        if ($code -cmatch '^CODEX_CAPSULE_[A-Z0-9_]{1,120}$') { throw $code }
        throw 'CODEX_CAPSULE_TASK_VERIFICATION_FAILED'
    }
    if ($null -eq $record -or [string]$record.event -cne 'daily69_runtime_capsule_verified' -or $record.verified -isnot [bool] -or $record.verified -ne $true) { throw 'CODEX_CAPSULE_TASK_VERIFICATION_FAILED' }
    return $binding
}
