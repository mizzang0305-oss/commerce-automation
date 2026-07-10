# V110 V057 R2 Private Upload One-Shot

## Purpose

V110 closes the final runtime gap for the existing `father_jobs` v057 private pilot package:

1. validate the canonical v057 product-source manifest, MP4, first frame, and V095 runtime context;
2. prepare exactly one server-accessible MP4 in R2;
3. inject the resulting `PreparedVideoAssetRef` into the existing V094 resolver;
4. execute through the V092 server-only YouTube executor and V083/V081 evidence gates;
5. keep public, unlisted, comments, scheduler, n8n, DB, and product-assets writes disabled.

This is not a public upload path.

## Commands

Preflight only:

```powershell
npm run upload:v110:private-pilot-one-shot --silent
```

The package script uses Node's `react-server` condition so the existing `server-only` boundary remains active in CLI execution.

Execution command, only after separate owner approval:

```powershell
npm run upload:v110:private-pilot-one-shot --silent -- --execute
```

## Required Fresh Approvals

Both values must be present in the current execution environment:

```text
V110_R2_PREPARE_APPROVAL=APPROVE_V110_R2_PREPARE_V057_FATHER_JOBS_ASSET_ONCE
V084_PRIVATE_UPLOAD_APPROVAL_PHRASE=APPROVE_YOUTUBE_PRIVATE_UPLOAD_PILOT_1_ITEM_NO_COMMENT
```

An approval authorizes one R2 MP4 preparation attempt and one YouTube private upload attempt in the same process. It does not authorize retry, public/unlisted upload, comments, scheduler execution, n8n, DB, Supabase, or product-assets writes.

## Preflight Result

The current local v057 lane reports:

- status: `ready_for_external_approval`
- channel: `father_jobs`
- visibility: `private`
- max items: `1`
- canonical manifest, MP4, and first frame: present
- product source, affiliate, and disclosure evidence: present
- R2 configuration: ready
- V095 runtime context: ready
- queue item binding: match
- stale manifest package id: safely rebound to the current V095/V097 package for the same queue item
- R2 upload attempted: false
- YouTube execution attempted: false
- videos.insert called: false
- commentThreads.insert called: false
- `SAFE_TO_UPLOAD=false`
- `SAFE_TO_PUBLIC_UPLOAD=false`

## Failure Rules

- Missing or mismatched queue/channel evidence blocks before R2.
- Missing R2 configuration blocks before R2.
- Either missing approval blocks before R2.
- R2 preparation failure blocks YouTube execution.
- Incomplete adapter evidence never returns completion.
- Completion requires exactly one videos.insert result plus sanitized video/channel hash evidence.
- Raw URLs, full IDs, local paths, secrets, Authorization, and HMAC values are excluded from reports.

## Rollback

Before external execution, revert the V110 code changes. After an R2 attempt, remove the prepared object only with separate owner approval. After a successful private YouTube upload, review it in YouTube Studio; public visibility remains blocked.
