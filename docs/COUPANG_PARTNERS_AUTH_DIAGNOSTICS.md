# Coupang Partners Auth Diagnostics

This note documents the safe diagnosis path for the event-aware live Coupang
scout after the first approved live attempt stopped at:

```text
COUPANG_PARTNERS_API_HTTP_401
```

No automatic retry is allowed after this blocker. A future live scout must have
fresh explicit approval and must be exactly one scout/import attempt unless a
later prompt changes that boundary.

## Sanitized Local Config Check

Latest safe check, 2026-06-23 KST:

```text
env_file_present=true
partners_provider_enabled=false
access_key_present=true
secret_key_present=true
customer_id_or_partner_id_present=false
```

Only booleans are recorded. Do not print access keys, secret keys, customer ids,
partner ids, Authorization headers, HMAC signatures, raw API URLs, raw affiliate
URLs, raw image URLs, or `.env.local` contents.

## Network-Free Self-Test

`src/lib/coupang/partnersAuthConfig.ts` is the shared source for Coupang
Partners env readiness and live search request construction. Readiness
diagnostics and the live request builder must both use this shared reader so the
provider-enabled gate, access/secret key family, and customer/partner id
presence cannot drift.

The shared reader accepts the same key families for both readiness and request
building:

- `COUPANG_PARTNERS_PROVIDER_ENABLED`
- `COUPANG_PARTNERS_ACCESS_KEY` or legacy `COUPANG_ACCESS_KEY`
- `COUPANG_PARTNERS_SECRET_KEY` or legacy `COUPANG_SECRET_KEY`
- `COUPANG_CUSTOMER_ID`, `COUPANG_PARTNER_ID`, or
  `COUPANG_PARTNERS_CUSTOMER_ID`

If any required readiness boolean is false, the live request builder returns a
safe blocker before any Coupang Partners API call is allowed.

`src/lib/coupang/partnersAuthDiagnostics.ts` provides a deterministic self-test
using dummy credentials only. It checks:

- signature builder is present
- method, request path, query, and timestamp are present
- timestamp uses the Coupang signed-date shape
- canonicalized signing input does not contain `undefined`
- raw secret, raw signature, and Authorization header values are not returned

This self-test does not call Coupang Partners or any external scout provider.

## Live Request Builder Alignment

The live search request builder blocks before external calls when:

```text
COUPANG_PARTNERS_PROVIDER_DISABLED
COUPANG_PARTNERS_ACCESS_KEY_MISSING
COUPANG_PARTNERS_SECRET_KEY_MISSING
COUPANG_PARTNERS_CUSTOMER_OR_PARTNER_ID_MISSING
COUPANG_PARTNERS_KEYWORD_MISSING
COUPANG_PARTNERS_SIGNED_DATE_INVALID
```

The n8n nightly scout request builder uses the same env contract and stops
before the Coupang Product Search HTTP node when the provider flag, key pair, or
customer/partner id is missing. Safe summaries may include booleans and
presence flags only; they must not include raw credentials, ids, Authorization
headers, HMAC signatures, or raw request URLs.

## HTTP 401 Guard

When a live scout receives HTTP 401:

```text
blocker=COUPANG_PARTNERS_API_HTTP_401
candidate_import_attempted=false
candidate_created=false
candidate_updated=false
auto_retry_attempted=false
requires_fresh_approval=true
render_attempted=false
R2_uploaded=false
YouTube_Execute=false
```

The scout must stop before candidate import, render, MP4 creation, R2 upload,
`product_assets` write, YouTube Execute, `videos.insert`, public upload, or
unlisted upload.

## Baseline Exclusion Guard

The live event-aware scout must prove baseline exclusion before collecting,
ranking, or importing candidates.

```text
baseline_candidate_id=candidate-490aa6d25e8ea89d
baseline_candidate_excluded=true
```

If baseline exclusion is not proven, the scout stops with:

```text
BASELINE_CANDIDATE_EXCLUSION_NOT_PROVEN
```

This prevents a failure report from showing `baseline_candidate_excluded=false`
only because no candidate was selected after an upstream auth failure.

## Next Action

Fix or refresh Coupang Partners authorization outside the repository, then rerun
the event-aware live scout/import gate only with fresh explicit approval.
