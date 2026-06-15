# Coupang Scout Compatibility Diagnostics

This project treats Coupang real-product scouting as a request-contract problem before it treats it as a candidate-import problem.

## Current Scope

- Diagnose request compatibility for Coupang Partners affiliate product search.
- Normalize bounded scout keywords deterministically.
- Classify safe Coupang API failures.
- Keep real product auto-pilot errors distinct from missing candidate errors.

This diagnostic layer does not import candidates, create queue rows, create worker jobs, upload to R2, execute YouTube uploads, or enable public upload.

## Endpoint Family

The real product scout path is intended for the Coupang Partners affiliate API family.

- `partners_affiliate`: eligible for affiliate product scout request contracts.
- `seller_openapi`: blocked for this scout path because seller/WING operations are not the affiliate product search contract.
- `unknown`: blocked until explicitly configured.

Blocked endpoint family responses use `COUPANG_SCOUT_ENDPOINT_FAMILY_MISMATCH`.

## Keyword Handling

The compatibility helper:

- trims whitespace,
- rejects empty keywords,
- rejects one-character keywords,
- allows Hangul, English letters, numbers, and spaces,
- encodes with `encodeURIComponent`,
- limits diagnostic attempts to three keyword labels,
- never prints raw keywords in safe diagnostic payloads.

The HMAC signing contract should sign the path plus encoded query string without a leading `?`.

## Safe Error Classes

HTTP success with a Coupang business error is not success. In particular:

- `keyword is invalid` -> `COUPANG_SCOUT_KEYWORD_INVALID`
- `invalid signature` -> `COUPANG_SCOUT_AUTH_SIGNATURE_INVALID`
- `specified signature is expired` -> `COUPANG_SCOUT_AUTH_SIGNATURE_EXPIRED`
- `not allowed ip` -> `COUPANG_SCOUT_AUTH_IP_NOT_ALLOWED`
- unknown `code=400` -> `COUPANG_SCOUT_UNKNOWN_400`

The response must not include secrets, raw Authorization headers, raw HMAC material, or raw full URLs.

## Auto Pilot Contract

When a safe scout diagnostic is available and no valid real candidate exists, `/api/uploads/youtube/real-product-pilot/auto-prepare` can return the `COUPANG_SCOUT_*` error instead of collapsing the failure into `AUTO_REAL_PRODUCT_REQUIRED`.

This keeps the next action precise:

- scout contract failure -> fix endpoint/keyword/auth compatibility;
- no candidate after a successful scout -> collect or import a valid candidate.

After a scout succeeds and a candidate has been imported, importer-shape failures are also reported separately from `AUTO_REAL_PRODUCT_REQUIRED`.

- `COUPANG_IMPORT_AFFILIATE_URL_FIELD_MISSING`
- `COUPANG_IMPORT_AFFILIATE_URL_INVALID`
- `COUPANG_IMPORT_IMAGE_URL_FIELD_MISSING`
- `COUPANG_IMPORT_IMAGE_URL_INVALID`
- `COUPANG_IMPORT_RESPONSE_SHAPE_UNSUPPORTED`

These safe responses expose field-presence summaries and blocked reasons only. They must not print raw affiliate URLs, raw image URLs, Coupang access keys, Authorization headers, HMAC material, or full request URLs.

## Live Diagnostic Gate

Live Coupang scout compatibility diagnostics are not run by default. Use a separate explicit operator approval before any live call:

```text
RUN_COUPANG_SCOUT_COMPATIBILITY_DIAGNOSTIC_ONCE
```

Live diagnostic limits:

- at most one run,
- at most three keywords,
- no retry loop,
- no DB write,
- no candidate import,
- no YouTube execute,
- no public upload.
