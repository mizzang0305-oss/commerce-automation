# Candidate Scoring And Dedupe Hardening

Collectors remain candidate-only. They create or update `product_candidates`; they must not create queue rows, worker jobs, render plans, upload packages, or platform uploads.

## Candidate Metadata

Coupang candidates include:

- `product_key`: deterministic key from product, item, and vendor identifiers.
- `payload.duplicate_key`: explicit duplicate comparison key.
- `candidate_score`: operational priority score.
- `payload.score_breakdown`: safe scoring metadata for operator review. Expected keys include `demand_score`, `price_score`, `content_angle_score`, `risk_penalty`, `duplicate_penalty`, and `final_score`.
- `payload.source_trace`: non-secret source metadata. Expected keys include `source_platform`, `source_keyword`, `collected_mode`, `collected_at`, `collector_version`, normalized product URL, and parsed Coupang IDs.
- `payload.risk_flags`: safe flags such as missing affiliate, missing image, or duplicate state.

## Dedupe Policy

- Tracking query parameters are removed.
- Product, item, and vendor identifiers are retained.
- Same normalized product key is treated as duplicate even when URL query order or tracking noise differs.
- Already queued or already produced candidates remain blocked from promotion.

## Collector Safety Response

Collector responses must include:

```json
{
  "queue_created": false,
  "worker_jobs_created": false,
  "upload_triggered": false
}
```

## Out Of Scope

- No crawling that bypasses login, CAPTCHA, blocking, robots, or terms.
- No protected review text copying.
- No worker dispatch.
- No queue promotion from collector routes.
- No YouTube, TikTok, Threads, or public upload.
