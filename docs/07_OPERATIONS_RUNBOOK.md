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
py -3.12 --version
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install --upgrade pip
.\.venv\Scripts\pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python worker.py
```

Worker runtime policy:

- Recommended on Windows: Python 3.12.x.
- Accepted: Python 3.11.x through Python 3.12.x.
- Not supported: Python 3.13+ or Python 3.14+.

If Python 3.14 is detected, the startup guard exits before loading config or contacting the web API and prints a setup message. This is a local startup failure, not a worker job success/failure.

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

For local storage, run the worker from `python-worker/`. `LOCAL_STORAGE_BASE_DIR=./outputs/storage` then maps to `C:\Users\LOVE\MyProjects\commerce-automation\python-worker\outputs\storage`. In local/dev smoke runs, the web app reads the same files through `/mock-storage/...`.

`/mock-storage` is local smoke tooling only. In production it returns 404 unless `ENABLE_MOCK_STORAGE_ROUTE=true` is explicitly set for a controlled test environment. Normal production deployments should leave `ENABLE_MOCK_STORAGE_ROUTE` unset and use Supabase Storage, Cloudflare R2, S3, or another real storage URL.

### Windows ffmpeg Setup

`ffmpeg` is required for real MP4 rendering. It is checked when a `video_render` job starts; missing `ffmpeg` does not stop the worker process from starting.

Check the current shell:

```powershell
ffmpeg -version
where.exe ffmpeg
```

Install with `winget`:

```powershell
winget --version
winget search ffmpeg
winget install --id Gyan.FFmpeg --source winget --accept-source-agreements --accept-package-agreements
```

Close every PowerShell window, open a new one, and verify:

```powershell
ffmpeg -version
where.exe ffmpeg
```

Alternative package:

```powershell
winget install --id BtbN.FFmpeg --source winget --accept-source-agreements --accept-package-agreements
```

Manual install:

1. Download a Windows build from the official FFmpeg download page via gyan.dev or BtbN.
2. Extract it so `C:\Tools\ffmpeg\bin\ffmpeg.exe` exists.
3. Add the bin folder to the user PATH:

```powershell
[Environment]::SetEnvironmentVariable(
  "Path",
  [Environment]::GetEnvironmentVariable("Path", "User") + ";C:\Tools\ffmpeg\bin",
  "User"
)
```

4. Restart PowerShell and run `ffmpeg -version`.

If `ffmpeg` is missing, worker startup can still succeed, but `video_render` jobs report failure/retry and the job does not become `completed` or `video_ready`. `sheet_sync` jobs are not blocked by ffmpeg.

## Local Worker E2E Smoke Test

1. Start the web app:

```powershell
npm run dev
```

2. Seed a renderable smoke item:

```powershell
Invoke-RestMethod -Method Post -ContentType "application/json" -Body '{"mode":"worker-smoke"}' http://localhost:3000/api/dev/seed
```

You can also use `/dev/test-lab` and click **워커 스모크용 상품 생성**.

3. Trigger worker dispatch:

```powershell
Invoke-RestMethod -Method Post http://localhost:3000/api/run/next-batch
```

4. Open `/jobs` and confirm a pending `video_render` job for `queue-worker-smoke-001`.
5. Start the Python Worker:

```powershell
cd python-worker
ffmpeg -version
py -3.12 --version
Remove-Item -Recurse -Force .venv -ErrorAction SilentlyContinue
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install --upgrade pip
.\.venv\Scripts\pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python worker.py
```

6. Open `/workers` and confirm the worker heartbeat.
7. Open `/jobs` and confirm the job reaches `completed`.
8. Open `/queue/queue-worker-smoke-001` and confirm:
   - `queue_status=video_ready`
   - `video_url` points to `/mock-storage/rendered-videos/...`
   - thumbnail URL points to `/mock-storage/thumbnails/...`
   - SRT URL points to `/mock-storage/subtitles/...`
   - upload package URL points to `/mock-storage/upload-packages/...`

If the job is `retry_wait` or `failed`, inspect `error_message`. Missing `ffmpeg` is the most common local failure. That is expected and is not fake success. `video_ready` without `video_url` is a bug.

## Run Next Batch

1. Confirm `/settings`:
   - Python Worker enabled.
   - `video_render` allowed.
   - `max_daily_videos` has capacity for the Asia/Seoul business date.
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
