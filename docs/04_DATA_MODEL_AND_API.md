# 04 Data Model And API

## Local JSON Tables

Development storage uses local JSON files under `data/`.

- `settings.json`: automation settings and worker dispatch flags.
- `queue.json`: product queue.
- `contents.json`: generated copy/script/disclosure records.
- `runs.json`: automation run log.
- `worker_jobs.json`: worker job lifecycle.
- `worker_heartbeats.json`: worker liveness/current job.
- `product_candidates.json`: candidate product records.
- `production_history.json`: production events.
- `product_assets.json`: generated artifact URLs.
- `channel_upload_packages.json`: channel-specific manual upload package metadata.

Do not commit `data/*.json`.

## Supabase/Postgres Tables

Production/shared repository storage can use Supabase/Postgres by applying:

```text
supabase/migrations/001_automation_core.sql
supabase/migrations/002_candidate_scoring_fields.sql
supabase/migrations/003_event_calendar_and_planner.sql
supabase/migrations/004_channel_upload_packages.sql
supabase/migrations/005_channel_upload_package_results.sql
```

Tables created by the migration:

- `automation_settings`
- `product_queue`
- `generated_contents`
- `automation_runs`
- `worker_jobs`
- `worker_heartbeats`
- `product_candidates`
- `product_assets`
- `production_history`
- `channel_upload_packages`
- `event_calendar`
- `daily_production_plans`
- `daily_production_plan_items`
- `channel_profiles`

Primary indexes cover queue status/schedule/rank, worker job status/type/queue/created time, run start time, product assets by queue id, and channel upload packages by queue/channel/status. RLS is enabled on all tables, and no anon/authenticated public read/write policies are created. The WebApp uses the service role key only on the server. Browser clients and the Python Worker do not access Supabase directly.

Supabase Storage and R2 object storage are not part of the repository schema. Generated file URLs come from the worker storage backend and are stored in queue fields, `product_assets`, and manual upload package records.

## Planner Tables

`event_calendar` stores event windows and matching hints:

- `event_key`, `event_name`, `event_type`
- `starts_at`, `ends_at`
- `lead_days_min`, `lead_days_max`
- `target_categories`, `target_keywords`, `excluded_keywords`, `platforms`
- `priority`, `seasonality_score`, `status`

`daily_production_plans` and `daily_production_plan_items` store future persisted daily plan output. Planner items reference candidates, optional queue rows, event keys, target channels, rank, status, and reason text.

`channel_profiles` stores manual-only routing metadata. Defaults must keep `upload_enabled=false` and `manual_upload_only=true`. This table does not authorize platform uploads and does not store OAuth tokens.

`channel_upload_packages` stores prepared copy, artifact links, and operator-recorded manual upload outcomes for human-operated channel uploads. Rows must keep `upload_enabled=false` and `manual_upload_only=true`; they do not trigger YouTube, TikTok, or Threads API calls. Result tracking fields such as `uploaded_url`, `uploaded_at`, `uploaded_by`, `upload_notes`, and `platform_upload_status` are manually maintained audit metadata only.

## Planner APIs

### GET /api/events

Returns static event calendar seeds for the requested year.

### GET /api/channels

Returns channel profiles with upload disabled and manual upload only.

### GET /api/planner/daily

Builds a computed daily plan from product candidates, upcoming 7-30 day events, channel profiles, and production history. The endpoint returns YouTube readiness booleans only and does not expose OAuth secrets. It creates no worker jobs.

### POST /api/dev/seed mode=candidate-video-smoke

Creates a single event-sourced candidate with affiliate URL, product key, thumbnail, score, and ready promotion status. This smoke seed creates no queue row and no worker job; promotion, content draft generation, and next-batch remain separate steps.

### POST /api/candidates/import-coupang

Creates or updates one `product_candidates` row from a manually pasted Coupang product URL.

Request fields:

- `product_name` (required)
- `raw_coupang_url` (required, `coupang.com` product detail URL)
- `selected_affiliate_url` (optional, must be a Coupang short affiliate URL when present)
- `thumbnail_url`, `price_now_text`, `category_path` (optional)

Behavior:

1. Normalize the product URL and remove tracking parameters.
2. Build a deterministic `product_key` from product, item, and vendor identifiers when available.
3. Normalize and validate the candidate product image URL when present.
4. Validate the affiliate link and mark missing links as `blocked_missing_affiliate`.
5. Mark missing or invalid product images as review conditions rather than render-ready conditions.
6. Upsert only `product_candidates`.
7. Return `queue_items_created=0` and `worker_jobs_created=0`.

This endpoint does not create `product_queue` rows, does not create `worker_jobs`, and does not call any upload platform API.

### POST /api/collectors/import-csv

Imports CSV rows into `product_candidates`. When the source or URL is Coupang-specific, the import path uses the same URL normalization, affiliate validation, product key, scoring, dedupe, and promotion readiness logic as `POST /api/candidates/import-coupang`.

## worker_jobs

Fields:

- `id`
- `job_type`: `video_render` or `sheet_sync`
- `status`: `pending`, `claimed`, `processing`, `completed`, `failed`, `retry_wait`, `cancelled`
- `product_queue_id`
- `product_candidate_id`
- `priority`
- `payload`
- `result`
- `claimed_by`
- `claimed_at`
- `heartbeat_at`
- `error_message`
- `retry_count`
- `max_retries`
- `created_at`
- `started_at`
- `finished_at`

## Worker APIs

All worker APIs require:

```http
Authorization: Bearer WORKER_API_SECRET
Content-Type: application/json
```

### POST /api/worker/jobs/claim

Worker asks for a job.

Request:

```json
{
  "worker_id": "local-python-worker",
  "job_types": ["video_render", "sheet_sync"]
}
```

Returns one claimable job or `job: null`.

### POST /api/worker/jobs/[id]/heartbeat

Updates job heartbeat and worker heartbeat.

### POST /api/worker/jobs/[id]/complete

Reports result. For `video_render`, `result.video_url` is required. Missing or blank `video_url` returns a non-success response, keeps the job out of `completed`, and does not move the queue item to `video_ready`.

### POST /api/worker/jobs/[id]/fail

Stores a safe error message and moves the job to `retry_wait` while retries remain, otherwise `failed`.

### GET /api/worker/status

Returns worker heartbeats and worker job counts for the `/workers` UI.

## Content Generation API

`POST /api/queue/[id]/generate-content` returns generated content plus safe provider metadata:

- `content_provider`
- `requested_provider`
- `used_fallback`
- `provider_configured`
- `safety_warnings`
- `created_worker_jobs`

`created_worker_jobs` must remain `0`. Missing provider keys, provider errors, or blocked safety checks use template fallback instead of reporting fake AI success.

## Run API

### POST /api/run/next-batch

Creates worker jobs instead of calling n8n.

Behavior:

1. Read settings.
2. Enforce `python_worker_enabled`.
3. Enforce `allowed_worker_job_types` contains `video_render`.
4. Enforce `max_daily_videos`.
5. Select due `scheduled` items by `queue_rank ASC`.
6. Validate affiliate link, disclosure text, script, and image URL.
7. Invalid items become `manual_review`.
8. Valid items become `processing`.
9. Create `video_render` rows in `worker_jobs` with both `image_url` and `thumbnail_url` populated from the queue image URL.
10. Record `AutomationRun`.

No due items returns:

```json
{
  "ok": true,
  "selected_items": 0,
  "created_jobs": 0,
  "message": "처리할 예약 상품이 없습니다."
}
```
