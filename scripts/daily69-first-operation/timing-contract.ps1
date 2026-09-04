function Get-Daily69Timing {
    param([Parameter(Mandatory = $true)][string]$OperationDate)
    $path = Join-Path $PSScriptRoot '..\..\src\lib\daily69-first-operation\timing-contract.json'
    $contract = Get-Content -LiteralPath $path -Raw -Encoding utf8 | ConvertFrom-Json
    $start = [DateTime]::MinValue
    if (-not [DateTime]::TryParseExact($OperationDate, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::None, [ref]$start)) { throw 'FIRST_OPERATION_TIMING_DATE_INVALID' }
    if ($contract.schemaVersion -ne 'daily69-task-timing-v1') { throw 'FIRST_OPERATION_TIMING_CONTRACT_INVALID' }
    foreach ($name in @('lastBatchTriggerMinute', 'batchExecutionLimitMinutes', 'postBatchSafetyMarginMinutes', 'closeoutExecutionLimitMinutes', 'postCloseoutSafetyMarginMinutes', 'finalizerExecutionLimitMinutes', 'roundingMinutes', 'idleGraceSeconds', 'idlePollSeconds')) {
        $value = $contract.$name
        if ($null -eq $value -or $value -is [string] -or [double]$value -le 0 -or [Math]::Floor([double]$value) -ne [double]$value) { throw 'FIRST_OPERATION_TIMING_CONTRACT_INVALID' }
    }
    if ($contract.lastBatchTriggerMinute -ne 1380 -or $contract.batchExecutionLimitMinutes -ne 55 -or $contract.closeoutExecutionLimitMinutes -ne 30 -or $contract.postBatchSafetyMarginMinutes -lt 15 -or $contract.postCloseoutSafetyMarginMinutes -lt 15 -or $contract.roundingMinutes -gt 15 -or $contract.idleGraceSeconds -gt 900 -or $contract.idlePollSeconds -gt 30 -or $contract.idlePollSeconds -gt $contract.idleGraceSeconds -or $contract.idleGraceSeconds -ge $contract.closeoutExecutionLimitMinutes * 60) { throw 'FIRST_OPERATION_TIMING_CONTRACT_INVALID' }
    $batchDeadline = [double]$contract.lastBatchTriggerMinute + $contract.batchExecutionLimitMinutes
    $closeout = ([Math]::Floor(($batchDeadline + $contract.postBatchSafetyMarginMinutes) / $contract.roundingMinutes) + 1) * $contract.roundingMinutes
    $closeoutDeadline = $closeout + $contract.closeoutExecutionLimitMinutes
    $finalizer = ([Math]::Floor(($closeoutDeadline + $contract.postCloseoutSafetyMarginMinutes) / $contract.roundingMinutes) + 1) * $contract.roundingMinutes
    return [pscustomobject]@{ contract = $contract; lastBatchAt = $start.AddMinutes($contract.lastBatchTriggerMinute); batchDeadline = $start.AddMinutes($batchDeadline); closeoutAt = $start.AddMinutes($closeout); closeoutDeadline = $start.AddMinutes($closeoutDeadline); finalizerAt = $start.AddMinutes($finalizer); finalizerDeadline = $start.AddMinutes($finalizer + $contract.finalizerExecutionLimitMinutes) }
}
