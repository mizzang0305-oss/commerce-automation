# Candidate Seed Dry-run Planner

The Candidate Seed Dry-run Planner turns filtered candidate analytics into a collector payload preview for the next candidate-only collection pass.

It is planning support only. It does not execute collectors, create queue rows, create worker jobs, create render plans, create upload packages, write storage artifacts, or trigger platform uploads.

## API

- `GET /api/candidates/seed-plan`

Supported query parameters:

- Candidate analytics filters: `from`, `to`, `keyword`, `category`, `risk_flag`, `status`, `min_score`, `max_score`, `collected_mode`, `collector_version`, `sort`, `limit`.
- Planner options: `strategy`, `max_keywords`, `limit_per_keyword`, `include_keep`, `include_expand`, `include_review`, `include_avoid`.

Strategies:

- `balanced`
- `high_score`
- `low_duplicate`
- `low_risk`
- `discovery`

Limits are clamped:

- `max_keywords`: default `10`, max `30`.
- `limit_per_keyword`: default `5`, max `20`.

## Response Safety Contract

The response must include explicit false side-effect booleans:

```json
{
  "mode": "candidate_only_dry_run_plan",
  "plan_summary": {
    "collector_execution": false,
    "queue_created": false,
    "worker_jobs_created": false,
    "upload_triggered": false
  },
  "collector_payload_preview": {
    "mode": "dry_run",
    "candidate_only": true,
    "queue_creation_enabled": false,
    "worker_job_creation_enabled": false,
    "upload_enabled": false
  },
  "side_effects": {
    "collector_executed": false,
    "queue_created": false,
    "worker_jobs_created": false,
    "upload_triggered": false
  }
}
```

The endpoint is read-only. It must not call collector code, repository mutation methods, worker APIs, storage clients, Vercel CLI, Supabase CLI, or platform upload APIs.

## UI

`/candidates/analytics#seed-plan` shows:

- strategy selector;
- max keyword and per-keyword limit controls;
- plan summary;
- seed keyword table;
- collector payload JSON preview;
- copy keyword list;
- copy JSON payload;
- export JSON.

Allowed controls are copy/export/preview only. The UI must not show Run Collector, Execute, Promote, Create Queue, Start Worker, or Upload buttons.

## Operator Flow

1. Filter `/candidates/analytics` to the candidate slice you want to inspect.
2. Review the Seed Dry-run Planner panel.
3. Copy or export the candidate-only payload.
4. Review the payload outside production execution.
5. Run any real candidate-only collector flow only through a separately approved operator path.

Production pilot and deployment remain approval-gated. The dry-run planner is not a production smoke, deployment, or collector execution mechanism.
