# Candidate Analytics Filters And Seed Strategy

Candidate Analytics filters help operators find useful candidate seeds without changing production state.

## Read-Only Boundary

- `/api/candidates/analytics` is read-only.
- Filters do not create product queue rows.
- Filters do not create worker jobs.
- Filters do not promote candidates.
- Filters do not run collectors.
- Filters do not trigger upload package creation or platform upload.

The response includes explicit side-effect booleans:

```json
{
  "queue_created": false,
  "worker_jobs_created": false,
  "upload_triggered": false,
  "collector_executed": false
}
```

## Supported Filters

- `from`, `to`: `YYYY-MM-DD` date range.
- `keyword`: partial source keyword match.
- `category`: partial category match.
- `risk_flag`: exact risk flag.
- `status`: `all`, `collected`, `scored`, `duplicate`, `manual_review`, `rejected`, or `promoted`.
- `min_score`, `max_score`: clamped to `0..100`; invalid ranges return a safe validation error.
- `collected_mode`: `all`, `dry_run`, `api`, `manual`, or source-specific mode.
- `collector_version`: source trace version.
- `sort`: `newest`, `oldest`, `final_score_desc`, `final_score_asc`, `duplicate_rate_desc`, or `risk_rate_desc`.
- `limit`: default `50`, max `200`.

The response returns both `applied_filters` and `available_filters` so operators can see exactly what was used.

## Seed Strategy

Seed strategy is candidate-only guidance. It groups keywords into:

- `keep_keywords`
- `expand_keywords`
- `review_keywords`
- `avoid_keywords`
- `risk_flags_to_watch`

Copy/export controls are allowed. Run-collector, auto-collect, promote, queue creation, worker dispatch, and upload actions are not part of this workflow.

## Seed Dry-run Planner

`GET /api/candidates/seed-plan` and `/candidates/analytics#seed-plan` use the same analytics filters to build a candidate-only dry-run collector payload preview.

The planner supports `balanced`, `high_score`, `low_duplicate`, `low_risk`, and `discovery` strategies. It clamps `max_keywords` to `30` and `limit_per_keyword` to `20`.

Planner output includes a keyword list, JSON payload preview, copy controls, and export JSON. It must always keep:

- `candidate_only=true`
- `queue_creation_enabled=false`
- `worker_job_creation_enabled=false`
- `upload_enabled=false`
- `collector_executed=false`

The planner is not a collector executor and is not a production smoke path. See `docs/CANDIDATE_SEED_DRY_RUN_PLANNER.md`.
