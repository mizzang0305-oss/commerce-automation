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
- `/settings`: worker enablement, batch size, max daily videos, allowed job types, and upload safety settings.

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
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python worker.py
```

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

2. Create a renderable smoke item from `/dev/test-lab` with **Worker smoke 상품 생성**, or call:

```powershell
Invoke-RestMethod -Method Post -ContentType "application/json" -Body '{"mode":"worker-smoke"}' http://localhost:3000/api/dev/seed
```

3. Trigger next batch:

```powershell
Invoke-RestMethod -Method Post http://localhost:3000/api/run/next-batch
```

4. Confirm `/jobs` shows a pending `video_render` job.
5. Start the Python Worker from `python-worker/`.
6. Confirm `/workers` shows heartbeat.
7. Confirm `/jobs` reaches `completed`.
8. Open `/queue/queue-worker-smoke-001` and verify `video_ready`, `video_url`, thumbnail, SRT, and upload package URLs.

For local storage, worker outputs are written under `python-worker/outputs/storage`. The web app serves those files under `/mock-storage/...`.

If `ffmpeg` is missing, `video_render` fails/retries. That is expected and is not treated as success.

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
