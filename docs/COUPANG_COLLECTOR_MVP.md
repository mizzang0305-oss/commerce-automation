# Coupang Collector MVP

The collector MVP creates product candidates only.

## Scope

- Add `POST /api/candidates/collect-coupang`.
- Accept dry-run keyword input.
- Generate normalized Coupang candidates through the existing candidate normalization and scoring path.
- Store candidates in `product_candidates`.
- Return safe summary fields: created count, duplicate count, risk flags, candidate score, and candidate ids.

## Safety Rules

- Collector execution does not create `product_queue` rows.
- Collector execution does not create `worker_jobs`.
- Collector execution does not create render plans.
- Collector execution does not create channel upload packages.
- Collector execution does not set ready-for-manual-upload state.
- Collector execution does not call YouTube, TikTok, Threads, or any upload API.

## Current Mode

The implemented mode is `dry_run`. It uses deterministic sample candidates from supplied keywords and does not call external Coupang APIs.

## Event-aware Candidate Scout

`src/lib/coupang/eventAwareCandidateScout.ts` adds a mockable event-aware selection layer for the next-product motion flow.

- Builds an Asia/Seoul rolling 30-day window from the current date.
- Uses static calendar and seasonal rules to find near-term commerce events such as rainy season, summer preparation, vacation, camping, school, gift, and holiday seasons.
- Maps the selected event to product-search keyword plans, preferred categories, excluded keywords, and blocked categories.
- Accepts a caller-supplied Coupang product scout function, then imports at most one eligible candidate through the existing `buildCoupangCandidate` normalization path.
- Excludes the baseline candidate and duplicate baseline product keys/names.
- Blocks missing affiliate URLs, missing product images, risky policy categories, smoke/test-style products, and low event relevance before ranking.
- Returns safe summaries with booleans and scores only; it must not print raw affiliate URLs, raw image URLs, authorization headers, tokens, or secrets.

The event-aware scout does not render video, create MP4 files, upload to R2, write `product_assets`, create queue rows, create worker jobs, execute YouTube uploads, call `videos.insert`, or enable public/unlisted upload.

## Next Steps

Future collector work can add official API integration, budget tracking, and richer risk flags. Those additions must preserve the candidates-only boundary unless a later PR explicitly changes it.
