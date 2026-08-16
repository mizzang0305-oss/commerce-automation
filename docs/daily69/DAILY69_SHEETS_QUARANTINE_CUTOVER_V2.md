# Daily69 Sheets Quarantine Cutover V2

## Decision

The local evidence for `operation-2026-08-11` remains canonical and immutable. Its contaminated Google Sheets projection is not repaired, reconstructed, deleted, or used as authoritative history.

`operation-2026-08-17` is recorded as a held attempt whose Sheet projection is `quarantined_legacy_projection`. The fresh namespace is `operation-2026-08-17-attempt-2`, with logical `operationDate=2026-08-17` and `attemptNumber=2`.

## Fail-closed cutover

1. Create attempt-2 locally with no pointer promotion.
2. Run local/source preflight.
3. Capture `pre-cutover-sheet-baseline.json`. It stores row numbers, bounded identifiers, row hashes, and an aggregate hash; raw workbook values and credential identifiers are not stored.
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
