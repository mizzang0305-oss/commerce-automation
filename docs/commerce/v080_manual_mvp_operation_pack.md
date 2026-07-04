# V080 Manual MVP Operation Pack

## Purpose

V080 defines a manual MVP operation pack for the UploadPackage path.

This feature is not a public upload executor.

It does not call:

- YouTube upload APIs
- `videos.insert`
- `commentThreads.insert`
- comment create/update/delete APIs
- visibility update APIs
- n8n live webhooks
- cron, worker, or scheduler execution
- R2, DB, or `product_assets` writes

The pack is a release gate and operator checklist only. `SAFE_TO_UPLOAD=false` remains unchanged.

## Report Contract

`V080ManualMvpOperationReport` includes:

- `version=v080`
- `FINAL_STATUS=V080_MANUAL_MVP_OPERATION_PACK_READY_NO_UPLOAD`
- `mode=manual_mvp_operation_pack`
- `safeToUpload=false`
- `publicUploadApproval=missing`
- `automationExecutionAllowed=false`
- `manualOperationAllowed=true`
- `noUploadDryRunPassed`
- scaffold readiness booleans
- required operator checks
- release blockers
- manual steps
- redaction proof
- mutation side-effect flags

`manualOperationAllowed=true` means an operator can review the package and perform any platform action manually outside this automation. It does not enable automated upload, automated comment writing, scheduler execution, webhook calls, or post-upload state mutation.

## Required Operator Checks

The manual checklist requires these checks before any operator action outside automation:

- Coupang Partners disclosure evidence exists
- affiliate URL evidence exists without exposing the raw URL
- video or video output evidence exists
- blog draft evidence exists when applicable
- product name, price, and thumbnail evidence are internally consistent
- prohibited-product check is complete
- duplicate-upload check is complete
- YouTube title, description, and pinned-comment text are manually reviewed
- operator confirms manual upload only
- post-upload state remains blocked until separate fresh approval

## Manual Steps

The pack exposes these scaffold-only steps:

1. Review today's generation readiness.
2. Review queue item readiness.
3. Review video output and blog draft evidence.
4. Confirm upload, comment, scheduler, and webhook automation remains blocked.
5. Review only candidates that an operator could manually upload.
6. Confirm disclosure and affiliate evidence exists without exposing raw links.
7. Operator performs any upload manually outside automation.
8. Keep post-upload state changes blocked until separate fresh approval.

Every step has `automationActionAllowed=false`.

## Current State

- T010 is manual MVP operation pack / release gate only.
- `SAFE_TO_UPLOAD=false`
- public upload execution remains blocked.
- real comment mutation remains blocked.
- scheduler auto-execution remains blocked.
- n8n live webhook execution remains blocked.
- external API mutation remains blocked.
