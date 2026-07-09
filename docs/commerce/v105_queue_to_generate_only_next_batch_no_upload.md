# V105 Queue To Generate-Only Next Batch No-Upload

## Purpose

V105 connects the V104 local/mock queue item to a generate-only next-batch plan.

This is not an upload, comment, scheduler, or webhook execution feature. It only reads local/mock queue data and builds a sanitized plan that a reviewer can inspect before any future operation.

## Scope

- Source: local/mock `data/queue.json` or injected test queue items.
- Default channel: `father_jobs`.
- Default batch size: `1`.
- Default mode: `dry_run`.
- Allowed no-op modes: `dry_run`, `plan_only`.
- Blocked mode: `execute`.
- Planned payload mode: `generate_only`.

## Selection Policy

V105 selects candidates in this order:

1. due `scheduled` items for the selected channel,
2. `ready_for_manual_upload` items for the selected channel,
3. `manual_review` / `not_ready` items as a V104 link-proof fallback.

The fallback does not promote upload readiness. It only proves the queue candidate can move into a generate-only next-batch plan.

These states are excluded:

- `hold`
- `skipped`
- `error`
- `uploaded`
- `posted`

## Safety

V105 always reports:

- `n8nWebhookCalled=false`
- `uploadExecuteAllowed=false`
- `videosInsertCalled=false`
- `videosInsertTotalCount=0`
- `commentThreadsInsertCalled=false`
- `schedulerExecutionCalled=false`
- `DB_write=false`
- `Supabase_write=false`
- `R2_upload=false`
- `storage_write=false`
- `SAFE_TO_UPLOAD=false`
- `SAFE_TO_PUBLIC_UPLOAD=false`

Reports contain sanitized booleans, labels, and hash prefixes only. They must not print raw affiliate URLs, raw Coupang URLs, raw video IDs, raw channel IDs, tokens, secrets, Authorization headers, HMAC signatures, or webhook secrets.

## Planned Payload Label Redaction

`plannedPayloadSanitized=true` is valid only after label fields are redacted beyond URL-only cleanup.

The V105 planner redacts these patterns from `productNameSanitized`, `keywordSanitized`, `themeSanitized`, and `categoryPathSanitized`:

- URL-shaped substrings
- full YouTube channel IDs such as `UC...`
- `Authorization` / `Bearer` fragments
- `token`, `secret`, `client_secret`, `signature`, `signed_url`, `prepared_video_asset_url`, `api_key`, `key`, and `hmac` key-value fragments
- `HmacSHA256` markers
- Google API-key-shaped values
- long key-like alphanumeric/base64-ish values
- Windows and common local absolute paths

If a label becomes empty after redaction, V105 emits `[redacted]`.

The safe channel keys `father_jobs`, `neoman_moleulgeol`, and `lets_buy` are not full channel IDs and may remain in reports.

## Statuses

| Status | Meaning |
| --- | --- |
| `SUCCESS_V105_QUEUE_TO_GENERATE_ONLY_NEXT_BATCH_PLANNED_NO_UPLOAD` | A sanitized generate-only next-batch payload was planned. |
| `BLOCKED_V105_NO_QUEUE_ITEM_FOR_NEXT_BATCH_NO_UPLOAD` | No eligible queue item exists for the selected channel. |
| `BLOCKED_V105_EXECUTE_NOT_APPROVED_NO_UPLOAD` | `V105_MODE=execute` was requested and blocked. |

## Commands

Dry-run:

```powershell
npm run automation:v105:queue-to-generate-only-next-batch --silent
```

Plan-only:

```powershell
$env:V105_MODE="plan_only"
npm run automation:v105:queue-to-generate-only-next-batch --silent
Remove-Item Env:V105_MODE
```

Blocked execute proof:

```powershell
$env:V105_MODE="execute"
npm run automation:v105:queue-to-generate-only-next-batch --silent
Remove-Item Env:V105_MODE
```

## Next Action

`V106_UPLOAD_PACKAGE_AFFILIATE_AND_ASSET_EVIDENCE_NO_UPLOAD`

V106 should add the missing package, affiliate, disclosure, and prepared asset evidence needed before any manual upload-readiness discussion. Upload, comment, scheduler, n8n, DB, Supabase, R2, storage, and product-assets writes remain blocked until separate owner approval.
