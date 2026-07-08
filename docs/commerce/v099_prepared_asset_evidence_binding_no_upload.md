# V099 Prepared Asset Evidence Binding No Upload

## Intent

V099 binds prepared video asset evidence into the private pilot package-resolution path without performing any upload or storage mutation.

This does not upload the local MP4 to storage. It only validates whether an existing prepared asset reference is safe and uploadable.

V099 binds prepared evidence by the selected channel reported by the V095/V097 context. It must not hard-code `father_jobs` when the context selects `neoman_moleulgeol` or `lets_buy`.

## Current Runtime Status

Runtime remains blocked when only local MP4 evidence exists:

- `preparedAssetEvidencePresent=false`
- `preparedAssetUploadableUrlPresent=false`
- `uploadRequestBuilt=false`
- `resolverBlocker=BLOCKED_V081_VIDEO_ASSET_MISSING`
- `SAFE_TO_UPLOAD=false`
- `SAFE_TO_PUBLIC_UPLOAD=false`

## Uploadable Prepared Asset Requirements

A prepared asset is uploadable only when all of these are true:

- `server_accessible=true`
- `prepared_video_asset_url` or `signed_url` is HTTPS
- provider is one of:
  - `r2`
  - `supabase_storage`
  - `external_https`
  - `signed_https`
  - `signed_url`
  - `r2_signed_url`
  - `supabase_signed_url`
- `mime_type=video/mp4`
- `asset_id` is present
- checksum evidence or `videoAssetHashPrefix` evidence is present
- `expires_at` is absent or in the future

Blocked cases:

- local file path only
- `storage_key` only
- `server_accessible=true` without an HTTPS URL
- non-HTTPS URL
- expired signed URL
- missing MIME type
- missing asset id
- raw URL report output
- wrong-channel prepared evidence

Provider allowlisting and uploadability are separate checks. A provider can be recognized by the prepared asset validator and still remain blocked until an HTTPS `prepared_video_asset_url` or HTTPS `signed_url` exists.

## No-Upload Boundaries

V099 does not perform:

- `videos.insert`
- `commentThreads.insert`
- public upload
- unlisted upload
- private upload execution
- comment automation
- scheduler execution
- n8n webhook call
- R2 write
- DB write
- product_assets write
- storage upload mutation

## Reporting And Redaction

Reports include only sanitized booleans, provider labels, and hash prefixes.

Reports must not print:

- raw signed URL
- raw prepared video asset URL
- raw local file path
- raw affiliate URL
- raw Coupang URL
- full video ID
- full channel ID
- token, secret, client_secret, Authorization, or HMAC

## Command

```bash
npm run upload:v099:prepared-asset-dry-run --silent
```

Expected runtime result before a real prepared asset exists:

```text
status=blocked
resolverBlocker=BLOCKED_V081_VIDEO_ASSET_MISSING
videosInsertCalled=false
commentThreadsInsertCalled=false
SAFE_TO_UPLOAD=false
SAFE_TO_PUBLIC_UPLOAD=false
```

## Next Action

Review and merge V099. After merge, runtime can prove whether prepared asset evidence exists, but actual private execution still requires separate fresh approval and complete gates.
