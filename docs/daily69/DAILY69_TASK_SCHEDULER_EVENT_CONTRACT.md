# Daily69 Task Scheduler Event Contract

Daily69 natural provenance uses the Windows Task Scheduler Operational log and retained execution receipts. The event IDs share neither one payload schema nor one result-code contract.

| Event | Purpose | TaskInstanceId | ProcessId | ResultCode |
|---:|---|---|---|---|
| 107 | scheduled trigger | required | N/A | N/A |
| 100 | task started | required | N/A | N/A |
| 129 | process launched | optional only when the retained receipt PID correlates | required | N/A |
| 200 | action started | required | required | N/A |
| 201 | action completed | required | required | required and zero |
| 102 | task completed | required | N/A | optional; absent is N/A, explicit nonzero fails |
| 110 | user-triggered task | disqualifies natural provenance | — | — |

Natural classification requires each of 107, 100, 129, 200, 201, and 102 exactly once, one non-empty TaskInstanceId across instance-bearing events, one positive PID across 129/200/201, Event 201 success, no explicit Event 102 failure, and no Event 110.

Binding to an authoritative Daily69 receipt additionally requires exact task name, operation namespace/date, expected Git SHA, receipt exit code zero, action PID equality, and one unambiguous Task instance. Current-user canonical SID equality remains a Scheduled Task registration/readback gate.

The sanitized real Windows canary fixture is `tests/daily69-first-operation/fixtures/task-scheduler-natural-canary-v1.json`. It intentionally records Event 129 without TaskInstanceId and Event 102 without ResultCode.

This contract does not infer provenance from timestamp proximity and does not weaken missing-event, duplicate-event, PID, receipt, Event 110, or authoritative binding checks.
