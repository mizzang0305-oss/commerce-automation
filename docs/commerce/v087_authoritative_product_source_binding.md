# V087 Authoritative Product Source Binding

V087 binds an operator-provided local product source manifest to the existing v057 corrected assets so the V085 private pilot input binder can run without treating the package as video-only.

This is a no-upload step.

## Scope

- Reads `V087_PRODUCT_SOURCE_MANIFEST_PATH`.
- Validates product source, queue item, upload package, channel, affiliate, disclosure, duplicate guard, target channel, MP4, and first-frame evidence.
- Writes a local `commerce-assets/review/v057/<channel>/product-source-v057.json` manifest for the existing V073/V085 path.
- Calls V085 binder in no-upload mode only.
- Strips any ambient private upload approval before the nested V084 plan.

## Local Manifest

The actual manifest is local and must not be committed. It may contain raw Coupang URLs, affiliate URLs, and local file paths. Reports must only contain sanitized booleans and hash prefixes.

Sanitized shape:

```json
{
  "sourceVersion": "v087-local",
  "productSourceId": "source-...",
  "queueItemId": "queue-...",
  "uploadPackageId": "pkg-...",
  "channelKey": "father_jobs",
  "productName": "<channel product label>",
  "rawCoupangUrl": "<redacted https Coupang URL>",
  "selectedAffiliateUrl": "<redacted https Coupang affiliate URL>",
  "coupangPartnersDisclosureText": "<Coupang Partners disclosure>",
  "videoAssetPath": "<local v057 corrected mp4 path>",
  "firstFramePath": "<local v057 first-frame path>",
  "duplicateGuardKey": "duplicate-...",
  "targetChannelKey": "father_jobs"
}
```

## Command

```powershell
$env:V087_PRODUCT_SOURCE_MANIFEST_PATH="<local untracked manifest path>"
$env:V051_UPLOAD_ASSET_PROFILE="v057_corrected_reupload"
npm run upload:v087:bind-product-source --silent
```

## Safety

- No `videos.insert`.
- No `commentThreads.insert`.
- No V084 execute.
- No public, unlisted, or private upload execution.
- No comment automation.
- No scheduler execution.
- No R2, DB, or `product_assets` writes.
- No raw URL, raw file path, full video ID, full channel ID, token, secret, client secret, Authorization, or HMAC output.
- `SAFE_TO_UPLOAD=false`.
- `SAFE_TO_PUBLIC_UPLOAD=false`.

## Blockers

- `BLOCKED_V087_PRODUCT_SOURCE_MANIFEST_MISSING`
- `BLOCKED_V087_PRODUCT_SOURCE_ID_MISSING`
- `BLOCKED_V087_QUEUE_ITEM_ID_MISSING`
- `BLOCKED_V087_UPLOAD_PACKAGE_ID_MISSING`
- `BLOCKED_V087_CHANNEL_KEY_MISSING`
- `BLOCKED_V087_RAW_COUPANG_URL_MISSING`
- `BLOCKED_V087_AFFILIATE_URL_MISSING`
- `BLOCKED_V087_DISCLOSURE_MISSING`
- `BLOCKED_V087_VIDEO_ASSET_FILE_NOT_FOUND`
- `BLOCKED_V087_VIDEO_ASSET_FILE_UNREADABLE`
- `BLOCKED_V087_FIRST_FRAME_FILE_NOT_FOUND`
- `BLOCKED_V087_DUPLICATE_GUARD_KEY_MISSING`
- `BLOCKED_V087_TARGET_CHANNEL_KEY_MISSING`
- `BLOCKED_V087_UNSAFE_REPORT_REQUESTED`
