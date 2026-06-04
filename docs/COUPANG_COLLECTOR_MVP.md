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

## Next Steps

Future collector work can add official API integration, budget tracking, and richer risk flags. Those additions must preserve the candidates-only boundary unless a later PR explicitly changes it.
