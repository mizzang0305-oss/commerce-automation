# 07 Operations Runbook

## Start Web App

```powershell
npm install
npm run dev
```

Open `http://localhost:3000` or the configured dev URL.

## Configure Web Service

Create `.env.local` from `.env.example`; do not commit it.

Required for worker APIs:

```text
WORKER_API_SECRET=replace-with-local-secret
PUBLIC_APP_BASE_URL=http://localhost:3000
AUTOMATION_STORAGE_ADAPTER=local-json
AUTOMATION_DATA_DIR=./data
```

n8n variables are legacy/optional for Nightly Scout/product collection.

## Start Python Worker

```powershell
cd python-worker
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python worker.py
```

Worker `.env` must include:

```text
WEB_APP_BASE_URL=http://localhost:3000
WORKER_API_SECRET=replace-with-same-secret-as-web
WORKER_ID=local-python-worker
WORKER_JOB_TYPES=video_render,sheet_sync
STORAGE_BACKEND=local
LOCAL_STORAGE_BASE_DIR=./outputs/storage
STORAGE_LOCAL_BASE_URL=http://localhost:3000/mock-storage
PUBLIC_STORAGE_BASE_URL=http://localhost:3000/mock-storage
```

For S3/R2/Supabase-compatible storage, set endpoint, access key, secret key, region, and public base URL.

## Run Next Batch

1. Confirm `/settings`:
   - Python Worker enabled.
   - `video_render` allowed.
   - `max_daily_videos` has capacity.
   - public upload disabled.
2. Confirm due queue items have affiliate link, disclosure text, script, and image URL.
3. Trigger `/api/run/next-batch` or use the dashboard action.
4. Watch `/jobs` for pending/claimed/processing/completed.
5. Watch `/workers` for heartbeat.
6. Check `/queue/[id]` for `video_url`, thumbnail, SRT, and upload package URLs.

## Failure Handling

- `retry_wait`: worker can reclaim later.
- `failed`: inspect `error_message`.
- `manual_review`: item is missing required business/policy data.
- `video_ready` without `video_url` should never occur; treat it as a bug.

## Legacy n8n

Nightly Scout can still be connected to n8n callbacks. Next-batch video rendering must use worker jobs.
