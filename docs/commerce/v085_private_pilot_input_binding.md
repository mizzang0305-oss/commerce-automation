# V085 Private Pilot Input Binding

V085 prepares the runtime inputs required by the V084 private pilot invocation path.

This is a no-upload preflight. It does not call `videos.insert`, `commentThreads.insert`, scheduler execution, R2, DB, or product asset writes.

## Goal

Bind and verify the inputs that were missing during the V085 private upload pilot attempt:

- `V084_QUEUE_ITEM_ID`
- `V084_UPLOAD_PACKAGE_ID`
- `V084_RUNTIME_READY`

`V084_RUNTIME_READY` is derived from readiness evidence. It is not treated as a manual owner assertion.

## Input Sources

V085 reads existing system artifacts only:

- V073 upload package generation from product queue/generated content/review package sources
- v057 corrected video asset binding
- sanitized target channel evidence
- affiliate evidence presence
- Coupang Partners disclosure evidence
- duplicate guard evidence
- local YouTube token metadata readiness

Raw Coupang URLs, affiliate URLs, full channel IDs, token paths, token values, client secrets, and authorization headers are not printed.

## Command

```bash
npm run upload:v085:private-pilot:bind-inputs
```

The command prints a sanitized JSON report only.

## Possible Status

- `ready_for_fresh_approval`: V084 queue item, upload package, and runtime readiness inputs can be bound.
- `blocked`: at least one required input or readiness gate is missing.

## Blockers

- `BLOCKED_V085_QUEUE_ITEM_ID_MISSING`
- `BLOCKED_V085_UPLOAD_PACKAGE_ID_MISSING`
- `BLOCKED_V085_RUNTIME_READY_MISSING`
- `BLOCKED_V085_VIDEO_ASSET_NOT_READY`
- `BLOCKED_V085_AFFILIATE_EVIDENCE_NOT_READY`
- `BLOCKED_V085_DISCLOSURE_EVIDENCE_NOT_READY`
- `BLOCKED_V085_DUPLICATE_GUARD_NOT_READY`
- `BLOCKED_V085_TARGET_CHANNEL_EVIDENCE_NOT_READY`
- `BLOCKED_V085_TOKEN_PROVIDER_NOT_READY`
- `BLOCKED_V085_UPLOAD_SCOPE_NOT_READY`
- `BLOCKED_V085_UNSAFE_REPORT_REQUESTED`

## Safety

V085 calls only the V084 plan path. It never calls the V084 execute command.

The expected next state after a ready V085 report is still:

```text
PRIVATE_UPLOAD_PILOT_EXECUTION=BLOCKED_FRESH_APPROVAL_REQUIRED
SAFE_TO_UPLOAD=false
SAFE_TO_PUBLIC_UPLOAD=false
```

Actual private upload execution requires a separate fresh owner approval after this preflight is merged and run.
