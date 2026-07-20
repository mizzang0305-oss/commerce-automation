# Commerce Automation Control Center

Current baseline: in-house Coupang MVP with Supabase/Postgres repository state, Cloudflare R2 or compatible artifact storage, Python Worker rendering, template content drafts, and manual upload packages.

`commerce-automation` is a Next.js admin web service for Coupang affiliate content operations. The web app is the control room: settings, product queue, worker jobs, run logs, generated result URLs, and manual review all live here. Heavy work is delegated to a separate Python Worker that polls the web API and processes only `video_render` and `sheet_sync` jobs.

Public publishing to YouTube, TikTok, or Threads is not implemented. `run_mode` stays `generate_only`, `youtube_upload_enabled` stays `false`, and public upload must not be enabled by default.

Platform upload core is readiness-only. `/uploads`, `GET /api/uploads/platform-readiness`, and `POST /api/candidates/[id]/platform-upload-plan` expose disabled provider defaults, blocked reasons, and copy-only upload plans without calling YouTube, TikTok, Threads, OAuth, R2, Supabase writes, queue creation, worker jobs, or public upload. YouTube has a server-only private/unlisted smoke path at `GET /api/uploads/youtube/readiness`, `GET /api/uploads/youtube/token-readiness`, `POST /api/uploads/youtube/prepare`, `POST /api/uploads/youtube/execute-readiness`, and `POST /api/uploads/youtube/execute`; the normal operator path is the `/uploads` dashboard form, which shows Korean readiness blockers and fix hints, builds a UTF-8 browser payload, previews Korean disclosure text, gates prepare/execute, checks side-effect-free execute readiness, and keeps public visibility unavailable. The dashboard includes a readiness gate resolver that explains quota/account/policy/upload-flag/token blockers and shows env names only, never secret values. The first private YouTube smoke is final verified, and `/uploads` now includes a separate product video private package section backed by `POST /api/uploads/youtube/product-package/prepare`; it validates candidate, product, affiliate URL, server-accessible prepared video asset references, title, description, Korean disclosure, private/unlisted visibility, and Studio checklist state while keeping all upload/DB/R2/queue/job side effects false. `/uploads` also includes `POST /api/uploads/assets/prepare-video-asset` integration for prepare-only domain video asset validation: manual signed URLs, prepared HTTPS asset URLs, and storage keys can be checked as `PreparedVideoAssetRef` contracts while Windows paths, `/var/task` paths, relative `.mp4` paths, expired signed URLs, and missing size/MIME data remain blocked. Local OAuth token generation is a separate approval-gated helper script and is not run by default. Local Windows mp4 paths and local token files are localhost diagnostics, not deployed-domain readiness. See [docs/PLATFORM_UPLOAD_CORE.md](docs/PLATFORM_UPLOAD_CORE.md), [docs/YOUTUBE_UPLOAD_ADAPTER.md](docs/YOUTUBE_UPLOAD_ADAPTER.md), [docs/UPLOAD_ASSET_PROVIDER_CONTRACT.md](docs/UPLOAD_ASSET_PROVIDER_CONTRACT.md), [docs/YOUTUBE_PRIVATE_UPLOAD_SMOKE.md](docs/YOUTUBE_PRIVATE_UPLOAD_SMOKE.md), [docs/YOUTUBE_LOCAL_TOKEN_PROVIDER.md](docs/YOUTUBE_LOCAL_TOKEN_PROVIDER.md), and [docs/YOUTUBE_LOCAL_OAUTH_TOKEN_HELPER.md](docs/YOUTUBE_LOCAL_OAUTH_TOKEN_HELPER.md).

One-product real product video asset planning is approval-gated at `POST /api/uploads/youtube/real-product-pilot/video-asset/prepare` and in the `/uploads` dashboard. It validates a single real candidate, blocks smoke/test candidates, can run the approved local-only video generator for `generate_local_only`, validates server-accessible `video/mp4` asset references separately, and returns a one-row `product_assets` write plan without executing R2 upload, Supabase writes, queue/job creation, upload packages, or YouTube Execute.

## Architecture

- Web Service: Next.js admin app and server API.
- Python Worker: polls worker APIs, claims jobs, sends heartbeat, reports completion/failure.
- Local data adapter: JSON files under `data/` for development.
- Supabase/Postgres adapter: optional shared repository for production, cloud, and multi-PC operation.
- Storage: local or S3/R2/Supabase-compatible abstraction used by the worker for generated files.
- n8n: legacy/optional. Nightly scout can still be backed by n8n or another product collector, but `/api/run/next-batch` no longer calls n8n.

## Production Deployment Baseline

The current production-ready path is the in-house Coupang product-to-video flow:

1. Import a Coupang product candidate.
2. Review and promote the candidate into `product_queue`.
3. Generate a template content draft.
4. Run `/api/run/next-batch` to create the `video_render` worker job.
5. Run Python Worker separately so it renders and uploads artifacts.
6. Confirm real storage URLs for video, thumbnail, subtitle, and upload package.
7. Build a channel upload package for manual upload review.

The WebApp must not launch Python Worker. Worker jobs are created only by `/api/run/next-batch`. Platform uploads remain manual-only; YouTube/TikTok/Threads upload APIs are not implemented.

## Operator Command Palette

Use `Ctrl+K` or `Cmd+K` in the admin app to open the operator command palette. It supports page navigation, recent commands, favorites, context-aware suggestions, aliases, and copy-only validation command snippets. Recent/favorite state is stored in browser `localStorage` only as safe command metadata. It does not execute Python Worker, deploys, database writes, collectors, queue/job creation, upload packages, or platform uploads, and it never copies secret values. See [docs/OPERATOR_COMMAND_PALETTE.md](docs/OPERATOR_COMMAND_PALETTE.md).

Use [docs/PRODUCTION_HOSTING_DECISION.md](docs/PRODUCTION_HOSTING_DECISION.md) and [checklists/production-hosting-target-checklist.md](checklists/production-hosting-target-checklist.md) before choosing a production target. After the target is approved, use [docs/PRODUCTION_PILOT_RUNBOOK.md](docs/PRODUCTION_PILOT_RUNBOOK.md), [docs/PRODUCTION_PILOT_PREFLIGHT.md](docs/PRODUCTION_PILOT_PREFLIGHT.md), [checklists/vercel-production-checklist.md](checklists/vercel-production-checklist.md), [checklists/local-worker-production-checklist.md](checklists/local-worker-production-checklist.md), and [checklists/production-pilot-preflight-checklist.md](checklists/production-pilot-preflight-checklist.md) to prepare the Vercel WebApp plus local Windows Worker pilot. Use [checklists/deployment-checklist.md](checklists/deployment-checklist.md) before deploying and [checklists/security-checklist.md](checklists/security-checklist.md) before opening a sandbox or production instance.

For a safe local production-env readiness summary that prints booleans and warnings only:

```powershell
npm run check:production-env
```

The helper does not contact Supabase or R2 and does not print raw secret values.

For the approval-gated production pilot preflight:

```powershell
npm run preflight:production-pilot
```

The preflight helper prints configured/missing/manual-check status only. It does not run Vercel deploy, call Supabase CLI, contact R2, start Python Worker, or print raw secret values.

Production pilot closeout is a readiness view, not a deploy. `/ops/production-readiness` and the preflight helper group the 19 required env checks into WebApp Base, Supabase, Local Python Worker, Cloudflare R2, AI / Coupang, and Safety Flags, and group the 10 manual checks into Vercel, Supabase, R2, Local Worker, and Rollback / Approval. Pilot readiness remains false until all required env values are configured, forbidden public secrets are absent, every manual check has evidence, explicit operator approval is present, deploy/smoke commands have not been run by the tool, and upload locks remain disabled/manual-only.

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

PowerShell console rendering can still corrupt inline Korean JSON even when the API is healthy. For Korean smoke payloads, prefer a UTF-8 body file:

```powershell
@'
{
  "product_name": "쿠팡 테스트 상품",
  "raw_coupang_url": "https://www.coupang.com/vp/products/123456789",
  "selected_affiliate_url": "https://link.coupang.com/a/test",
  "thumbnail_url": "https://picsum.photos/seed/test/1080/1920",
  "price_now_text": "12,900원",
  "category_path": "선물/생활",
  "source_type": "manual_url"
}
'@ | Out-File -Encoding utf8 .\tmp-coupang-import-body.json

Invoke-RestMethod `
  -Method Post `
  -ContentType "application/json; charset=utf-8" `
  -InFile .\tmp-coupang-import-body.json `
  "http://localhost:3001/api/candidates/import-coupang" |
  ConvertTo-Json -Depth 10
```

To save and inspect API output as UTF-8:

```powershell
Invoke-RestMethod http://localhost:3001/api/dev/diagnostics |
  ConvertTo-Json -Depth 8 |
  Out-File -Encoding utf8 .\tmp-diagnostics.json

Get-Content .\tmp-diagnostics.json -Encoding utf8
```

Use the source scanner when deciding whether a string is actually corrupted in the repository:

```powershell
node scripts/check-mojibake.mjs --paths README.md,docs/07_OPERATIONS_RUNBOOK.md,src/components/DevScenarioPanel.tsx
```

If `scripts/check-mojibake.mjs` reports `mojibake_matches=0`, but PowerShell still displays corrupted Korean, treat it as a PowerShell console rendering problem until a browser or UTF-8 file output proves otherwise.

Current scope guard: n8n, Creatomate, and Google Docs are not the current production path. Naver BrandConnect is deferred. multi-user SaaS is deferred.

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

The local Crawlee + Activepieces/Windmill contract-only PoC is documented in [docs/commerce/CRAWLEE_ACTIVEPIECES_WINDMILL_POC.md](docs/commerce/CRAWLEE_ACTIVEPIECES_WINDMILL_POC.md). It keeps collection host-allowlisted, persists append-only JSONL staging/review/drafts, and does not call webhooks, notifications, queues, workers, or publishers.

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
- `payload.duplicate_key`, `payload.score_breakdown`, `payload.source_trace`, and `payload.risk_flags`: safe operator metadata for dedupe and scoring review. `score_breakdown` carries demand, price, content-angle, risk, duplicate, and final score fields; `source_trace` carries platform, keyword, collection mode/time, and collector version without secrets.
- `candidate_score`: 0-100 score based on affiliate link, product name, image, price, discount, review/rating, source type, and known platform signals.
- `image_readiness_status`: `ready`, `missing_image`, or `invalid_image_url`; candidates without a usable image cannot be promoted to a renderable queue item.
- `duplicate_status`: `unique`, `duplicate_candidate`, `already_queued`, `already_produced`, or `unknown`.
- `promotion_status`: `ready`, `blocked_missing_affiliate`, `blocked_missing_name`, `blocked_duplicate`, `needs_review`, or `promoted`.

The `/candidates` page shows these fields so operators can sort by score, filter blocked rows, inspect dedupe reasons, and promote only ready candidates. Promotion creates a scheduled `product_queue` row plus a generated-content scaffold, and propagates the selected candidate image into `product_queue.thumbnail_url`; it never creates `worker_jobs`. Worker jobs remain the responsibility of `/api/run/next-batch`.

`/candidates/analytics` summarizes candidate score, duplicate, source trace, risk flag, and linked artifact QA signals. It is read-only decision support and does not create queue rows, worker jobs, upload packages, storage artifacts, or platform uploads. See [docs/CANDIDATE_SCORING_ANALYTICS_DASHBOARD.md](docs/CANDIDATE_SCORING_ANALYTICS_DASHBOARD.md).

`/api/candidates/seed-plan` and `/candidates/analytics#seed-plan` convert filtered seed strategy insights into a candidate-only dry-run collector payload preview. Operators can copy or export keyword lists and JSON payloads, but the planner never runs collectors, creates queue rows, creates worker jobs, creates upload packages, or uploads. See [docs/CANDIDATE_SEED_DRY_RUN_PLANNER.md](docs/CANDIDATE_SEED_DRY_RUN_PLANNER.md).

Collector endpoints are candidate-only. They must return `queue_created=false`, `worker_jobs_created=false`, and `upload_triggered=false`; they never create queue rows, render plans, upload packages, or platform uploads.

Promoted queue items can receive a safe template draft before worker dispatch:

## Content AI Provider Scaffold

Content draft generation defaults to `CONTENT_AI_PROVIDER=template`. The template provider creates `video_title`, `video_script`, captions, descriptions, hashtags, and disclosure text without external API calls. `POST /api/queue/[id]/generate-content` still creates zero `worker_jobs`; worker jobs are created only by `/api/run/next-batch`.

## Commerce Image Prompt Planning

`/image-prompts` provides candidate-based commerce image prompt planning for four copy-only asset types: `main_product`, `benefit_scene`, `hook_thumbnail`, and `comparison_card`. The page, `GET /api/candidates/[id]/image-plan`, and `GET /api/candidates/[id]/image-video-plan` return prompt text, negative prompts, risk flags, safety notes, a 15-second storyboard, shot list, narration, subtitle lines, CTA, disclosure reminder, and explicit false side effects. They do not call image APIs, create image generation jobs, create video jobs, create queue rows, create render plans, upload files, or call Google Drive. See `docs/COMMERCE_IMAGE_PIPELINE.md` and `docs/COMMERCE_IMAGE_VIDEO_PIPELINE.md`.

`GET /api/candidates/[id]/local-image-package` and `/image-prompts` also provide an approval-gated local image generation package. It suggests filenames, local output folders, Google Drive sync folders, manifest JSON, prompt markdown, manual steps, and QA checklist text for separate manual image work. It remains copy-only: `external_api_called=false`, `image_generated=false`, `video_generated=false`, `uploaded=false`, `db_written=false`, `worker_job_created=false`, `queue_created=false`, `local_file_written=false`, and `google_drive_api_called=false`. See `docs/LOCAL_IMAGE_GENERATION_BRIDGE.md`.

`POST /api/candidates/[id]/image-qa-import-plan` and `/image-prompts` add the next copy-only bridge for manually generated image filenames or path text. Operators can paste an import manifest, preview QA status, copy selected image asset JSON, and copy QA markdown. The bridge validates text only and keeps `local_file_read=false`, `local_file_written=false`, `db_written=false`, `google_drive_api_called=false`, `r2_uploaded=false`, `worker_job_created=false`, and `queue_created=false`. See `docs/IMAGE_QA_IMPORT_BRIDGE.md`.

`POST /api/candidates/[id]/execute-local-slideshow-render` and `/image-prompts` add the separately approved local slideshow render execution step. It requires the exact phrase `APPROVE_LOCAL_SLIDESHOW_RENDER_EXECUTION`, validates allowlisted local image paths, runs local FFmpeg first with MoviePy fallback, and writes a local MP4 plus manifest/report only under `commerce-assets/output/video-packages/{candidate_id}/`. It can set `local_file_read=true`, `local_file_written=true`, and `video_generated=true`, but it keeps `external_api_called=false`, `db_written=false`, `uploaded=false`, `r2_uploaded=false`, `upload_package_created=false`, `worker_job_created=false`, and `queue_created=false`. See `docs/LOCAL_SLIDESHOW_RENDER_EXECUTION.md`.

`POST /api/candidates/[id]/slideshow-package-plan` and `/image-prompts` add the selected-image slideshow package plan. It maps QA-selected image assets into a 15-second `shorts_9_16` timeline with image sequence, overlay text, narration/subtitle lines, CTA, disclosure reminder, BGM/SFX direction, FFmpeg command preview, MoviePy script preview, and a manual render checklist. It remains plan-only and copy-only: `ffmpeg_executed=false`, `moviepy_executed=false`, `video_generated=false`, `local_file_read=false`, `local_file_written=false`, `db_written=false`, `r2_uploaded=false`, `upload_package_created=false`, `worker_job_created=false`, and `queue_created=false`. See `docs/SELECTED_IMAGE_SLIDESHOW_PACKAGE_PLAN.md`.

`POST /api/candidates/[id]/local-slideshow-render-package` and `/image-prompts` add an approval-gated local slideshow render bridge. It requires the exact confirmation phrase `PREPARE_LOCAL_SLIDESHOW_RENDER_PACKAGE` before returning copy-only PowerShell steps, local FFmpeg/MoviePy preview text, input asset checklist text, and output path suggestions. It still keeps execution disabled and side effects false: `execution_enabled=false`, `ffmpeg_executed=false`, `moviepy_executed=false`, `local_file_read=false`, `local_file_written=false`, `video_generated=false`, `upload_package_created=false`, `uploaded=false`, `db_written=false`, `worker_job_created=false`, and `queue_created=false`. See `docs/LOCAL_SLIDESHOW_RENDER_BRIDGE.md`.

`POST /api/candidates/[id]/generated-video-qa-import-plan` and `/image-prompts` provide the copy-only bridge after a separately approved local render. Operators can paste generated video manifest text, preview QA status, copy QA markdown, and copy next-step JSON. The bridge validates text only and keeps `local_file_read=false`, `local_file_written=false`, `db_written=false`, `r2_uploaded=false`, `ffmpeg_executed=false`, `moviepy_executed=false`, `video_generated=false`, `upload_package_created=false`, `worker_job_created=false`, and `queue_created=false`. See `docs/GENERATED_VIDEO_QA_IMPORT_BRIDGE.md`.

Optional provider selection is server-only:

```text
CONTENT_AI_PROVIDER=template
OPENAI_API_KEY=
GEMINI_API_KEY=
```

`CONTENT_AI_PROVIDER=openai` or `gemini` is accepted as a readiness setting, but this scaffold keeps live external calls disabled in this PR. Missing keys, provider errors, empty AI drafts, or blocked safety checks fall back to the template provider. Diagnostics expose only safe booleans:

```json
{
  "content_ai": {
    "provider": "template",
    "openai_configured": false,
    "gemini_configured": false,
    "enabled": false
  }
}
```

AI and template drafts pass a safety guard that blocks guarantee language, lowest-price claims, medical/health efficacy claims, missing disclosure text, and suspicious review-copy patterns. `OPENAI_API_KEY` and `GEMINI_API_KEY` must never use a `NEXT_PUBLIC_` prefix and must never be referenced by client components.

- `POST /api/queue/[id]/generate-content`
- requires `product_name`, `selected_affiliate_url`, and `thumbnail_url`.
- fills `video_title`, `video_script`, captions, hashtags, YouTube/TikTok text, and affiliate disclosure when missing.
- preserves existing manual content fields instead of overwriting them.
- does not create `worker_jobs`; run `/api/run/next-batch` after content review.
- avoids hard claims such as guaranteed results, lowest-price assertions, medical/health efficacy claims, and copied review text.

## Render Plan Preview

`/api/run/next-batch` can attach a deterministic `render_plan` to `video_render` worker job payloads when product name, affiliate link, product image URL, video script, and disclosure text are all ready. The plan is not a new render engine and is not persisted as a separate table.

The `/queue/[id]` page previews this plan before dispatch:

- `render_plan_attached=true/false`
- shot count and total duration
- per-shot layout, caption, image URL, voice text, and readiness gaps
- legacy fallback copy when a plan cannot be built

The base preview is deterministic. Operators may save a lightweight `render_plan_override` on `/queue/[id]` to adjust shot captions, voice text, and durations. The base plan remains unchanged, the override is stored on `generated_contents`, and the app computes an `effective_render_plan` for preview and next-batch dispatch.

Override guardrails:

- only shot text and 2-8 second shot durations are editable;
- affiliate links, disclosure text, image URLs, worker commands, upload flags, and external URLs are not editable through overrides;
- unsafe claim language is rejected;
- saving an override creates zero `worker_jobs`;
- `/api/run/next-batch` remains the only worker job creation path and includes the effective render plan in the worker payload only when the override validates.

The preview and override editor do not launch Python Worker, do not install ViMax, do not call external video/image APIs, and do not enable platform uploads.

## Event-Driven Production Planner

The planner foundation turns collected candidates into a daily production shortlist before queue promotion and worker dispatch.

- `/planner`: shows the current daily plan, upcoming 7-30 day event window, and channel routing.
- `GET /api/events`: returns the static event calendar seed for the selected year.
- `GET /api/channels`: returns manual-only YouTube channel profiles.
- `/channels`: edits channel display metadata, routing categories, upload windows, and manual upload templates.
- `GET /api/planner/daily`: computes a safe daily plan from `product_candidates`, upcoming events, and channel profiles.
- `POST /api/dev/seed` with `{ "mode": "candidate-video-smoke" }`: creates a repeatable candidate-to-video smoke candidate.

The planner does not create `worker_jobs`. Candidate promotion creates a scheduled queue row and generated-content scaffold, content draft generation fills script/copy fields, and `/api/run/next-batch` remains the only route that creates worker jobs.

Channel profiles are routing metadata only. Defaults use `upload_enabled=false` and `manual_upload_only=true`; YouTube OAuth readiness may be displayed as configured booleans. A separate server-only YouTube private/unlisted smoke adapter exists behind token readiness, exact confirmation, and `RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE`, but public upload, OAuth start routes, repository token storage, and automatic channel publishing remain disabled. The `/channels` page can edit channel name, handle, channel ID, category routing, upload window, and manual upload copy templates. Attempts to enable upload automation are ignored and persisted as disabled.

Apply `supabase/migrations/003_event_calendar_and_planner.sql` when using Supabase and you want the planner tables available for future persisted event/channel/plan records. Apply `supabase/migrations/004_channel_upload_packages.sql` and `supabase/migrations/005_channel_upload_package_results.sql` to store channel-specific manual upload packages and manual upload result tracking. Apply `supabase/migrations/006_channel_profile_admin_readiness.sql` for editable manual upload templates. Apply `supabase/migrations/007_generated_content_render_plan_override.sql` before saving render plan overrides. RLS is enabled and no public anon/authenticated policies are created.

## Key Pages

- `/dashboard`: overview and run controls.
- `/queue`: product queue with worker job status.
- `/queue/[id]`: generated result URLs, assets, render plan preview, content draft action, channel upload package action, and manual review controls.
- `/planner`: event-driven daily production plan and manual-only channel routing.
- `/channels`: manual-only channel profile readiness and upload package template admin.
- `/image-prompts`: copy-only commerce image prompt planning for product candidates.
- `/artifacts`: generated artifact QA with filters, search, sorting, and bulk QA review. QA updates never trigger uploads or worker jobs.
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

Rendered videos use a fixed 1080x1920 vertical layout. The renderer scales product imagery into a bounded center card, keeps SRT captions in the lower safe area, and limits dense subtitles to compact wrapped lines. Thumbnail generation also targets 1080x1920 and wraps long product titles so the preview remains usable for manual upload package review. Upload package text may include non-secret render QA metadata such as layout version, subtitle style, render-plan usage, and shot count.

Render quality work stays inside the existing Python/ffmpeg worker. It does not add ViMax, external video APIs, or platform upload behavior.

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

## Coupang Product-To-Video Smoke

Use `/dev/test-lab` for the current MVP smoke path from one Coupang product candidate to `video_ready`, R2 artifact URLs, and a manual upload package.

Start the web app with sandbox/dev tools enabled:

```powershell
.\scripts\dev\powershell-utf8.ps1
$env:WORKER_API_SECRET="local-worker-secret"
$env:PUBLIC_APP_BASE_URL="http://localhost:3001"
$env:AUTOMATION_REPOSITORY_ADAPTER="supabase"
$env:ENABLE_DEV_TOOLS="true"
$env:CONTENT_AI_PROVIDER="template"
npm run dev -- -p 3001
```

Open `http://localhost:3001/dev/test-lab` and run:

1. `샘플 쿠팡 후보 생성`
2. `후보를 큐로 승격`
3. `콘텐츠 초안 생성`
4. `다음 배치 실행`
5. Run the Python Worker manually from a separate PowerShell:

```powershell
cd C:\Users\LOVE\MyProjects\commerce-automation\python-worker
.\.venv\Scripts\python worker.py
```

6. Click `상태 새로고침` until the queue reaches `video_ready`.
7. Confirm video, thumbnail, subtitle, and upload package URLs are real storage URLs and return HTTP 200.
8. Click `채널 업로드 패키지 생성` and confirm the package is `manual_ready`.

The WebApp never launches Python Worker itself. Candidate import, promotion, and content draft generation create zero `worker_jobs`; `/api/run/next-batch` remains the only worker-job creation path. YouTube/TikTok/Threads upload APIs remain unimplemented and disabled.

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

## Ops / Collector / Artifact QA

- `/ops/production-readiness` shows approval-gated readiness counts and safety locks. It does not deploy or call production smoke.
- `/candidates` includes a Coupang Collector MVP dry-run panel. It creates candidates only and never creates queue rows, worker jobs, render plans, upload packages, or platform uploads.
- `/candidates/analytics` is read-only candidate quality analytics. It does not imply sales outcome and cannot trigger collection, promotion, workers, or uploads.
- `/candidates/analytics` supports date, keyword, category, risk flag, status, score range, collected mode, collector version, sort, and limit filters. Seed Strategy copy/export is candidate-only and never executes collectors or creates queue/job/upload side effects. See [docs/CANDIDATE_ANALYTICS_FILTERS_AND_SEED_STRATEGY.md](docs/CANDIDATE_ANALYTICS_FILTERS_AND_SEED_STRATEGY.md).
- `/api/candidates/seed-plan` provides a read-only candidate-only dry-run payload planner with strategy, keyword limit, JSON preview, copy, and export controls. It never runs collectors or creates queue/job/upload side effects. See [docs/CANDIDATE_SEED_DRY_RUN_PLANNER.md](docs/CANDIDATE_SEED_DRY_RUN_PLANNER.md).
- `/artifacts` provides Worker artifact QA for video, thumbnail, subtitle, and upload package URLs. QA pass is a manual review marker only and never triggers upload.
- Artifact QA review queues, note templates, and keyboard shortcuts are productivity controls only. They update QA metadata and show `QA status only changed. No platform upload was executed.` after status changes. See [docs/ARTIFACT_QA_PRODUCTIVITY_POLISH.md](docs/ARTIFACT_QA_PRODUCTIVITY_POLISH.md).
- `/artifacts` supports read-only pagination with `page`, `page_size`, filters, sort controls, and a bounded large-list table view. Pagination, virtualization, selection, and keyboard navigation do not update QA state, create worker jobs, or trigger upload. See [docs/ARTIFACT_QA_PAGINATION.md](docs/ARTIFACT_QA_PAGINATION.md).
- Apply `supabase/migrations/008_product_asset_qa.sql` before using artifact QA against Supabase.
