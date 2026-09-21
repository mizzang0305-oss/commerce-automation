function ConvertTo-CanonicalPrincipalSid {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Sid,
        [string]$FailureCode = 'PRINCIPAL_IDENTITY_SID_INVALID'
    )

    $candidate = $Sid.Trim()
    if ([string]::IsNullOrWhiteSpace($candidate)) { throw $FailureCode }
    try {
        return ([Security.Principal.SecurityIdentifier]::new($candidate)).Value
    } catch {
        throw $FailureCode
    }
}

function Resolve-PrincipalSecurityIdentifier {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Identity,
        [Parameter(Mandatory = $true)][string]$ExpectedSid,
        [scriptblock]$AccountTranslator
    )

    $candidate = $Identity.Trim()
    if ([string]::IsNullOrWhiteSpace($candidate)) { throw 'PRINCIPAL_IDENTITY_EMPTY' }
    $expectedCanonical = ConvertTo-CanonicalPrincipalSid -Sid $ExpectedSid -FailureCode 'PRINCIPAL_IDENTITY_EXPECTED_SID_INVALID'

    try {
        return ([Security.Principal.SecurityIdentifier]::new($candidate)).Value
    } catch {
        if ($candidate -match '^(?i)S-\d') { throw 'PRINCIPAL_IDENTITY_SID_INVALID' }
    }

    $accountCandidates = [Collections.Generic.List[string]]::new()
    $accountCandidates.Add($candidate)
    if ($candidate -notmatch '[\\@]') {
        $machine = [Environment]::MachineName
        if (-not [string]::IsNullOrWhiteSpace($machine)) { $accountCandidates.Add("$machine\$candidate") }
    }

    $resolved = [Collections.Generic.List[string]]::new()
    foreach ($account in @($accountCandidates | Select-Object -Unique)) {
        try {
            $translated = if ($null -ne $AccountTranslator) {
                & $AccountTranslator $account
            } else {
                ([Security.Principal.NTAccount]::new($account)).Translate([Security.Principal.SecurityIdentifier]).Value
            }
            $canonical = ConvertTo-CanonicalPrincipalSid -Sid ([string]$translated)
            if (-not $resolved.Contains($canonical)) { $resolved.Add($canonical) }
        } catch {
            continue
        }
    }

    if ($resolved.Count -eq 0) { throw 'PRINCIPAL_IDENTITY_UNRESOLVABLE' }
    if ($resolved.Count -gt 1) { throw 'PRINCIPAL_IDENTITY_AMBIGUOUS' }
    return $resolved[0]
}

function Assert-PrincipalSecurityIdentifier {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$ExpectedSid,
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$ReadbackIdentity,
        [scriptblock]$AccountTranslator
    )

    $expectedCanonical = ConvertTo-CanonicalPrincipalSid -Sid $ExpectedSid -FailureCode 'PRINCIPAL_IDENTITY_EXPECTED_SID_INVALID'
    $readbackCanonical = Resolve-PrincipalSecurityIdentifier -Identity $ReadbackIdentity -ExpectedSid $expectedCanonical -AccountTranslator $AccountTranslator
    if ($readbackCanonical -ne $expectedCanonical) { throw 'PRINCIPAL_IDENTITY_MISMATCH' }
    return $true
}
