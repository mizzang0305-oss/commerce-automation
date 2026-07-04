# V073 Upload Package Generator

Status: no-upload generator implementation

`SAFE_TO_UPLOAD=false`

## Purpose

V073 creates `UploadPackage` objects from authoritative product source data.

This task does not execute public upload, does not call YouTube mutation APIs, and does not write R2, DB, or `product_assets`.

## Source Priority

The generator resolves product source in this order:

1. `ProductQueueItem` plus `GeneratedContent` pair
2. `ReviewPackageProductSourceManifest`
3. `GeneratedContent` only
4. `ProductQueueItem` only
5. trusted upstream manifest

Manual affiliate URL input and manual raw Coupang URL input are emergency/test overrides only. They are not the production default path.

## UploadPackage Contract

Each package contains:

- `packageId`
- `queueItemId`
- `generatedContentId`
- `channelKey`
- `assetProfile`
- product source with internal raw Coupang URL and source evidence hash
- Deeplink status and internal selected affiliate URL when already resolved
- video asset and first-frame evidence
- YouTube metadata
- YouTube advanced settings
- comment package with Coupang Partners disclosure
- target channel hash evidence
- duplicate guard
- quota guard
- approval gate
- result store placeholder

Reports redact raw URLs and full channel IDs. Internal package objects may hold raw source values for later server-only execution, but reports and PR text must not print them.

## Required Advanced Settings

```json
{
  "privacyStatus": "public",
  "selfDeclaredMadeForKids": false,
  "containsSyntheticMedia": true,
  "paidProductPlacementDetails": {
    "hasPaidProductPlacement": true
  },
  "license": "youtube",
  "embeddable": true,
  "publicStatsViewable": true,
  "defaultLanguage": "ko",
  "defaultAudioLanguage": "ko"
}
```

## Fail-Closed Blockers

- `BLOCKED_V073_UPLOAD_PACKAGE_PRODUCT_SOURCE_MISSING`
- `BLOCKED_V073_UPLOAD_PACKAGE_RAW_COUPANG_URL_MISSING`
- `BLOCKED_V073_UPLOAD_PACKAGE_VIDEO_ASSET_MISSING`
- `BLOCKED_V073_UPLOAD_PACKAGE_FIRST_FRAME_MISSING`
- `BLOCKED_V073_UPLOAD_PACKAGE_DISCLOSURE_MISSING`
- `BLOCKED_V073_UPLOAD_PACKAGE_TARGET_CHANNEL_MISSING`
- `BLOCKED_V073_UPLOAD_PACKAGE_DEEPLINK_PENDING`
- `BLOCKED_V073_UPLOAD_PACKAGE_INVALID_MANIFEST`
- `BLOCKED_V073_UPLOAD_PACKAGE_NOT_READY`

## Sanitized Report Evidence

Reports include:

- package id
- channel key
- asset profile
- product source presence and source kind
- product source hash prefix
- raw Coupang URL presence, never the raw URL
- affiliate URL presence, never the raw URL
- video/first-frame presence
- disclosure readiness
- target channel hash prefix
- duplicate guard readiness
- approval required
- upload execution called false
- safe to upload false

## Side Effect Policy

Forbidden in V073:

- `npm run upload:v051:execute`
- YouTube `videos.insert`
- comment create, update, or delete
- visibility changes
- R2 writes
- DB writes
- `product_assets` writes
- commerce-assets/generated media commits
- secret, raw URL, full channel ID, Authorization, or HMAC signature output

Allowed:

- source/test/doc changes
- no-upload package generation report artifacts in local untracked `commerce-assets`
- sanitized PR and Minz-OS status updates
