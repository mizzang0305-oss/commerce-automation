# Candidate Scoring Analytics Dashboard

Candidate scoring analytics is an operator-only decision support view. It summarizes `product_candidates` quality signals and linked artifact QA outcomes without creating production work.

## Scope

- Read candidate score, duplicate, promotion, source trace, and risk flag metadata.
- Group candidates by source keyword, category, source mode, and risk flag.
- Show average score components and simple recommendation hints.
- Optionally correlate promoted candidates with artifact QA pass rates when a promoted queue id has linked assets.

## API

- `GET /api/candidates/analytics`
  - optional query: `from`, `to`, `keyword`, `category`, `risk_flag`, `status`, `min_score`
  - returns safe aggregate summaries only

The endpoint is read-only. It must not create:

- `product_queue` rows
- `generated_contents`
- `worker_jobs`
- `channel_upload_packages`
- storage artifacts
- platform uploads

Responses include:

```json
{
  "side_effects": {
    "queue_created": false,
    "worker_jobs_created": false,
    "upload_triggered": false
  }
}
```

## UI

- `/candidates/analytics` renders the full analytics dashboard.
- The main dashboard shows a compact candidate analytics summary.
- Sidebar navigation includes `Candidate Analytics`.

Analytics copy must stay conservative. Scores are candidate quality proxies only; they do not imply sales outcome, revenue, profit, or guaranteed channel performance.

## Safety Rules

- Recommendations are operator references only.
- Recommendations do not auto-run collectors.
- Analytics does not promote candidates.
- Analytics does not dispatch workers.
- Analytics does not upload or publish anything.
- No service role key, storage secret, worker secret, Authorization header, or AI provider key may appear in API responses or client components.
