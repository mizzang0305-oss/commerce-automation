# V109 Product Source And Affiliate Evidence Binding (No Upload)

## Purpose

V109 diagnoses and binds product-source, affiliate, and Coupang Partners disclosure evidence for the V107 selected first-video queue item.

This is not an upload feature. It is an evidence bridge that shows whether V108 can move past `BLOCKED_V108_PRODUCT_SOURCE_MISSING_NO_UPLOAD` into the next precise blocker.

## Runtime Command

```bash
npm run automation:v109:product-source-affiliate-evidence --silent
```

Default behavior:

- `V109_CHANNEL_KEY=father_jobs`
- `V109_MODE=dry_run`
- `V109_DRY_RUN_USE_FIXTURE_EVIDENCE=false`
- no Coupang API call
- no n8n webhook call
- no upload/comment/scheduler execution
- no DB, Supabase, R2, storage, or product_assets write

Blocked modes:

- `V109_MODE=local_write` returns `BLOCKED_V109_LOCAL_WRITE_NOT_APPROVED_NO_UPLOAD`
- `V109_MODE=execute` returns `BLOCKED_V109_EXECUTE_NOT_APPROVED_NO_UPLOAD`

## Evidence Policy

V109 uses the V107 selected item as the source of truth.

Required evidence:

- product source: non-empty HTTPS Coupang product URL evidence
- affiliate: HTTPS `link.coupang.com` evidence with a canonical `/a/<payload>` or `/re/<payload>` deeplink path
- disclosure: Coupang Partners disclosure evidence from the review/package path or explicit dry-run fixture evidence

The report exposes only sanitized evidence:

- booleans
- hash prefixes
- blocker names
- V107/V108 before-after statuses

It never prints raw Coupang URLs, raw affiliate URLs, signed URLs, full video IDs, full channel IDs, token values, secrets, Authorization headers, HMAC signatures, or local absolute file paths.

## Fixture Mode

`V109_DRY_RUN_USE_FIXTURE_EVIDENCE=true` enables a memory-only dry-run patch for the selected queue item.

Fixture mode:

- plans a patch for the selected item only
- keeps `queuePatchApplied=false`
- does not write the queue
- does not write local files
- runs V108 with the memory-patched selected item to show the next blocker

Fixture mode exists for no-upload proof only. It is not runtime product-source ingestion and does not authorize upload.

## Status Rules

- `SUCCESS_V109_PRODUCT_AND_AFFILIATE_EVIDENCE_READY_NO_UPLOAD`: product source, affiliate, and disclosure evidence are ready; `SAFE_TO_UPLOAD=false`.
- `BLOCKED_V109_NO_SELECTED_QUEUE_ITEM_NO_UPLOAD`: V107 cannot select a queue item.
- `BLOCKED_V109_SOURCE_ITEM_MISMATCH_NO_UPLOAD`: V107 source consistency failed.
- `BLOCKED_V109_PRODUCT_SOURCE_EVIDENCE_MISSING_NO_UPLOAD`: product source evidence is absent or not an allowed Coupang product URL.
- `BLOCKED_V109_AFFILIATE_EVIDENCE_MISSING_NO_UPLOAD`: affiliate evidence is absent or invalid.
- `BLOCKED_V109_DISCLOSURE_EVIDENCE_MISSING_NO_UPLOAD`: disclosure evidence is absent.
- `BLOCKED_V109_LOCAL_WRITE_NOT_APPROVED_NO_UPLOAD`: local write mode was requested.
- `BLOCKED_V109_EXECUTE_NOT_APPROVED_NO_UPLOAD`: execute mode was requested.

## Safety

V109 always reports:

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

V109 success does not mean the first video is upload-ready. The next action depends on `v108AfterStatus` and `nextBlocker`.
