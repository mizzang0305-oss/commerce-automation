# Commerce Automation Control Center

Current baseline: v1.3 worker architecture.

`commerce-automation` is a Next.js admin web service for Coupang affiliate content operations. The web app is the control room: settings, product queue, worker jobs, run logs, generated result URLs, and manual review all live here. Heavy work is delegated to a separate Python Worker that polls the web API and processes only `video_render` and `sheet_sync` jobs.

Public publishing to YouTube, TikTok, or Threads is not implemented. `run_mode` stays `generate_only`, `youtube_upload_enabled` stays `false`, and public upload must not be enabled by default.

## Architecture

- Web Service: Next.js admin app and server API.
- Python Worker: polls worker APIs, claims jobs, sends heartbeat, reports completion/failure.
- Local data adapter: JSON files under `data/` for development.
- Storage: local or S3/R2/Supabase-compatible abstraction used by the worker for generated files.
- n8n: legacy/optional. Nightly scout can still be backed by n8n or another product collector, but `/api/run/next-batch` no longer calls n8n.

## Key Pages

- `/dashboard`: overview and run controls.
- `/queue`: product queue with worker job status.
- `/queue/[id]`: generated result URLs, assets, and manual review controls.
- `/jobs`: worker job list and status filters.
- `/workers`: worker heartbeat/current job view.
- `/runs`: automation run log.
- `/settings`: worker enablement, batch size, max daily videos, allowed job types, and upload safety settings. `max_daily_videos` is counted by the Asia/Seoul business date.

## Worker APIs

Worker APIs are server-to-server only and require `Authorization: Bearer WORKER_API_SECRET`.

- `POST /api/worker/jobs/claim`
- `POST /api/worker/jobs/[id]/heartbeat`
- `POST /api/worker/jobs/[id]/complete`
- `POST /api/worker/jobs/[id]/fail`
- `GET /api/worker/status`

`video_render` completion must include a non-empty `result.video_url`. Without it, the job is not completed and the queue item is not moved to `video_ready`.

## Python Worker

```powershell
cd python-worker
py -3.12 --version
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install --upgrade pip
.\.venv\Scripts\pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python worker.py
```

Supported worker runtime:

- Recommended on Windows: Python 3.12.x.
- Accepted: Python 3.11.x through Python 3.12.x.
- Not supported: Python 3.13+ or Python 3.14+.

The worker checks the interpreter version before loading env config or contacting the web API. On Python 3.14+, it exits locally with a setup message such as `py -3.12 -m venv .venv`; it does not report fake job success or failure to the web app.

Required worker env:

- `WEB_APP_BASE_URL`
- `WORKER_API_SECRET`
- `WORKER_ID`
- `WORKER_JOB_TYPES=video_render,sheet_sync`
- `STORAGE_BACKEND=local` or `s3`/`r2`/`supabase`
- `LOCAL_STORAGE_BASE_DIR` and `STORAGE_LOCAL_BASE_URL` or `PUBLIC_STORAGE_BASE_URL` for local storage, or S3-compatible endpoint/key settings.

## Local Worker E2E Smoke

This flow verifies WebApp -> `worker_jobs` -> Python Worker -> local storage artifact -> queue `video_ready`.

1. Start the web app:

```powershell
npm run dev
```

2. Create a renderable smoke item from `/dev/test-lab` with **워커 스모크용 상품 생성**, or call:

```powershell
Invoke-RestMethod -Method Post -ContentType "application/json" -Body '{"mode":"worker-smoke"}' http://localhost:3000/api/dev/seed
```

3. Trigger next batch:

```powershell
Invoke-RestMethod -Method Post http://localhost:3000/api/run/next-batch
```

4. Confirm `/jobs` shows a pending `video_render` job.
5. Start the Python Worker from `python-worker/` using the Python 3.12 venv commands above.
6. Confirm `/workers` shows heartbeat.
7. Confirm `/jobs` reaches `completed`.
8. Open `/queue/queue-worker-smoke-001` and verify `video_ready`, `video_url`, thumbnail, SRT, and upload package URLs.

For local storage, worker outputs are written under `python-worker/outputs/storage`. In local/dev smoke runs, the web app serves those files under `/mock-storage/...`.

`/mock-storage` is local smoke tooling. It is disabled in production unless `ENABLE_MOCK_STORAGE_ROUTE=true` is explicitly set for a controlled test environment. Normal production deployments should use Supabase Storage, Cloudflare R2, S3, or another real storage backend and should not set `ENABLE_MOCK_STORAGE_ROUTE`.

## Windows ffmpeg Setup

`ffmpeg` is required only when a `video_render` job actually renders an MP4. Missing `ffmpeg` does not stop worker startup, but the `video_render` job must fail/retry safely and must not become `video_ready`.

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

Close every PowerShell window, open a new one, and verify again:

```powershell
ffmpeg -version
where.exe ffmpeg
```

Alternative package:

```powershell
winget install --id BtbN.FFmpeg --source winget --accept-source-agreements --accept-package-agreements
```

Manual install:

1. Open the official FFmpeg download page and choose a Windows build from gyan.dev or BtbN.
2. Extract it so `C:\Tools\ffmpeg\bin\ffmpeg.exe` exists.
3. Add `C:\Tools\ffmpeg\bin` to the user PATH:

```powershell
[Environment]::SetEnvironmentVariable(
  "Path",
  [Environment]::GetEnvironmentVariable("Path", "User") + ";C:\Tools\ffmpeg\bin",
  "User"
)
```

4. Restart PowerShell and run `ffmpeg -version`.

Smoke rerun after installing Python 3.12 and ffmpeg:

```powershell
cd C:\Users\LOVE\MyProjects\commerce-automation\python-worker
ffmpeg -version
py -3.12 --version
Remove-Item -Recurse -Force .venv -ErrorAction SilentlyContinue
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install --upgrade pip
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\python worker.py
```

Safety expectation: `ffmpeg` missing means `video_render` reports `retry_wait` or `failed`; `video_ready` without `video_url` is a bug. Public upload and YouTube/TikTok/Threads posting remain unimplemented.

## Local JSON Tables

The local adapter stores development data in `data/*.json`. Do not commit these files.

- `settings.json`
- `queue.json`
- `contents.json`
- `runs.json`
- `worker_jobs.json`
- `worker_heartbeats.json`
- `product_candidates.json`
- `production_history.json`
- `product_assets.json`

## Safety Rules

- No fake success.
- No public upload by default.
- Do not expose secrets to client components.
- Do not commit `.env.local` or `data/*.json`.
- Do not mark an item ready for manual upload without `selected_affiliate_url`.
- Do not mark an item ready for manual upload without affiliate disclosure text.
- Do not mark `video_render` as `video_ready` without `video_url`.

## Verification

```powershell
npm run test
npm run lint
npm run build
python -m compileall python-worker
```
