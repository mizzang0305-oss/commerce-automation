# Daily69 Sheets Namespace Isolation V1

## Decision

The Sheets root cause is confirmed as `DAILY69_SHEETS_ROOT_CAUSE_CONFIRMED_NAMESPACE_BLIND_QUEUE_ID`.
The held `operation-2026-08-17` projection reused all 69 Queue IDs from `operation-2026-08-11`. The former projection identity used Queue ID alone, so 69 historical rows were updated in place across namespace boundaries.

Live restoration and re-arm remain prohibited. The arm evidence retained protection hashes, but it did not retain the exact pre-write values needed to restore every changed cell. The restoration decision is `QUEUE_ROW_RESTORE_SOURCE_INSUFFICIENT`; no guessed reconstruction is allowed.

## Canonical Sheets identities

| Sheet domain | Canonical identity |
| --- | --- |
| Queue | `projectionIdentity(namespace, queueId)` |
| Reserve | `projectionIdentity(namespace, productKeyHash)` |
| Sync | `namespace` |
| Commands | command ID for row identity; active namespace is a mandatory runtime authorization boundary |

`projectionIdentity` encodes a tuple and does not rely on ambiguous string delimiters. Local operation roots may reuse Queue IDs because the root is their boundary; Queue ID alone is never an external Sheets/control identity.

## Projection contract

- A same-namespace projection updates the existing matching rows and does not append duplicates.
- A different namespace with the same Queue IDs or Product Key Hashes appends independent rows.
- `planProjectionDiff()` reports `rowsToUpdate`, `rowsToAppend`, `rowsUnrelated`, and `unrelatedRowsWouldChange` for all four projected sheets.
- All four plans are built before the first write. A stale source hash or non-zero `unrelatedRowsWouldChange` fails closed.
- Incoming rows are aligned by header name before write, so an existing non-canonical header order cannot redirect fields.
- Dashboard, queue, reserve, commands, and sync read paths select the canonical active namespace. A missing active namespace fails closed instead of aggregating historical rows.

## Command contract

Queue-control commands must have a non-empty namespace exactly equal to the projection namespace before any local mutation. Old-namespace commands are finalized as `COMMAND_NAMESPACE_MISMATCH` / `stale_rejected`, with local mutation and projection mutation both zero. `CANCEL_COMMAND` also verifies the target command namespace.

The legacy control runner now claims, reads, and updates only rows in the active namespace.

## Attempt and active-pointer contract

New operation manifests use `daily69-first-operation-v2` and record:

- `operationDate`
- `namespace`
- `attemptNumber`
- `previousAttemptNamespace`
- `sourceBundleHash`
- `expectedGitHead`
- `armStatus`

Allowed arm progression is `prepared -> projection_verified -> tasks_armed`; failures may transition to `held`, and a completed armed operation may transition to `closed`.

Preparation does not create or update `active-operation.json`. Pointer promotion is accepted only after `tasks_armed`. The task installer requires a matching `projection_verified` manifest, verifies the exact task binding and disabled Scout state, then promotes the pointer. A target date that is not in the future in KST fails with `TARGET_OPERATION_DATE_WINDOW_MISSED`.

## Evidence and side effects

The pre-repair live workbook capture stores only bounded row metadata and hashes. It stores no raw row values, affiliate URLs, local paths, credentials, or secrets.

- Sheets metadata reads: 1
- Sheets bounded value reads: 4
- Sheets writes: 0
- Scheduled Task mutations: 0
- Live restoration rows/cells: 0 / 0
- Live re-projection: 0
- Attempt-2 creation: 0
- Manual batches / closeout: 0 / 0
- `SAFE_TO_UPLOAD=false`
