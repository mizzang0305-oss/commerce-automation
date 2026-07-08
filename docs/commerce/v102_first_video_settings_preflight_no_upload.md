# V102 First Video Settings Preflight

## Purpose

V102 checks the first eligible channel video settings before any external execution.
It is a no-upload, no-comment, no-scheduler preflight for owner review.

## Current Runtime State

- V102 preflight tool: ready
- Current default channel: `father_jobs`
- Current runtime candidate: absent in local data
- Current blocker: `BLOCKED_NO_FIRST_VIDEO_CANDIDATE_NO_UPLOAD`
- This is not a "first video ready" report.
- Readiness gate uses real V073 package fields only; it does not depend on fixture-only `shortsContentQuality`.
- Fallback candidate selection is restricted to rows whose `queue_status` is exactly `manual_review`.
- Upload, comment, scheduler, n8n, storage, DB, and migration execution remain disabled.
- `SAFE_TO_UPLOAD=false`
- `SAFE_TO_PUBLIC_UPLOAD=false`

## Scope

- Default channel: `father_jobs`
- Optional selected channel: `V102_CHANNEL_KEY`, `V084_CHANNEL_KEY`, or loaded V095 context
- Item selection: exactly one item
- Selection order:
  1. due `scheduled` item with the lowest `queue_rank`
  2. `ready_for_manual_upload` item with the lowest `queue_rank`
  3. `manual_review` queue item with the lowest `queue_rank`

Excluded queue statuses: `skipped`, `hold`, `error`.

Future scheduled rows are not selected only because their `manual_review_status` is `not_ready`. Uploaded or posted rows are also not fallback candidates.

## Command

```bash
npm run upload:v102:first-video-settings-dry-run --silent
```

## Report Contract

The report only includes sanitized evidence:

- channel key
- queue rank and queue status
- hash prefixes for queue/package/video/comment evidence
- title/description/tags/category booleans
- disclosure and affiliate evidence booleans
- prepared HTTPS asset readiness booleans
- upload/comment/scheduler mutation flags fixed to `false`

The report must not print:

- raw Coupang URL
- raw affiliate URL
- signed asset URL
- raw local file path
- full YouTube video ID
- full channel ID
- token, secret, Authorization, or HMAC values

## Safety

V102 does not call:

- `videos.insert`
- `commentThreads.insert`
- YouTube upload execution
- n8n webhook execution
- scheduler execution
- R2, DB, product asset, or storage write paths

`SAFE_TO_UPLOAD=false` and `SAFE_TO_PUBLIC_UPLOAD=false` remain fixed.

## Final Status Values

- `SUCCESS_V102_FIRST_VIDEO_SETTINGS_PREFLIGHT_READY_NO_UPLOAD_NO_COMMENT`
- `BLOCKED_NO_FIRST_VIDEO_CANDIDATE_NO_UPLOAD`
- `BLOCKED_FIRST_VIDEO_SETTINGS_NOT_READY_NO_UPLOAD`
- `BLOCKED_V081_VIDEO_ASSET_MISSING_NO_UPLOAD`

## Next Action

Owner reviews the V102 sanitized report for the first selected item. Upload and comment execution remain blocked unless a separate fresh approval and execution gate are explicitly provided.
