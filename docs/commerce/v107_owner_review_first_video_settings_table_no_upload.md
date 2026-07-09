# V107 Owner Review First Video Settings Table (No Upload)

## Purpose

V107 combines the V102 first-video settings preflight, V105 generate-only queue selection, and V106 upload package evidence probe into one sanitized owner review table.

This is an owner review artifact only. It is not upload readiness and it does not execute upload, comment, scheduler, webhook, storage, database, R2, or prepared asset writes.

## Runtime Mode

- Default command: `npm run automation:v107:owner-review-table --silent`
- Default channel: `father_jobs`
- Default mode: `dry_run`
- `V107_MODE=execute` is blocked with `BLOCKED_V107_EXECUTE_NOT_APPROVED_NO_UPLOAD`

## Source Reports

V107 reads these no-upload reports:

- V105 queue-to-generate-only next-batch planner
- V106 upload package affiliate and asset evidence probe
- V102 first-video settings preflight

The V107 table keeps each source status visible instead of converting it into upload readiness.

## Owner Review Rows

The table includes at least these rows:

- Channel
- Queue item
- Event / theme
- Product
- Queue status
- Manual review status
- Planned mode
- V102 status
- V105 status
- V106 status
- Upload package
- Affiliate evidence
- Coupang disclosure
- YouTube title
- YouTube description
- Tags
- Category
- Video asset evidence
- First frame evidence
- Prepared HTTPS asset
- Prepared asset binding ready
- Prepared asset bridge ready
- Prepared asset blocker
- Prepared asset uploadable
- Current blocker
- Safe to upload
- Safe to public upload

## Safety

V107 always reports:

- `uploadExecutionAllowed=false`
- `videosInsertCalled=false`
- `videosInsertTotalCount=0`
- `commentThreadsInsertCalled=false`
- `n8nWebhookCalled=false`
- `schedulerExecutionCalled=false`
- `DB_write=false`
- `Supabase_write=false`
- `R2_upload=false`
- `storage_write=false`
- `SAFE_TO_UPLOAD=false`
- `SAFE_TO_PUBLIC_UPLOAD=false`

The report only includes sanitized labels, booleans, blocker names, and hash prefixes. It must not print raw affiliate URLs, raw Coupang URLs, local absolute paths, full video IDs, full channel IDs, tokens, secrets, Authorization headers, HMAC signatures, signed URLs, or prepared asset URLs.

## Status Rules

- `SUCCESS_V107_OWNER_REVIEW_TABLE_READY_NO_UPLOAD`: the owner review table was generated.
- `BLOCKED_V107_NO_SELECTED_QUEUE_ITEM_NO_UPLOAD`: V105 could not select a queue item.
- `BLOCKED_V107_OWNER_REVIEW_TABLE_INCOMPLETE_NO_UPLOAD`: table generation failed or required rows are missing.
- `BLOCKED_V107_EXECUTE_NOT_APPROVED_NO_UPLOAD`: execute mode was requested.

`SUCCESS_V107_OWNER_REVIEW_TABLE_READY_NO_UPLOAD` means the table is ready for review. It does not mean the first video is upload-ready.

## Next Action

Review the V107 owner table. If a blocker remains, fix the source evidence in V102, V105, or V106 first. Upload execution remains disabled until a separate owner approval and a later upload gate explicitly allow it.
