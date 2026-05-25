# 07 Operations Runbook

## Start Web App

```powershell
npm install
npm run dev
```

Open `http://localhost:3000` or the configured dev URL.

## PowerShell UTF-8 Console

If Korean text from local API responses appears corrupted in Windows PowerShell, configure the current shell for UTF-8:

```powershell
.\scripts\dev\powershell-utf8.ps1
```

Equivalent manual commands:

```powershell
chcp 65001
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
```

When checking JSON endpoints, pipe the response through `ConvertTo-Json`:

```powershell
Invoke-RestMethod http://localhost:3000/api/dev/diagnostics | ConvertTo-Json -Depth 8
```

If PowerShell still shows mojibake, open the endpoint in a browser and prefer Windows Terminal with PowerShell 7 for smoke runs.

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

## Repository Adapter Selection

Default local development uses ignored JSON files:

```text
AUTOMATION_REPOSITORY_ADAPTER=local-json
AUTOMATION_STORAGE_ADAPTER=local-json
AUTOMATION_DATA_DIR=./data
```

For Supabase/Postgres shared state:

1. Create a Supabase project.
2. Apply `supabase/migrations/001_automation_core.sql`.
3. Set server-only env values in `.env.local` or the deployment secret store:

```text
AUTOMATION_REPOSITORY_ADAPTER=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=replace-with-service-role-key
```

4. Run `npm run test`, `npm run lint`, and `npm run build`.

Do not expose `SUPABASE_SERVICE_ROLE_KEY` to client code. The Python Worker still polls the WebApp API and does not need Supabase DB credentials. Artifact storage is configured separately in the Python Worker.

## Development API Guard

`/api/dev/seed`, `/api/dev/reset-storage`, and `/api/dev/reset-settings` are for local or sandbox testing. In production they return `404` unless `ENABLE_DEV_TOOLS=true` is explicitly set.

Use `ENABLE_DEV_TOOLS=true` only in a controlled sandbox. Do not enable it for normal production deployments, especially when `AUTOMATION_REPOSITORY_ADAPTER=supabase` points at shared state. `/api/dev/diagnostics` remains read-only and should show configured booleans only.

## OSS Foundation Notes

- `imageio-ffmpeg` is part of the default Python Worker install and provides a bundled ffmpeg executable fallback.
- Recharts powers the dashboard/jobs analysis charts.
- TanStack Table powers the first `/queue` and `/jobs` table upgrade: client-side search, status/type/issue filters, sorting, and pagination.
- shadcn/ui was inspected with the CLI, but `init` is deferred because the project has Tailwind v4 and no existing `components.json`.
- MoviePy is optional in `python-worker/requirements-video.txt`.
- Crawlee Python and Playwright are optional in `python-worker/requirements-collector.txt`; collectors must not bypass login, CAPTCHA, blocking, terms, or copy protected review text.

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

For S3/R2/Supabase-compatible storage, set endpoint, access key, secret key, region, and public base URL. The worker uploads artifacts and returns URLs to the WebApp; it does not write directly to Supabase DB.

Supabase Storage via S3 protocol:

```text
STORAGE_BACKEND=supabase
SUPABASE_STORAGE_ENDPOINT_URL=https://project-ref.storage.supabase.co/storage/v1/s3
SUPABASE_STORAGE_ACCESS_KEY_ID=replace-with-storage-access-key
SUPABASE_STORAGE_SECRET_ACCESS_KEY=replace-with-storage-secret-key
SUPABASE_STORAGE_REGION=us-east-1
SUPABASE_STORAGE_PUBLIC_BASE_URL=https://project-ref.supabase.co/storage/v1/object/public
```

Use Supabase-generated storage access keys. Do not put `SUPABASE_SERVICE_ROLE_KEY` in `python-worker/.env`.

Cloudflare R2:

```text
STORAGE_BACKEND=r2
R2_ENDPOINT_URL=https://account-id.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=replace-with-r2-access-key
R2_SECRET_ACCESS_KEY=replace-with-r2-secret-key
R2_REGION=auto
R2_PUBLIC_BASE_URL=https://cdn.example.com
```

For local storage, run the worker from `python-worker/`. `LOCAL_STORAGE_BASE_DIR=./outputs/storage` then maps to `C:\Users\LOVE\MyProjects\commerce-automation\python-worker\outputs\storage`. In local/dev smoke runs, the web app reads the same files through `/mock-storage/...`.

`/mock-storage` is local smoke tooling only. In production it returns 404 unless `ENABLE_MOCK_STORAGE_ROUTE=true` is explicitly set for a controlled test environment. Normal production deployments should leave `ENABLE_MOCK_STORAGE_ROUTE` unset and use Supabase Storage, Cloudflare R2, S3, or another real storage URL.

### Windows ffmpeg Setup

`ffmpeg` is required for real MP4 rendering. It is checked when a `video_render` job starts; missing `ffmpeg` does not stop the worker process from starting.

Resolution order:

1. `IMAGEIO_FFMPEG_EXE`
2. `imageio-ffmpeg`
3. system `PATH`

System ffmpeg is optional when `imageio-ffmpeg` resolves correctly, but installing it is recommended for smoke verification, performance checks, and easier local diagnostics.

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

Optional worker dependency sets:

```powershell
.\.venv\Scripts\pip install -r requirements-video.txt
.\.venv\Scripts\pip install -r requirements-collector.txt
```

Use `requirements-video.txt` only when testing MoviePy-based video templates. Use `requirements-collector.txt` only for future collector work, not for the default worker.

## Collector Foundation

The first collector path is intentionally conservative:

1. Import CSV links through `POST /api/collectors/import-csv` in a sandbox/dev session.
2. Store rows as `product_candidates`.
3. Review and promote candidates in a later workflow.
4. Do not create `video_render` jobs directly from collectors.

Example request:

```powershell
Invoke-RestMethod -Method Post -ContentType "application/json" `
  -Body '{"source":"manual_csv","csv":"product_name,url,selected_affiliate_url`nDeal,https://example.com/deal,https://link.coupang.com/a/deal"}' `
  http://localhost:3000/api/collectors/import-csv
```

The endpoint is guarded like other development import tools. In production it returns `404` unless `ENABLE_DEV_TOOLS=true` is explicitly set for a controlled sandbox. Collector rules:

- use public pages or official APIs only;
- do not bypass login, CAPTCHA, bot blocking, or terms;
- do not copy protected review text;
- treat missing Coupang API credentials as a safe skip;
- keep candidates in `product_candidates` until a human or later promotion workflow validates them.

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
