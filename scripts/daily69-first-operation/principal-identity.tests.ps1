[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'principal-identity.ps1')

$expected = 'S-1-5-21-1111111111-2222222222-3333333333-1001'
$other = 'S-1-5-21-1111111111-2222222222-3333333333-1002'
$machine = [Environment]::MachineName
$map = @{
    'LOVE' = $expected
    "$machine\LOVE" = $expected
    'OTHER' = $other
    "$machine\OTHER" = $other
    'SYSTEM' = 'S-1-5-18'
    "$machine\SYSTEM" = 'S-1-5-18'
    'Guest' = 'S-1-5-21-1111111111-2222222222-3333333333-501'
    "$machine\Guest" = 'S-1-5-21-1111111111-2222222222-3333333333-501'
    'Administrators' = 'S-1-5-32-544'
    "$machine\Administrators" = 'S-1-5-32-544'
    'AMBIGUOUS_ACCOUNT' = $expected
    "$machine\AMBIGUOUS_ACCOUNT" = $other
}
$translator = {
    param([string]$Account)
    if (-not $map.ContainsKey($Account)) { throw 'LOOKUP_FAILED' }
    return $map[$Account]
}
$passed = 0

function Expect-Pass([string]$Name, [scriptblock]$Action) {
    & $Action | Out-Null
    $script:passed += 1
}

function Expect-Fail([string]$Name, [scriptblock]$Action) {
    $failed = $false
    try { & $Action | Out-Null } catch { $failed = $true }
    if (-not $failed) { throw "EXPECTED_FAIL_NOT_OBSERVED:$Name" }
    $script:passed += 1
}

Expect-Pass 'raw SID exact' { Assert-PrincipalSecurityIdentifier -ExpectedSid $expected -ReadbackIdentity $expected }
Expect-Pass 'equivalent bare account' { Assert-PrincipalSecurityIdentifier -ExpectedSid $expected -ReadbackIdentity 'LOVE' -AccountTranslator $translator }
Expect-Pass 'equivalent qualified account' { Assert-PrincipalSecurityIdentifier -ExpectedSid $expected -ReadbackIdentity "$machine\LOVE" -AccountTranslator $translator }
Expect-Fail 'different raw SID' { Assert-PrincipalSecurityIdentifier -ExpectedSid $expected -ReadbackIdentity $other }
Expect-Fail 'different account' { Assert-PrincipalSecurityIdentifier -ExpectedSid $expected -ReadbackIdentity 'OTHER' -AccountTranslator $translator }
Expect-Fail 'SYSTEM' { Assert-PrincipalSecurityIdentifier -ExpectedSid $expected -ReadbackIdentity 'SYSTEM' -AccountTranslator $translator }
Expect-Fail 'Guest' { Assert-PrincipalSecurityIdentifier -ExpectedSid $expected -ReadbackIdentity 'Guest' -AccountTranslator $translator }
Expect-Fail 'Administrators group' { Assert-PrincipalSecurityIdentifier -ExpectedSid $expected -ReadbackIdentity 'Administrators' -AccountTranslator $translator }
Expect-Fail 'malformed SID' { Assert-PrincipalSecurityIdentifier -ExpectedSid $expected -ReadbackIdentity 'S-1-BOGUS' -AccountTranslator $translator }
Expect-Fail 'unknown account' { Assert-PrincipalSecurityIdentifier -ExpectedSid $expected -ReadbackIdentity 'UNKNOWN_ACCOUNT' -AccountTranslator $translator }
Expect-Fail 'empty identity' { Assert-PrincipalSecurityIdentifier -ExpectedSid $expected -ReadbackIdentity '' -AccountTranslator $translator }
Expect-Fail 'translation error' { Assert-PrincipalSecurityIdentifier -ExpectedSid $expected -ReadbackIdentity 'TRANSLATION_ERROR' -AccountTranslator { throw 'LOOKUP_FAILED' } }
Expect-Fail 'ambiguous bare account' { Assert-PrincipalSecurityIdentifier -ExpectedSid $expected -ReadbackIdentity 'AMBIGUOUS_ACCOUNT' -AccountTranslator $translator }

[pscustomobject]@{
    event = 'daily69_principal_identity_tests'
    passed = $passed
    failed = 0
    suffixMatching = $false
    unresolvedAccepted = $false
} | ConvertTo-Json -Compress
