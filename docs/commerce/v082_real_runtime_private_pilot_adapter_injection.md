# V082 Real Runtime Private Pilot Adapter Injection

Status: no-upload scaffold ready for review.

## Purpose

V082 resolves the V081 blocker `BLOCKED_V081_REAL_ADAPTER_DISABLED` without
executing a real upload. It adds a server-only runtime adapter factory and a
sanitized readiness wrapper for the controlled one-item private YouTube upload
pilot.

This is not a private upload execution PR.

## What V082 Adds

- `V082PrivateUploadRuntimeAdapterReadiness`
- `createV082PrivateUploadRuntimeAdapterFactory`
- `createV082PrivateUploadRuntimeAdapterFactoryFromEnv`
- `V082RealCandidatePrivateUploadAdapter`
- sanitized readiness report
- V081 injected adapter mode `real_candidate`

## Runtime Contract

The V082 readiness contract reports:

- `adapterMode: "blocked" | "real_candidate"`
- `serverOnly: true`
- `allowedVisibility: "private"`
- `maxItems: 1`
- `canCallCommentThreadsInsert: false`
- `executionAllowedInThisPr: false`
- `requiresFreshExecutionApproval: true`
- `freshApprovalReused: false`
- `SAFE_TO_UPLOAD=false`
- `SAFE_TO_PUBLIC_UPLOAD=false`

When all infrastructure readiness fields pass, the report status is:

```text
READY_FOR_PRIVATE_PILOT_EXECUTION_APPROVAL
```

This status only means a future execution approval may be requested. It does
not mean upload completed.

## Readiness Blockers

V082 blocks on:

- `BLOCKED_V082_SERVER_ONLY_CONTEXT_REQUIRED`
- `BLOCKED_V082_YOUTUBE_OAUTH_NOT_CONFIGURED`
- `BLOCKED_V082_TOKEN_PROVIDER_NOT_CONFIGURED`
- `BLOCKED_V082_TOKEN_NOT_READY`
- `BLOCKED_V082_VIDEO_ASSET_RESOLVER_NOT_CONFIGURED`
- `BLOCKED_V082_UPLOAD_PACKAGE_RESOLVER_NOT_CONFIGURED`
- `BLOCKED_V082_DUPLICATE_GUARD_NOT_CONFIGURED`
- `BLOCKED_V082_DISCLOSURE_GUARD_NOT_CONFIGURED`
- `BLOCKED_V082_PUBLIC_UPLOAD_NOT_ALLOWED`
- `BLOCKED_V082_UNLISTED_UPLOAD_NOT_ALLOWED`
- `BLOCKED_V082_COMMENT_AUTOMATION_NOT_ALLOWED`
- `BLOCKED_V082_SCHEDULER_EXECUTION_NOT_ALLOWED`
- `BLOCKED_V082_REAL_UPLOAD_EXECUTION_NOT_ALLOWED_IN_THIS_PR`

## No-Upload Behavior

No videos.insert is called by V082.

Even when V082 creates a `real_candidate` adapter, calling that adapter returns
`BLOCKED_V082_REAL_UPLOAD_EXECUTION_NOT_ALLOWED_IN_THIS_PR` and reports:

- `videosInsertCalled=false`
- `videosInsertTotalCount=0`
- `commentThreadsInsertCalled=false`
- `fakeSuccess=false`

The V081 executor can receive the V082 injected adapter, but the result remains
blocked and no V076 upload result evidence is created in this PR.

## Server-Only Safety

The env-based factory only converts runtime configuration into booleans:

- OAuth configured
- token provider configured
- token ready
- video asset resolver configured
- upload package resolver configured
- duplicate guard configured
- disclosure guard configured

It does not print token file paths, token values, client secrets, auth headers,
raw Coupang URLs, raw affiliate URLs, full video IDs, or full channel IDs.

## Approval Boundary

A new fresh owner approval is required after merge.

The previous V081 approval attempt was consumed by the disabled-runtime-adapter
blocker and is not reused by V082. V082 only prepares the runtime adapter
candidate and readiness evidence.

## Safety State

- public upload: blocked
- unlisted upload: blocked
- comment automation: blocked
- scheduler execution: blocked
- batch/daily upload: blocked
- R2/DB/product_assets writes: blocked
- `SAFE_TO_UPLOAD=false`
- `SAFE_TO_PUBLIC_UPLOAD=false`
