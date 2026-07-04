# V068 V057 Raw Coupang URL Source Binding

## Purpose

V068 adds a no-upload runtime contract for the v057 corrected reupload path.
The default production path is:

1. v057 product source metadata
2. Coupang Deeplink API
3. generated affiliate URL
4. v063 affiliate URL hard gate
5. v051 mutation executor input

Manual affiliate URL and raw Coupang URL env values remain emergency or test
overrides only. They are not the default operating path.

## Metadata Contract

Each channel can provide a product source metadata file under its v057 review
package. The primary filename is:

```text
commerce-assets/review/v057/<channel_key>/product-source-v057.json
```

Required contract fields:

- `channelKey`
- `assetProfile`
- `productSourceKind`
- `rawCoupangUrl`
- `productName` or `sourceProductLabel`
- `sourceEvidenceHash`
- `updatedAt` or `boundAt`

The `assetProfile` value must be `v057_corrected_reupload`.

## Source Priority

The loader checks these source kinds in priority order:

1. `product_queue_item`
2. `generated_content`
3. `previous_import_candidate`
4. `v057_review_package_metadata`
5. `generated_upload_metadata`
6. `n8n_callback_payload`
7. `asset_profile_binding_metadata`
8. `code_fixture_promoted`

Test-only fixtures are rejected unless explicitly promoted as runtime sources
and still pass channel, profile, product, host, placeholder, and evidence checks.

## Safety

- No YouTube upload is executed by this PR.
- No YouTube comment mutation is executed by this PR.
- No visibility change is executed by this PR.
- No R2, DB, or `product_assets` write is executed by this PR.
- Reports must not serialize raw Coupang URLs, generated affiliate URLs, secrets,
  authorization headers, or signing material.
- Reports only expose sanitized evidence: presence, source kind, host label,
  hash prefix, length bucket, and booleans.

## Blocker

When authoritative v057 product source metadata is missing or invalid, the path
must fail closed with:

```text
BLOCKED_V068_AUTHORITATIVE_RAW_COUPANG_URL_SOURCE_MISSING
```

## Validation

The focused validation entrypoint is:

```text
npm run test -- tests/v068-v057-raw-coupang-url-source-binding.test.ts
```

The broader no-upload regression set should also include v066, v063, v059, and
v058 upload safety tests.
