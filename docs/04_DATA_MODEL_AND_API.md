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

Do not commit `data/*.json`.

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
9. Create `video_render` rows in `worker_jobs`.
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
