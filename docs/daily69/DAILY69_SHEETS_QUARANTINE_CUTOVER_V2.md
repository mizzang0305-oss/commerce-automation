# Daily69 Sheets Quarantine Cutover V2

## Decision

The local evidence for `operation-2026-08-11` remains canonical and immutable. Its contaminated Google Sheets projection is not repaired, reconstructed, deleted, or used as authoritative history.

`operation-2026-08-17` is recorded as a held attempt whose Sheet projection is `quarantined_legacy_projection`; `operation-2026-08-17-attempt-2` is also frozen held evidence. Neither namespace may be reused. A new operation day uses its canonical attempt-1 namespace, such as `operation-2026-08-18` with `attemptNumber=1` and no previous-attempt binding.

## Fail-closed cutover

1. Create attempt-2 locally with no pointer promotion.
2. Run local/source preflight.
3. Capture `pre-cutover-sheet-baseline.json` using schema `daily69-sheets-pre-cutover-baseline-v2` and `fingerprintMode=USER_ENTERED_VALUE`. It stores row numbers, bounded identifiers, semantic row hashes, and an aggregate hash; raw workbook values, formula text, effective/formatted results, and credential identifiers are not stored.
4. Run the cutover plan. Required plan: Queue `0 update / 69 append`, Reserve `0 update / 14 append`, Sync `0 update / 1 append`, and zero header writes.
5. Run the initial projection through `projectAppendOnly()`. Any header write or existing-row update fails with `CUTOVER_WOULD_MUTATE_EXISTING_ROWS`.
6. Re-read preexisting rows and require zero changed, deleted, or reordered rows.
7. Require exactly 69 Queue rows, 14 Reserve rows, one Sync row, and no duplicate tuple identities for attempt-2.
8. Transition the manifest to `projection_verified` only after all checks pass.
9. Verify and register only the three owned no-upload Tasks. Promote `active-operation.json` only after exact Task binding read-back.

## Commands

The runtime environment must be loaded through the existing no-upload PowerShell boundary before these commands.

```text
npm run daily69:first-day:cutover-baseline
npm run daily69:first-day:cutover -- --phase plan
npm run daily69:first-day:cutover -- --phase project
npm run daily69:first-day:cutover -- --phase verify
```

The workflow never starts a batch or closeout manually. It never enables Scout, upload, public upload, comments, Drive media writes, Production DB writes, or external publishing.

## Cell-semantics decision

The V1 baseline used `FORMATTED_VALUE`, so volatile formula results could fail the immutable-row guard even when stored cell content did not change. Queue row 2 contains three formulas, including the volatile `TODAY` and `NOW` categories. Read-only grid-data snapshots kept every user-entered/formula fingerprint stable while the historical formatted row hash changed again without a Sheet write. The primary classification is `SHEETS_ROW_DRIFT_RENDER_ONLY`.

V2 fingerprints only canonical typed user-entered cell state:

- literal strings, numbers, and booleans are type-separated before hashing;
- formulas hash the exact stored formula expression;
- blanks have an explicit canonical representation;
- effective and formatted values are excluded from the immutability gate.

V1 remains readable as historical evidence and is never reinterpreted as V2. Fresh operation baselines use V2. Literal edits, formula text edits, deletion, and prohibited reorder still fail closed; formula recalculation and display formatting do not.
