# V070 V057 Product Source Materializer

## Purpose

V070 adds a no-upload materializer for the v057 corrected reupload path.
It searches existing system-owned product source data and writes the runtime
metadata required by the v068/v069 package contract:

```text
commerce-assets/review/v057/<channel_key>/product-source-v057.json
```

This is local runtime metadata only. It is not committed.

## Default Source Policy

Operators should not manually provide `V051_*_AFFILIATE_URL` or
`V051_*_RAW_COUPANG_URL` as the default path. Those env values remain emergency
overrides or test fixtures only.

The default path is:

1. v057 review package product source metadata
2. Product queue or generated system data
3. Coupang Deeplink API
4. v063 affiliate URL gate
5. v069 upload package readiness

## Command

```bash
V051_UPLOAD_ASSET_PROFILE=v057_corrected_reupload npm run upload:v070:materialize-product-sources
```

On Windows PowerShell:

```powershell
$env:V051_UPLOAD_ASSET_PROFILE="v057_corrected_reupload"
npm run upload:v070:materialize-product-sources
```

## Source Priority

The materializer uses the same authoritative priority family as the v068 source
loader:

1. `v057_review_package_metadata`
2. `product_queue_item` from the local JSON repository queue path
3. `generated_content` from the local JSON repository contents path
4. `previous_import_candidate` from the local JSON repository candidates path
5. `generated_upload_metadata`
6. `n8n_callback_payload`
7. `asset_profile_binding_metadata`
8. `code_fixture_promoted`

`v057_review_package_metadata` and `code_fixture_promoted` are accepted only
when `runtimeSourceApproved` is the boolean value `true`. The string `"true"`
is rejected.

The default generated content storage path is the same path used by the local
JSON repository: `data/contents.json` through `getStoragePaths().contents`.
`data/generated_contents.json` is not a default runtime source.

## Safety

- `npm run upload:v051:execute` is not called.
- YouTube `videos.insert` is not called.
- Comment create/update/delete is not called.
- Visibility is not changed.
- R2, DB, and `product_assets` writes are not performed.
- Raw Coupang URLs, raw affiliate URLs, full channel IDs, secrets, tokens,
  Authorization headers, and signatures are not printed.
- Reports expose only sanitized evidence: presence booleans, source kind, host
  label, hash prefix, length bucket, and side-effect flags.
- `SAFE_TO_UPLOAD` remains `false`.

## Blocker

If the system cannot find all three authoritative product sources, the command
fails closed with:

```text
BLOCKED_V070_AUTHORITATIVE_PRODUCT_SOURCE_NOT_FOUND
```

The next fix is upstream data binding, not manual URL entry.

## Validation

```bash
npm run test -- tests/v070-v057-product-source-materializer.test.ts
npm run test -- tests/v069-v057-upload-package-closeout.test.ts
npm run test -- tests/v068-v057-raw-coupang-url-source-binding.test.ts
npm run test -- tests/v066-coupang-deeplink-affiliate-url-bridge.test.ts
npm run test -- tests/v063-v057-affiliate-url-injection-gate.test.ts
npm run check:mojibake
```
