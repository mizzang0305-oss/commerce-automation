# V108 First Video Upload Package Materializer (No Upload)

## Purpose

V108 bridges the V107 owner-review selected queue item into a V073/V106-compatible upload package evidence object without executing upload, comment automation, scheduler execution, webhook calls, database writes, storage writes, R2 writes, or prepared asset uploads.

This is a no-upload materializer. It does not make the first video ready by itself.

## Runtime Mode

- Default command: `npm run automation:v108:first-video-upload-package-materializer --silent`
- Default channel: `father_jobs`
- Default mode: `dry_run`
- `V108_MODE=local_write` is blocked with `BLOCKED_V108_LOCAL_WRITE_NOT_APPROVED_NO_UPLOAD`
- `V108_MODE=execute` is blocked with `BLOCKED_V108_EXECUTE_NOT_APPROVED_NO_UPLOAD`

The default dry-run mode creates an in-memory V073-compatible package skeleton for the V107 selected item and immediately runs the V106 evidence probe against that skeleton.

The materialized skeleton is private-only by default:

- `youtubeAdvancedSettings.privacyStatus=private`
- `packagePrivacyStatus=private`
- `packagePublicUploadDefaultDisabled=true`
- `packageUnlistedUploadDefaultDisabled=true`
- `packagePrivateOnly=true`

V108 must never materialize a public or unlisted default package. Private-only metadata is a safety default for later gates, not an upload approval.

## Source Of Truth

V108 treats V107 as the selection authority:

- V107 must find a selected queue item.
- V107 source consistency must pass.
- The selected item must match the selected channel and selected item hash prefix.
- The selected item must have a valid HTTPS Coupang product URL before V108 materializes a package skeleton.
- The materialized package must match the selected queue item id and channel key.
- If an older matching package is supplied to the dry-run, V108 replaces that matching package with the newly materialized skeleton before running V106 evidence probing.

If V107 cannot select an item, V108 reports `BLOCKED_V108_NO_SELECTED_QUEUE_ITEM_NO_UPLOAD`.
If V107 reports a source mismatch, V108 reports `BLOCKED_V108_SOURCE_ITEM_MISMATCH_NO_UPLOAD`.
If product-source evidence is missing or invalid, V108 reports `BLOCKED_V108_PRODUCT_SOURCE_MISSING_NO_UPLOAD`.

## Evidence Behavior

The V108 report exposes only sanitized evidence:

- package hash prefix
- queue item hash prefix
- boolean metadata fields
- boolean affiliate/disclosure evidence
- boolean video/first-frame/prepared asset evidence
- downstream V106 before/after status
- next blocker
- private-only package privacy evidence

It never prints raw affiliate URLs, raw Coupang URLs, signed URLs, prepared asset URLs, local absolute paths, full video IDs, full channel IDs, tokens, secrets, Authorization headers, or HMAC signatures.

## Status Rules

- `SUCCESS_V108_UPLOAD_PACKAGE_MATERIALIZED_NO_UPLOAD`: package evidence was materialized in memory and V106 evidence is complete. `SAFE_TO_UPLOAD` remains false.
- `BLOCKED_V108_NO_SELECTED_QUEUE_ITEM_NO_UPLOAD`: V107 could not select a queue item.
- `BLOCKED_V108_SOURCE_ITEM_MISMATCH_NO_UPLOAD`: V107 source consistency failed.
- `BLOCKED_V108_PRODUCT_SOURCE_MISSING_NO_UPLOAD`: selected queue item does not carry valid Coupang product-source evidence.
- `BLOCKED_V108_UPLOAD_PACKAGE_STILL_MISSING_NO_UPLOAD`: V108 could not connect a package to V106.
- `BLOCKED_V108_AFFILIATE_OR_DISCLOSURE_MISSING_NO_UPLOAD`: package exists, but affiliate or Coupang Partners disclosure evidence is incomplete.
- `BLOCKED_V081_VIDEO_ASSET_MISSING_NO_UPLOAD`: package/affiliate/disclosure evidence exists, but prepared uploadable video asset evidence is incomplete.
- `BLOCKED_V108_LOCAL_WRITE_NOT_APPROVED_NO_UPLOAD`: local write mode was requested.
- `BLOCKED_V108_EXECUTE_NOT_APPROVED_NO_UPLOAD`: execute mode was requested.

## Safety

V108 always reports:

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

V108 is not an upload gate, public upload approval, private upload approval, scheduler approval, or comment automation approval.

Even when V108 returns `SUCCESS_V108_UPLOAD_PACKAGE_MATERIALIZED_NO_UPLOAD`, public and unlisted upload remain forbidden. V109/V110 or any later execution gate still requires a separate fresh approval and must keep `SAFE_TO_UPLOAD=false` and `SAFE_TO_PUBLIC_UPLOAD=false` until that owner-approved execution path is explicitly reached.

## Next Action

Review the V108 PR. After merge, run the V108 dry-run on main. If the next blocker is affiliate/disclosure, bind that evidence. If the next blocker is `BLOCKED_V081_VIDEO_ASSET_MISSING_NO_UPLOAD`, bind or prepare server-accessible HTTPS video asset evidence. Upload execution remains disabled until a separate approved execution gate.
