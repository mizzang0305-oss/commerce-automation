# V063 V057 Affiliate URL Injection Gate

## Purpose

V063 blocks the v057 corrected reupload execution before any YouTube mutation unless all three channel affiliate URLs are injected into the v051 mutation executor.

## Runtime Source

The execution CLI reads these server-only keys from process env or `.env.local`:

| Channel | Env key |
| --- | --- |
| father_jobs | `V051_FATHER_JOBS_AFFILIATE_URL` |
| neoman_moleulgeol | `V051_NEOMAN_MOLEULGEOL_AFFILIATE_URL` |
| lets_buy | `V051_LETS_BUY_AFFILIATE_URL` |

Values are passed to `executeV051MutationEnabledUploads` as `affiliateUrls`.

## Gate

The mutation executor validates the URL set before upload adapter calls:

- all three URLs must be present
- values must be HTTPS URLs
- v057 corrected reupload requires the allowed affiliate host
- missing values return `BLOCKED_V057_AFFILIATE_URLS_MISSING`
- invalid values return `BLOCKED_V057_AFFILIATE_URLS_INVALID`

The executor no longer falls back to an empty affiliate URL for comment creation.

## Sanitized Evidence

Reports include only sanitized URL evidence:

- presence
- allowed host
- length bucket
- short hash prefix

Reports must not include raw affiliate URLs, tokens, Authorization headers, or secrets.

## Safety Boundary

This change is code, tests, docs, and PR only.

No `npm run upload:v051:execute`, real YouTube API mutation, `videos.insert`, comment create/update/delete, visibility change, R2 upload, product asset write, DB write, deploy, or generated media commit is part of V063.
