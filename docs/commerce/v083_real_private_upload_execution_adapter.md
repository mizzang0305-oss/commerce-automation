# V083 Real Private Upload Execution Adapter

V083/V091 is not an upload execution PR.

It adds server-only wiring for a controlled one-item YouTube private upload execution path. The adapter can become an executable candidate only when V081 private pilot readiness, V082 runtime adapter readiness, token provider readiness, upload scope readiness, package evidence, asset evidence, duplicate guard, disclosure guard, affiliate evidence, and target channel evidence all pass.

No videos.insert is called by V083 tests or readiness checks. No commentThreads.insert is called by V083 tests or readiness checks.

## Scope

- Mode: `real_private_execution_adapter_no_upload`
- Allowed visibility: `private`
- Max items: `1`
- Public upload: blocked
- Unlisted upload: blocked
- Comment automation: blocked
- Scheduler execution: blocked
- Execution in this PR: blocked unless an explicit executor is injected by a later server-only runtime
- Upload result evidence: sanitized only through the V076 contract

## Required Approval

The build-time no-upload approval phrase is:

```text
APPROVE_BUILD_V083_REAL_PRIVATE_UPLOAD_EXECUTION_ADAPTER_NO_UPLOAD
```

This phrase does not authorize a real upload.

A new fresh owner approval is required after merge. The private one-item execution path can be invoked only after that approval and a clean readiness gate. The execution approval phrase is intentionally not duplicated in this V091 no-upload review document.

## Blockers

The readiness gate fails closed for missing or unsafe evidence:

- `BLOCKED_V083_BUILD_APPROVAL_REQUIRED`
- `BLOCKED_V083_SERVER_ONLY_CONTEXT_REQUIRED`
- `BLOCKED_V083_V081_PILOT_NOT_READY`
- `BLOCKED_V083_V082_RUNTIME_ADAPTER_NOT_READY`
- `BLOCKED_V083_TOKEN_PROVIDER_NOT_READY`
- `BLOCKED_V083_UPLOAD_SCOPE_NOT_READY`
- `BLOCKED_V083_VIDEO_ASSET_NOT_READY`
- `BLOCKED_V083_UPLOAD_PACKAGE_NOT_READY`
- `BLOCKED_V083_DUPLICATE_GUARD_NOT_READY`
- `BLOCKED_V083_DISCLOSURE_GUARD_NOT_READY`
- `BLOCKED_V083_AFFILIATE_EVIDENCE_NOT_READY`
- `BLOCKED_V083_TARGET_CHANNEL_EVIDENCE_NOT_READY`
- `BLOCKED_V083_PUBLIC_UPLOAD_NOT_ALLOWED`
- `BLOCKED_V083_UNLISTED_UPLOAD_NOT_ALLOWED`
- `BLOCKED_V083_COMMENT_AUTOMATION_NOT_ALLOWED`
- `BLOCKED_V083_SCHEDULER_EXECUTION_NOT_ALLOWED`
- `BLOCKED_V083_MAX_ITEMS_MUST_BE_ONE`
- `BLOCKED_V083_REAL_UPLOAD_EXECUTOR_NOT_INJECTED`
- `BLOCKED_V083_ADAPTER_UPLOAD_EVIDENCE_INCOMPLETE`

## V091 Update

V091 removes the old PR-only V083 blocker and replaces it with a fail-closed injected-executor requirement. With no executor injected, the real-candidate adapter returns `BLOCKED_V083_REAL_UPLOAD_EXECUTOR_NOT_INJECTED`, `videosInsertCalled=false`, and `commentThreadsInsertCalled=false`.

The constructor-bearing adapter class is not exported. Executor injection must go through `createV083RealPrivateUploadExecutionAdapterFactory`, and the factory only attaches an executor after `buildV083PrivateUploadExecutionReadiness` returns ready. If readiness is false, the factory returns the blocked V081 adapter and never calls the injected executor.

This keeps PR validation no-upload while making the remaining runtime gap explicit: a later server-only execution path must inject the real upload executor only after a separate fresh private pilot approval and the full readiness chain pass.

## V092 Update

V092 adds the server-only YouTube private upload executor boundary for the later controlled one-item private pilot execution.

The real executor lives behind `import "server-only"` and creates the production YouTube upload adapter only through the server execution wiring. CLI-safe runtime execution uses a no-upload placeholder executor, so package validation can still reach the V081/V083 boundary without importing the real YouTube adapter or calling `videos.insert`.

The server-only executor can report completed upload evidence only when all required adapter evidence is present:

- `videosInsertCalled=true`
- `youtubeVideoId`
- `channelId`
- `uploadedAt`

If any evidence is missing, the result remains blocked and does not create completed V076 store/report evidence. V092 does not authorize private, public, or unlisted upload by itself; a separate fresh private pilot approval and complete runtime evidence are still required after merge.

## Evidence Policy

Adapter evidence is complete only when all of these are present:

- `youtubeVideoId`
- `channelId`
- `uploadedAt`

If any value is missing, the result must remain blocked and must not create a completed V076 store/report.

Reports may include booleans and hash prefixes only. Raw affiliate URLs, raw Coupang URLs, full YouTube video IDs, full channel IDs, credentials, headers, and signatures must not be printed.

## Safety

V083 keeps:

- `SAFE_TO_UPLOAD=false`
- `SAFE_TO_PUBLIC_UPLOAD=false`
- `PUBLIC_UPLOAD=BLOCKED`
- `COMMENT_AUTOMATION=BLOCKED`
- `SCHEDULER_EXECUTION=BLOCKED`

Merge of V083/V091 only prepares the next execution adapter review step. It does not authorize private, public, or unlisted upload.
