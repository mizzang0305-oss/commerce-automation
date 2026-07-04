# V066 Coupang Deeplink Affiliate URL Bridge

## Purpose

V066 adds a no-upload affiliate URL bridge for the v057 corrected reupload path.
The bridge makes `upload:v051:execute` resolve three channel affiliate URLs before
the v051 mutation executor receives input.

## Resolution Order

1. Use explicit channel affiliate URL env values when all required values are present.
2. For missing channel affiliate URLs, read channel raw Coupang URL env values and call the Coupang Deeplink API.
3. Validate the final three affiliate URLs with the v063 hard gate before any upload adapter can run.

## Required Env Keys

Explicit affiliate URL keys:

- `V051_FATHER_JOBS_AFFILIATE_URL`
- `V051_NEOMAN_MOLEULGEOL_AFFILIATE_URL`
- `V051_LETS_BUY_AFFILIATE_URL`

Raw Coupang URL fallback keys:

- `V051_FATHER_JOBS_RAW_COUPANG_URL`
- `V051_NEOMAN_MOLEULGEOL_RAW_COUPANG_URL`
- `V051_LETS_BUY_RAW_COUPANG_URL`

Coupang Deeplink credential keys:

- `COUPANG_ACCESS_KEY` or `COUPANG_PARTNERS_ACCESS_KEY`
- `COUPANG_SECRET_KEY` or `COUPANG_PARTNERS_SECRET_KEY`

## Safety Behavior

- The bridge does not upload videos.
- The bridge does not create, update, or delete YouTube comments.
- The bridge does not change YouTube visibility.
- The bridge does not write R2, product assets, or DB records.
- Reports only include sanitized readiness evidence: presence booleans, allowed hosts, length buckets, and hash prefixes.
- Reports must not include raw affiliate URLs, raw Coupang URLs, secrets, or signing material.

## Blockers

- `BLOCKED_V066_RAW_COUPANG_URLS_MISSING`
- `BLOCKED_V066_COUPANG_API_CREDENTIALS_MISSING`
- `BLOCKED_V066_COUPANG_DEEPLINK_FAILED`
- `BLOCKED_V057_AFFILIATE_URLS_MISSING`
- `BLOCKED_V057_AFFILIATE_URLS_INVALID`

## Execution Boundary

This PR is code, tests, and documentation only. Do not run `npm run upload:v051:execute`
as part of V066 validation.
