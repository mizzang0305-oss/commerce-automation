# v071 Upstream Product Source Binding

V071 closes the v057 corrected reupload product-source gap without uploading.

## Decision

The current v057 corrected media package is treated as an orphan package when
the three channel assets exist but no authoritative product source metadata can
prove which Coupang product created each asset.

Do not manually fill raw Coupang URLs or affiliate URLs as the default path.
The default path is:

1. trusted upstream queue/generated-content/review package data
2. `ReviewPackageProductSourceManifest`
3. V070 materializer
4. V069 upload package readiness
5. separate fresh approval before any upload execution

## Manifest Contract

Future corrected review package generation must write this manifest for each
channel:

```text
commerce-assets/review/v057/<channel_key>/product-source-v057.json
```

Required fields:

| Field | Rule |
| --- | --- |
| `packageId` | Non-empty review package identifier |
| `sourceQueueItemId` | Queue provenance when available |
| `sourceGeneratedContentId` | Generated content provenance when available |
| `channelKey` | One of the three allowed channel keys |
| `assetProfile` | Must be `v057_corrected_reupload` |
| `productSourceKind` | Must be `v057_review_package_metadata` |
| `rawCoupangUrl` | Required in file, never printed in reports |
| `productName` | Must match the channel's expected product |
| `selectedAffiliateUrl` | Optional, never printed in reports |
| `sourceEvidenceHash` | Hash evidence for provenance |
| `createdAt` | Creation timestamp |
| `runtimeSourceApproved` | Strict boolean `true` only |
| `rawUrlsRedactedInReport` | Strict boolean `true` only |

String values such as `"true"` are rejected for runtime approval.

## Runtime Behavior

- V070 now reads `product-source-v057.json` before data fallback sources.
- V069 continues to block when product source is missing.
- Orphan v057 packages report:

```text
BLOCKED_V071_V057_ORPHAN_PACKAGE_SOURCE_UNRECOVERABLE
```

## Safety

V071 is no-upload work only:

- no `npm run upload:v051:execute`
- no `videos.insert`
- no comment mutation
- no visibility change
- no R2, DB, or `product_assets` write
- no raw Coupang URL, raw affiliate URL, full channel ID, token, secret, or HMAC output
- `commerce-assets/` artifacts stay uncommitted

## Validation

```bash
npm run test -- tests/v071-upstream-product-source-binding.test.ts
npm run test -- tests/v070-v057-product-source-materializer.test.ts
npm run test -- tests/v069-v057-upload-package-closeout.test.ts
npm run test -- tests/v068-v057-raw-coupang-url-source-binding.test.ts
npm run test -- tests/v066-coupang-deeplink-affiliate-url-bridge.test.ts
npm run test -- tests/v063-v057-affiliate-url-injection-gate.test.ts
npm run check:mojibake
npm run test -- --testTimeout=30000
npm run lint
npm run build
git diff --check
git diff --cached --check
```
