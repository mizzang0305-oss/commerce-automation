# Commerce Automation Control Center

Current baseline: v1.4 worker architecture with optional Supabase/Postgres repository adapter.

`commerce-automation` is a Next.js admin web service for Coupang affiliate content operations. The web app is the control room: settings, product queue, worker jobs, run logs, generated result URLs, and manual review all live here. Heavy work is delegated to a separate Python Worker that polls the web API and processes only `video_render` and `sheet_sync` jobs.

Public publishing to YouTube, TikTok, or Threads is not implemented. `run_mode` stays `generate_only`, `youtube_upload_enabled` stays `false`, and public upload must not be enabled by default.

## Architecture

- Web Service: Next.js admin app and server API.
- Python Worker: polls worker APIs, claims jobs, sends heartbeat, reports completion/failure.
- Local data adapter: JSON files under `data/` for development.
- Supabase/Postgres adapter: optional shared repository for production, cloud, and multi-PC operation.
- Storage: local or S3/R2/Supabase-compatible abstraction used by the worker for generated files.
- n8n: legacy/optional. Nightly scout can still be backed by n8n or another product collector, but `/api/run/next-batch` no longer calls n8n.

## Repository Adapters

The WebApp talks to a repository contract. The Python Worker still polls the WebApp API and does not connect to Supabase directly.

- `local-json`: default development adapter using ignored `data/*.json` files.
- `supabase`: server-only Supabase/Postgres adapter for shared cloud state.

Select the adapter with either:

```text
AUTOMATION_REPOSITORY_ADAPTER=local-json
AUTOMATION_STORAGE_ADAPTER=local-json
```

For Supabase/Postgres:

```text
AUTOMATION_REPOSITORY_ADAPTER=supabase
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Apply `supabase/migrations/001_automation_core.sql` and `supabase/migrations/002_candidate_scoring_fields.sql` to the Supabase project before switching the adapter. `SUPABASE_SERVICE_ROLE_KEY` is server-only; never add a `NEXT_PUBLIC_` prefix and never expose it to client components. Artifact storage is configured separately in the Python Worker and should use storage-specific credentials.

Use `docs/SUPABASE_VERIFICATION.md` and `docs/sql/verify_supabase_core.sql` to verify table creation, Row Level Security, public policies, default settings, Supabase worker smoke, and live artifact storage before treating a sandbox as production-ready.

## PowerShell UTF-8 Console

If Korean text from `Invoke-RestMethod` looks corrupted in Windows PowerShell, configure the current shell for UTF-8 before running smoke commands:

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

For JSON API checks, prefer:

```powershell
Invoke-RestMethod http://localhost:3000/api/dev/diagnostics | ConvertTo-Json -Depth 8
```

If the terminal still displays mojibake, verify the same endpoint in a browser such as `http://localhost:3000/api/dev/diagnostics`. Windows Terminal with PowerShell 7 is recommended for repeated smoke verification.

To distinguish a console rendering problem from a corrupted source string, inspect files with Python using `encoding="utf-8"` and `repr(...)`. If Python shows valid Korean but PowerShell displays mojibake, fix the console/session rather than changing source text.

## Development API Guard

Development mutation routes are local/sandbox tooling:

- `POST /api/dev/seed`
- `POST /api/dev/reset-storage`
- `POST /api/dev/reset-settings`

In production they return `404` by default. Set `ENABLE_DEV_TOOLS=true` only for a controlled sandbox test, never for normal production operation. `/api/dev/diagnostics` remains read-only and returns configured booleans only; it must not expose raw Supabase URLs, service role keys, worker secrets, or Authorization headers.

## OSS Foundation

- `imageio-ffmpeg`: bundled ffmpeg executable fallback for Python Worker `video_render`.
- `recharts`: dashboard/jobs operational charts.
- `@tanstack/react-table`: powers the first high-volume `/queue` and `/jobs` table upgrade with client-side search, filters, sorting, and pagination.
- `shadcn/ui`: evaluated with `npx shadcn@latest info`. This project has Tailwind v4 without an existing `components.json`, so shadcn `init` is deferred to avoid broad config churn.
- `moviepy`: optional video-template dependency in `python-worker/requirements-video.txt`; not part of the default worker install.
- `crawlee` and `playwright`: optional collector dependencies in `python-worker/requirements-collector.txt`; not part of the default worker install.

## Collector Foundation

Collectors only create `product_candidates`; they do not create worker jobs or mark products ready for upload. The first supported path is a guarded CSV import endpoint:

- `POST /api/collectors/import-csv`
- body: `{ "source": "manual_csv", "csv": "product_name,url,selected_affiliate_url\n..." }`
- production behavior: blocked by default through the dev route guard unless `ENABLE_DEV_TOOLS=true`.

The MVP operator path also supports direct Coupang candidate input from `/candidates`:

- `POST /api/candidates/import-coupang`
- body fields: `product_name`, `raw_coupang_url`, optional `selected_affiliate_url`, `thumbnail_url` or payload image URL, `price_now_text`, and `category_path`.
- `raw_coupang_url` must be a `coupang.com` product detail URL. Tracking parameters are removed while product/item/vendor identifiers are retained for deterministic `product_key` creation.
- `selected_affiliate_url` is validated as a Coupang short affiliate link. Missing affiliate links are stored as candidates but remain blocked from queue promotion.
- product image URLs must be `http`/`https` and look usable for worker download. Non-web schemes and missing image URLs keep the candidate in review instead of letting it become renderable.
- This endpoint creates zero `product_queue` rows and zero `worker_jobs`.

CSV rows must include a product name and an `http`/`https` source URL. Non-web schemes such as `javascript:`, `file:`, or empty URLs are rejected. Optional Python collector helpers live under `python-worker/src/collectors/` for CSV/XLSX link import and future public-page/API collectors. Collector work must not bypass login, CAPTCHA, blocking, terms, or copy protected review text.

Imported candidates now receive quality-control fields before they are promoted:

- `product_key`: deterministic dedupe key. Coupang uses product/item/vendor identifiers when present, Musinsa uses `goods_no` or URL IDs, and other sources use normalized URL/name hashes.
- `candidate_score`: 0-100 score based on affiliate link, product name, image, price, discount, review/rating, source type, and known platform signals.
- `image_readiness_status`: `ready`, `missing_image`, or `invalid_image_url`; candidates without a usable image cannot be promoted to a renderable queue item.
- `duplicate_status`: `unique`, `duplicate_candidate`, `already_queued`, `already_produced`, or `unknown`.
- `promotion_status`: `ready`, `blocked_missing_affiliate`, `blocked_missing_name`, `blocked_duplicate`, `needs_review`, or `promoted`.

The `/candidates` page shows these fields so operators can sort by score, filter blocked rows, inspect dedupe reasons, and promote only ready candidates. Promotion creates a scheduled `product_queue` row plus a generated-content scaffold, and propagates the selected candidate image into `product_queue.thumbnail_url`; it never creates `worker_jobs`. Worker jobs remain the responsibility of `/api/run/next-batch`.

Promoted queue items can receive a safe template draft before worker dispatch:

- `POST /api/queue/[id]/generate-content`
- requires `product_name`, `selected_affiliate_url`, and `thumbnail_url`.
- fills `video_title`, `video_script`, captions, hashtags, YouTube/TikTok text, and affiliate disclosure when missing.
- preserves existing manual content fields instead of overwriting them.
- does not create `worker_jobs`; run `/api/run/next-batch` after content review.
- avoids hard claims such as guaranteed results, lowest-price assertions, medical/health efficacy claims, and copied review text.

## Event-Driven Production Planner

The planner foundation turns collected candidates into a daily production shortlist before queue promotion and worker dispatch.

- `/planner`: shows the current daily plan, upcoming 7-30 day event window, and channel routing.
- `GET /api/events`: returns the static event calendar seed for the selected year.
- `GET /api/channels`: returns manual-only YouTube channel profiles.
- `GET /api/planner/daily`: computes a safe daily plan from `product_candidates`, upcoming events, and channel profiles.
- `POST /api/dev/seed` with `{ "mode": "candidate-video-smoke" }`: creates a repeatable candidate-to-video smoke candidate.

The planner does not create `worker_jobs`. Candidate promotion creates a scheduled queue row and generated-content scaffold, content draft generation fills script/copy fields, and `/api/run/next-batch` remains the only route that creates worker jobs.

Channel profiles are routing metadata only. Defaults use `upload_enabled=false` and `manual_upload_only=true`; YouTube OAuth readiness may be displayed as configured booleans, but no upload flow or `videos.insert` call is implemented.

Apply `supabase/migrations/003_event_calendar_and_planner.sql` when using Supabase and you want the planner tables available for future persisted event/channel/plan records. Apply `supabase/migrations/004_channel_upload_packages.sql` and `supabase/migrations/005_channel_upload_package_results.sql` to store channel-specific manual upload packages and manual upload result tracking. RLS is enabled and no public anon/authenticated policies are created.

## Key Pages

- `/dashboard`: overview and run controls.
- `/queue`: product queue with worker job status.
- `/queue/[id]`: generated result URLs, assets, content draft action, channel upload package action, and manual review controls.
- `/planner`: event-driven daily production plan and manual-only channel routing.
- `/jobs`: worker job list with status/type/error filters, sorting, and pagination.
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

`video_render` job payloads must include a downloadable product image through `image_url` or `thumbnail_url`. `/api/run/next-batch` blocks queue items without a product image and moves them to manual review rather than creating a worker job.

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

### Product Image Render Safety

For `video_render`, the worker accepts `payload.image_url` first and falls back to `payload.thumbnail_url`. It downloads the image with a bounded timeout, requires a successful HTTP 200 response, requires an `image/*` content type, and rejects empty image bodies. Image download failures become worker job fail/retry results; they must not upload placeholder artifacts, complete the job, or mark the queue item `video_ready`.

Rendered videos use a fixed 1080x1920 vertical layout. The renderer scales and pads product imagery into that frame and burns generated SRT captions into the output. Thumbnail generation also targets 1080x1920 and wraps long product titles so the preview remains usable for manual upload package review.

Required worker env:

- `WEB_APP_BASE_URL`
- `WORKER_API_SECRET`
- `WORKER_ID`
- `WORKER_JOB_TYPES=video_render,sheet_sync`
- `STORAGE_BACKEND=local` or `s3`/`r2`/`supabase`
- `LOCAL_STORAGE_BASE_DIR` and `STORAGE_LOCAL_BASE_URL` or `PUBLIC_STORAGE_BASE_URL` for local storage, or S3-compatible endpoint/key settings.

### Artifact Storage

Generated MP4, thumbnail, SRT, upload package, and sheet export files are uploaded by the Python Worker. The WebApp stores only the returned URLs in DB fields and `product_assets`.

Local smoke mode:

```text
STORAGE_BACKEND=local
LOCAL_STORAGE_BASE_DIR=./outputs/storage
PUBLIC_STORAGE_BASE_URL=http://localhost:3000/mock-storage
```

Supabase Storage uses its S3-compatible endpoint and generated storage access keys. Do not reuse `SUPABASE_SERVICE_ROLE_KEY` as a worker storage secret:

```text
STORAGE_BACKEND=supabase
SUPABASE_STORAGE_ENDPOINT_URL=https://project-ref.storage.supabase.co/storage/v1/s3
SUPABASE_STORAGE_ACCESS_KEY_ID=replace-with-storage-access-key
SUPABASE_STORAGE_SECRET_ACCESS_KEY=replace-with-storage-secret-key
SUPABASE_STORAGE_REGION=us-east-1
SUPABASE_STORAGE_PUBLIC_BASE_URL=https://project-ref.supabase.co/storage/v1/object/public
```

Cloudflare R2 or another S3-compatible backend can use either the generic `S3_*` values or the `R2_*` aliases:

```text
STORAGE_BACKEND=r2
R2_ENDPOINT_URL=https://account-id.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=replace-with-r2-access-key
R2_SECRET_ACCESS_KEY=replace-with-r2-secret-key
R2_REGION=auto
R2_PUBLIC_BASE_URL_RENDERED_VIDEOS=https://pub-video.r2.dev
R2_PUBLIC_BASE_URL_THUMBNAILS=https://pub-thumb.r2.dev
R2_PUBLIC_BASE_URL_SUBTITLES=https://pub-subtitle.r2.dev
R2_PUBLIC_BASE_URL_UPLOAD_PACKAGES=https://pub-package.r2.dev
# Optional fallback only.
R2_PUBLIC_BASE_URL=https://fallback.example.com
```

For the existing four-bucket R2 setup, keep `rendered-videos`, `thumbnails`, `subtitles`, and `upload-packages` as separate buckets. Turn on each bucket's Public Development URL in Cloudflare R2 and set the matching `R2_PUBLIC_BASE_URL_*` value. A rendered video stored at key `job-123/video.mp4` in `rendered-videos` becomes `https://pub-video.r2.dev/job-123/video.mp4`; the bucket name is not added to the public URL because the `pub-*.r2.dev` host already points to that bucket. Use `R2_PUBLIC_BASE_URL` only as a legacy fallback. For production, prefer custom domains over `r2.dev`.

Supported buckets are `rendered-videos`, `thumbnails`, `subtitles`, `sheet-exports`, `upload-packages`, and `product-images`. Storage object keys are normalized and path traversal keys are rejected before upload.

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

The worker resolves ffmpeg in this order:

1. `IMAGEIO_FFMPEG_EXE`
2. `imageio-ffmpeg`
3. system `PATH`

System ffmpeg is optional when `imageio-ffmpeg` works, but installing it is still recommended for smoke verification and local diagnostics.

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
- `channel_upload_packages.json`

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
