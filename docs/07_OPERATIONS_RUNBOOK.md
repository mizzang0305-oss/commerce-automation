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

If you need to prove the source string itself is valid UTF-8, inspect it with Python instead of relying on the terminal renderer:

```powershell
python -c "from pathlib import Path; print(repr(Path('app/api/dev/seed/route.ts').read_text(encoding='utf-8')[0:500]))"
```

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
3. Apply `supabase/migrations/002_candidate_scoring_fields.sql` for candidate `product_key`, dedupe, scoring, and promotion readiness fields.
4. Apply `supabase/migrations/003_event_calendar_and_planner.sql` for event calendar, daily planner, and channel profile tables.
5. Apply `supabase/migrations/004_channel_upload_packages.sql`, `005_channel_upload_package_results.sql`, and `006_channel_profile_admin_readiness.sql` for manual upload package and channel template tracking.
6. Set server-only env values in `.env.local` or the deployment secret store:

```text
AUTOMATION_REPOSITORY_ADAPTER=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=replace-with-service-role-key
```

7. Run `npm run test`, `npm run lint`, and `npm run build`.

Do not expose `SUPABASE_SERVICE_ROLE_KEY` to client code. The Python Worker still polls the WebApp API and does not need Supabase DB credentials. Artifact storage is configured separately in the Python Worker.

Before calling the Supabase adapter production-ready, complete `docs/SUPABASE_VERIFICATION.md`. It includes Dashboard checks, `pg_tables`/`pg_policies` SQL, worker smoke checks, and live artifact storage smoke criteria.

## Production Deployment Baseline

Use this baseline for production or production-like sandbox verification. The primary path is in-house Python Worker based Coupang MVP operation, not n8n, Creatomate, or Google Docs generation.

Required web service env:

```text
AUTOMATION_REPOSITORY_ADAPTER=supabase
SUPABASE_URL=replace-with-project-url
SUPABASE_SERVICE_ROLE_KEY=replace-with-service-role-key
WORKER_API_SECRET=replace-with-worker-secret
PUBLIC_APP_BASE_URL=https://your-web-app.example.com
CONTENT_AI_PROVIDER=template
# Leave unset or false for normal production.
ENABLE_DEV_TOOLS=
```

Required Python Worker env for R2 smoke:

```text
WEB_APP_BASE_URL=https://your-web-app.example.com
WORKER_API_SECRET=replace-with-worker-secret
WORKER_ID=production-worker-1
WORKER_JOB_TYPES=video_render,sheet_sync
STORAGE_BACKEND=r2
R2_ENDPOINT_URL=https://account-id.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=replace-with-storage-access-key
R2_SECRET_ACCESS_KEY=replace-with-storage-secret-key
R2_REGION=auto
R2_PUBLIC_BASE_URL_RENDERED_VIDEOS=https://pub-video.example.com
R2_PUBLIC_BASE_URL_THUMBNAILS=https://pub-thumbnail.example.com
R2_PUBLIC_BASE_URL_SUBTITLES=https://pub-subtitle.example.com
R2_PUBLIC_BASE_URL_UPLOAD_PACKAGES=https://pub-package.example.com
```

Optional AI keys are server-only. Keep `CONTENT_AI_PROVIDER=template` unless a later reviewed PR enables live provider calls:

```text
OPENAI_API_KEY=
GEMINI_API_KEY=
```

Production safety baseline:

- `/api/dev/*` mutation routes are blocked unless `ENABLE_DEV_TOOLS=true` is deliberately set for a sandbox.
- `SUPABASE_SERVICE_ROLE_KEY` stays in the WebApp server runtime only.
- R2/S3 storage keys stay in Python Worker runtime only.
- Python Worker does not connect to Supabase DB directly.
- YouTube/TikTok/Threads upload APIs are not implemented.
- Channel upload packages remain `upload_enabled=false` and `manual_upload_only=true`.

Run the safe local readiness helper before production smoke:

```powershell
npm run check:production-env
```

For CI-style fail-fast behavior:

```powershell
node scripts/check-production-env.mjs --strict
```

The helper checks required env presence and risky flags but prints only env names, configured booleans, and warning codes. It does not print raw Supabase, R2, Worker, Coupang, OpenAI, or Gemini values and does not make network calls.

## Candidate-To-Video Smoke

Use this when validating the full operator path from a collected candidate to a rendered artifact:

```powershell
Invoke-RestMethod -Method Post -ContentType "application/json" -Body '{"mode":"candidate-video-smoke"}' http://localhost:3000/api/dev/seed | ConvertTo-Json -Depth 8
```

Then:

1. Open `/candidates` and promote `candidate-video-smoke-001`.
2. Open the created queue item and run `콘텐츠 초안 생성`.
3. Run `POST /api/run/next-batch`.
4. Confirm exactly one `video_render` worker job is created.
5. Run the Python Worker.
6. Confirm `queue_status=video_ready`, `video_url` exists, and the artifact URL is a real storage URL for live storage smoke.
7. Confirm the queue item has a product image URL and the worker job payload includes `image_url` or `thumbnail_url`.

Safety expectations:

- Candidate seed, promotion, and content draft generation create zero worker jobs.
- `next-batch` is the only path that creates worker jobs.
- Missing product image URL blocks worker job creation and keeps the item in manual review.
- `video_ready` without `video_url` is a bug.
- Public upload and YouTube/TikTok/Threads posting remain disabled.

## Coupang Product-To-Video Test Lab Smoke

Use this after the Supabase/R2 sandbox is configured and `ENABLE_DEV_TOOLS=true` is set for a controlled local run.

Start the web app:

```powershell
.\scripts\dev\powershell-utf8.ps1
$env:WORKER_API_SECRET="local-worker-secret"
$env:PUBLIC_APP_BASE_URL="http://localhost:3001"
$env:AUTOMATION_REPOSITORY_ADAPTER="supabase"
$env:ENABLE_DEV_TOOLS="true"
$env:CONTENT_AI_PROVIDER="template"
npm run dev -- -p 3001
```

Open `/dev/test-lab` and use the `쿠팡 상품 → 쇼츠 영상 E2E Smoke` panel:

1. Create a sample Coupang candidate.
2. Promote the candidate to a scheduled queue item.
3. Generate a template content draft.
4. Run next-batch and confirm a `video_render` job was created.
5. Start Python Worker manually in a separate shell:

```powershell
cd C:\Users\LOVE\MyProjects\commerce-automation\python-worker
.\.venv\Scripts\python worker.py
```

6. Refresh status until the worker job completes and the queue item is `video_ready`.
7. Verify the video, thumbnail, subtitle, and upload package URLs are R2 or another real storage backend, not `/mock-storage`.
8. Build the channel upload package and confirm `manual_ready`, `upload_enabled=false`, and `manual_upload_only=true`.

The WebApp only reports pre/post Worker status and prints the Worker command. It must not spawn Python Worker, call platform upload APIs, or create worker jobs outside `/api/run/next-batch`.

## Production Smoke Checklist

Run this sequence in a sandbox before production rollout:

1. `GET /api/dev/diagnostics`: confirm `repository.adapter=supabase`, Supabase configured booleans are true, `content_ai.provider=template`, and no raw secrets or raw URLs are returned.
2. `POST /api/candidates/import-coupang`: confirm one `product_candidates` row is created, with no queue row and no worker job.
3. `POST /api/candidates/[id]/promote`: confirm one scheduled `product_queue` row and generated-content scaffold, with no worker job.
4. `POST /api/queue/[id]/generate-content`: confirm `video_script` and `disclosure_text`, with `created_worker_jobs=0`.
5. `POST /api/run/next-batch`: confirm exactly one `video_render` worker job and a payload with `image_url` or `thumbnail_url`.
6. Run Python Worker externally from PowerShell; do not launch it from WebApp.
7. Confirm `worker_jobs.status=completed`, `product_queue.queue_status=video_ready`, and `product_queue.video_url` exists.
8. Confirm video, thumbnail, subtitle, and upload package URLs are real R2/S3/Supabase Storage URLs and return HTTP 200 or valid signed URL responses.
9. Build a channel upload package and confirm `manual_ready`, `upload_enabled=false`, and `manual_upload_only=true`.
10. Exercise manual result tracking: `uploaded`, `skipped`, or `needs_fix` as applicable. This records operator outcome only and does not call platform upload APIs.

## Event Planner Smoke

Open `/planner` or call:

```powershell
Invoke-RestMethod http://localhost:3000/api/planner/daily | ConvertTo-Json -Depth 8
```

The planner should show active events in the 7-30 day window, candidate matches, and channel routing. Channel profiles are manual-only by default. The planner does not create queue rows or worker jobs.

## Channel Admin Readiness

Open `/channels` after applying migration 006. Use it to edit channel names, handles, channel IDs, routing categories, upload windows, and manual upload copy templates.

Safety expectations:

- Saving a channel profile keeps `upload_enabled=false`.
- Saving a channel profile keeps `manual_upload_only=true`.
- OAuth readiness is displayed as a configured boolean only.
- The page does not provide OAuth start, token storage, YouTube upload, TikTok upload, or Threads post actions.
- Channel template changes affect manual upload package preview/copy only.

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
R2_PUBLIC_BASE_URL_RENDERED_VIDEOS=https://pub-video.r2.dev
R2_PUBLIC_BASE_URL_THUMBNAILS=https://pub-thumb.r2.dev
R2_PUBLIC_BASE_URL_SUBTITLES=https://pub-subtitle.r2.dev
R2_PUBLIC_BASE_URL_UPLOAD_PACKAGES=https://pub-package.r2.dev
# Optional fallback only.
R2_PUBLIC_BASE_URL=https://fallback.example.com
```

Keep the existing four R2 buckets as separate buckets: `rendered-videos`, `thumbnails`, `subtitles`, and `upload-packages`. Enable each bucket's Public Development URL and put that bucket-specific URL in the matching `R2_PUBLIC_BASE_URL_*` variable. The worker uploads to the logical bucket name, but the generated public URL uses the bucket's public host plus the object key only. Example: `rendered-videos` key `job-123/video.mp4` maps to `https://pub-video.r2.dev/job-123/video.mp4`, not `https://pub-video.r2.dev/rendered-videos/job-123/video.mp4`. Use `R2_PUBLIC_BASE_URL` only as fallback. For production, use custom domains when possible.

For local storage, run the worker from `python-worker/`. `LOCAL_STORAGE_BASE_DIR=./outputs/storage` then maps to `C:\Users\LOVE\MyProjects\commerce-automation\python-worker\outputs\storage`. In local/dev smoke runs, the web app reads the same files through `/mock-storage/...`.

`/mock-storage` is local smoke tooling only. In production it returns 404 unless `ENABLE_MOCK_STORAGE_ROUTE=true` is explicitly set for a controlled test environment. Normal production deployments should leave `ENABLE_MOCK_STORAGE_ROUTE` unset and use Supabase Storage, Cloudflare R2, S3, or another real storage URL.

### Product Image Intake And Render Checks

The Coupang MVP path needs a real product image before an item can become renderable:

1. `/api/candidates/import-coupang` accepts `thumbnail_url` or an equivalent payload image URL.
2. Candidate review shows whether the image is ready, missing, or invalid.
3. Candidate promotion copies the selected image into `product_queue.thumbnail_url`.
4. Content draft generation and `/api/run/next-batch` require the queue image URL.
5. The Python Worker receives the image as `image_url` and `thumbnail_url`, downloads it, and fails/retries safely if it is unreachable, empty, or not an image.

Worker image download failures are normal job failures, not successful renders. They must not create placeholder artifacts, complete `video_render`, or move the queue item to `video_ready`.

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

For the Coupang MVP, operators can also paste one product directly from `/candidates` or call `POST /api/candidates/import-coupang`.

Required:

- `product_name`
- `raw_coupang_url` from `coupang.com/vp/products/...`

Optional:

- `selected_affiliate_url` from `https://link.coupang.com/a/...`
- `thumbnail_url`
- `price_now_text`
- `category_path`

The API removes tracking parameters, preserves product/item/vendor identifiers for `product_key`, validates the affiliate short link, validates product image readiness, and upserts only `product_candidates`. It must report `queue_items_created=0` and `worker_jobs_created=0`.

Example request:

```powershell
Invoke-RestMethod -Method Post -ContentType "application/json" `
  -Body '{"product_name":"Coupang MVP product","raw_coupang_url":"https://www.coupang.com/vp/products/123456789?utm_source=ad","selected_affiliate_url":"https://link.coupang.com/a/example","thumbnail_url":"https://example.com/thumb.jpg"}' `
  http://localhost:3000/api/candidates/import-coupang | ConvertTo-Json -Depth 8
```

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

Candidate review fields:

- `product_key` is used for deterministic dedupe. Coupang identifiers are preferred, Musinsa goods IDs are used when available, and generic sources fall back to normalized URL/name hashes.
- `candidate_score` is an operational priority score from 0 to 100. Higher scores usually mean affiliate link, image, pricing, event/ranking, review/rating, and known-platform signals are present.
- `image_readiness_status` explains whether a usable product image URL is ready, missing, or invalid.
- `duplicate_status` explains whether the row is unique, duplicated against another candidate, already queued, already produced, or not yet known.
- `promotion_status` decides whether the row can be promoted. Missing affiliate link, missing product name, or duplicate rows are blocked. Low score or missing image becomes `needs_review`.

Promotion rules:

1. `/candidates` can promote only ready rows.
2. Promotion creates `product_queue` with `queue_status=scheduled`.
3. Promotion creates a generated-content scaffold with the required affiliate disclosure.
4. Promotion records `promotion_status=promoted` and `promoted_queue_id` on the candidate.
5. Promotion requires a usable product image and copies it to `product_queue.thumbnail_url`.
6. Promotion does not create `worker_jobs`; run `/api/run/next-batch` after review to create eligible worker jobs.

## Generate Content Drafts

Use content drafts after a candidate has been promoted to the queue but before `/api/run/next-batch` creates worker jobs.

1. Open `/queue/[id]`.
2. Confirm the item has `product_name`, `selected_affiliate_url`, and `thumbnail_url`.
3. Click `콘텐츠 초안 생성`, or call `POST /api/queue/[id]/generate-content`.
4. Review `video_title`, `video_script`, captions, hashtags, YouTube/TikTok text, and affiliate disclosure.
5. Run `/api/run/next-batch` only after the render checklist is complete.

Safety rules:

- Content generation never creates `worker_jobs`; next-batch remains the only worker job creation path.
- Missing affiliate link, missing product name, or missing thumbnail blocks draft generation.
- Existing manually written content is preserved when present.
- Template drafts must avoid lowest-price guarantees, outcome guarantees, medical/health efficacy claims, and copied review text.
- Public upload remains disabled; generated content is for review and video render preparation only.

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

## Build Channel Upload Packages

Use `POST /api/queue/[id]/build-upload-package` only after the item is `video_ready`.

Required conditions:

- `queue_status = video_ready`
- `video_url` exists
- `selected_affiliate_url` exists
- `channel_profile_id` is provided in the request body
- `generated_contents.disclosure_text` exists
- `product_assets` contains all four manual package artifacts: `video`, `thumbnail`, `subtitle`, and `upload_package`

If the API returns `CHANNEL_UPLOAD_PACKAGE_SCHEMA_ERROR`, verify the Supabase schema before retrying:

1. Confirm migration `004_channel_upload_packages.sql` was applied and `channel_upload_packages` exists.
2. Confirm migration `005_channel_upload_package_results.sql` was applied if manual result tracking fields are expected.
3. Confirm `channel_upload_packages.id` is a primary key or unique column. Supabase upsert with `onConflict: "id"` requires a matching unique/exclusion constraint.
4. If the table/columns were just added, reload the PostgREST schema cache from the Supabase dashboard or restart the API layer if applicable.
5. Confirm the table has RLS enabled and no anon/authenticated public write policy. WebApp server routes should use the server-only service role client.

Safe error behavior:

- Server logs may include redacted Supabase diagnostic fields: code, message, detail, and hint.
- API responses return only `error_code`, a generic Korean message, and `safe_error`.
- Package generation never creates `worker_jobs`; `/api/run/next-batch` remains the only worker job creation path.
- YouTube/TikTok/Threads upload APIs remain unimplemented and disabled.

## Failure Handling

- `retry_wait`: worker can reclaim later.
- `failed`: inspect `error_message`.
- `manual_review`: item is missing required business/policy data.
- `video_ready` without `video_url` should never occur; treat it as a bug.

## Legacy n8n

Nightly Scout can still be connected to n8n callbacks. Next-batch video rendering must use worker jobs.

## Content AI Provider Checks

Default content generation uses:

```text
CONTENT_AI_PROVIDER=template
```

For readiness checks, `CONTENT_AI_PROVIDER=openai` or `gemini` may be set with a matching server-only key. If the key is absent or the provider is unavailable, `generate-content` should return `content_provider=template`, `used_fallback=true`, and `created_worker_jobs=0`.

Use `/api/dev/diagnostics` to verify `content_ai.provider`, `openai_configured`, `gemini_configured`, and `enabled`. Raw API keys must never appear in diagnostics, logs intended for operators, or client UI.
