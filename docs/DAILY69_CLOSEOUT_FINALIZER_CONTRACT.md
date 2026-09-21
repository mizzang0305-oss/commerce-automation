# Daily69 no-upload lifecycle contract

The canonical schedule is `src/lib/daily69-first-operation/timing-contract.json`.
TypeScript and Windows PowerShell derive the same KST timestamps. Both boundaries
use strict `>` after the runtime limit plus margin, rounded to the next 5 minutes.
For operation day D, the current values are:

| Action | Trigger | Maximum runtime | Absolute deadline |
| --- | --- | --- | --- |
| Last VideoBatch | D 23:00 | 55 minutes | D 23:55 |
| Closeout | D+1 00:15 | 30 minutes | D+1 00:45 |
| Finalizer | D+1 01:05 | 15 minutes | D+1 01:20 |

Closeout waits at most 600 seconds for read-only idle observations, every 5 seconds.
Missing/malformed Queue data, claimed or processing entries (even without a
lease), leases, or writer locks fail closed.
The PS5.1 JSON-array reader must enumerate actual queue entries rather than treat
the top-level array as one pipeline object. After preflight, Closeout rechecks
idle, prior Task state and its absolute deadline before projection. Finalizer
also refuses a still-running prior Task; StartWhenAvailable is not proof of idle.

## Evidence and post-exit binding

Finalizer runs the fixed Node entrypoint with UTF-8 output capture and a bounded
child timeout. Stdout/stderr are read in bounded 32,768-character chunks with a
combined 4 MiB UTF-8 capture limit. Only completed asynchronous reads are consumed;
neither pending stream results nor process termination are awaited indefinitely.
The 12-minute child deadline includes stream draining; termination cleanup waits
at most another 2 seconds. Timeout/overflow retains a safe error and a digest of
the bounded captured prefix, not a claim that all child output was preserved.
It retains a create-new `finalizer-results/<resultId>.json` for
success, pending and failure, including safe error and output SHA-256, never raw
output, product names, credentials or arbitrary paths. Failed writes cannot PASS.
The installer creates an immutable `task-definitions/finalizer-task-contract.json`
after Task readback, binding namespace, date, source SHA, SID hash and action hash.

This evidence class is excluded from pre-finalizer receipt binding. Only the
post-closeout auditor consumes it after process exit, when events 201/102 exist.
Its dedicated gate requires one exact result, the full 107/129/100/200/201/102
chain, no manual 110, matching PID/SID/action/operation/SHA and zero exit codes.
Multiple Task-start instances in the result's correlation window are ambiguous
and rejected, even when one instance uses the expected PID.
The immutable post-event binding records the exact result byte digest. Missing,
duplicate, malformed, substituted or rewritten evidence cannot satisfy the gate.

The Windows event query uses a bounded EventLogReader/XmlReader projection. It
selects exact Task names and times before serialization, exports only typed
allowlisted fields, hashes principal identity, and fails instead of truncating
at the 4 MiB or 20,000-record limit. Its process timeout remains 45 seconds.

## Attempts and history

Attempt 1 is `operation-YYYY-MM-DD`; subsequent attempts use the native
`operation-YYYY-MM-DD-attempt-N` identity and immediate predecessor metadata.
Immutable binding and Sheets cutover validate the same identity. A fresh attempt
requires its predecessor to be held, preserves predecessor SHA and Sheets rows,
and uses only append-only new-namespace projection. Historical failed evidence
must never be reclassified as natural success or rebound to new source.

No schedule installation authorizes manual Task execution or platform upload.
Natural certification and post-finalizer audit remain separate proof gates.
