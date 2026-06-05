# Candidate Scoring Analytics Dashboard

Candidate scoring analytics is an operator-only decision support view. It summarizes `product_candidates` quality signals and linked artifact QA outcomes without creating production work.

## Scope

- Read candidate score, duplicate, promotion, source trace, and risk flag metadata.
- Group candidates by source keyword, category, source mode, and risk flag.
- Show average score components and simple recommendation hints.
- Optionally correlate promoted candidates with artifact QA pass rates when a promoted queue id has linked assets.

## API

- `GET /api/candidates/analytics`
- `GET /api/candidates/seed-plan`
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

- `/candidates/analytics` renders the full analytics dashboard and the Seed Dry-run Planner panel.
- The main dashboard shows a compact candidate analytics summary.
- The main dashboard shows a compact candidate seed plan summary with a link to `/candidates/analytics#seed-plan`.
- Sidebar navigation includes `Candidate Analytics`.

Analytics copy must stay conservative. Scores are candidate quality proxies only; they do not imply sales outcome, revenue, profit, or guaranteed channel performance.

## Safety Rules

- Recommendations are operator references only.
- Recommendations do not auto-run collectors.
- Filters include date range, keyword, category, risk flag, status, score range, collected mode, collector version, sort, and limit.
- Seed Strategy is copy/export-only candidate planning. It must not create queue rows, worker jobs, upload packages, or platform uploads.
- Analytics does not promote candidates.
- Analytics does not dispatch workers.
- Analytics does not upload or publish anything.
- No service role key, storage secret, worker secret, Authorization header, or AI provider key may appear in API responses or client components.
