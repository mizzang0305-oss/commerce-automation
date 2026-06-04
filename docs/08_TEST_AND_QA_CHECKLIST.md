# 08 Test And QA Checklist

## Required Commands

```powershell
npm run test
npm run lint
npm run build
python -m compileall python-worker
```

## Local Console QA

- Run `.\scripts\dev\powershell-utf8.ps1` before PowerShell smoke checks.
- Confirm `Invoke-RestMethod http://localhost:3000/api/dev/diagnostics | ConvertTo-Json -Depth 8` displays Korean text without mojibake.
- If PowerShell output is still corrupted, verify the same endpoint in a browser before treating it as an API failure.
- For Korean request payloads, prefer a UTF-8 body file such as `tmp-coupang-import-body.json` and send it with `-ContentType "application/json; charset=utf-8"` plus `-InFile`.
- For response inspection, write diagnostics to `tmp-diagnostics.json` with `Out-File -Encoding utf8`, then read it with `Get-Content -Encoding utf8`.
- Run `node scripts/check-mojibake.mjs --paths README.md,docs/07_OPERATIONS_RUNBOOK.md,src/components/DevScenarioPanel.tsx` when you need to distinguish source corruption from PowerShell console rendering.
- Do not print `.env.local`, `SUPABASE_SERVICE_ROLE_KEY`, or raw Authorization headers while debugging console output.

## Worker Job QA

- Claim returns one pending job.
- Already claimed job is not claimed by another worker.
- Heartbeat updates job and worker heartbeat.
- Complete with `video_url` moves queue item to `video_ready`.
- Complete without `video_url` does not complete job.
- Complete without `video_url` does not move queue item to `video_ready`.
- Fail stores `error_message` and uses retry policy.
- Missing or wrong `WORKER_API_SECRET` returns 401.

## Next Batch QA

- `python_worker_enabled=false` creates no jobs.
- Missing `video_render` in `allowed_worker_job_types` creates no jobs.
- `max_daily_videos` limit prevents additional jobs.
- No due scheduled items returns safe no-op.
- Missing `selected_affiliate_url` moves item to `manual_review`.
- Missing disclosure text moves item to `manual_review`.
- Missing script moves item to `manual_review`.
- Missing thumbnail/image URL moves item to `manual_review`.
- Valid worker job payload includes `image_url` or `thumbnail_url` for product image download.
- n8n webhook is not called by `/api/run/next-batch`.

## Security QA

- Client components do not reference `WORKER_API_SECRET`.
- Client components do not reference `SUPABASE_SERVICE_ROLE_KEY`.
- Client components do not reference service role, R2/S3, Coupang, OpenAI, Gemini, or provider API keys.
- Logs do not print Authorization headers.
- Production blocks `POST /api/dev/seed`, `/api/dev/reset-storage`, and `/api/dev/reset-settings` unless `ENABLE_DEV_TOOLS=true`.
- `/api/dev/diagnostics` returns configured booleans only and does not expose raw Supabase URL or service role key.
- `.env.local` is not committed.
- `data/*.json` is not committed.
- `python-worker/.env` is not committed.
- `python-worker/.venv`, `python-worker/outputs`, `python-worker/temp`, and worker logs are not committed.

## Repository Adapter QA

- Default repository adapter remains `local-json`.
- `AUTOMATION_REPOSITORY_ADAPTER=supabase` selects the Supabase adapter.
- `AUTOMATION_STORAGE_ADAPTER=supabase` remains supported for compatibility.
- Missing `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` returns a safe server error.
- Supabase worker completion still rejects missing `video_url`.
- `docs/sql/verify_supabase_core.sql` confirms all automation tables have RLS enabled.
- `docs/sql/verify_supabase_core.sql` confirms there are no broad anon/authenticated read/write policies.
- Supabase migration creates `automation_settings.id = 'default'`.
- Supabase integration tests run only when explicit Supabase env is configured.

## Upload QA

- `run_mode` default is `generate_only`.
- `youtube_upload_enabled` default is `false`.
- No real YouTube/TikTok/Threads upload code path is enabled.

## Artifact Storage QA

- Local storage still serves `/mock-storage/...` only for local/dev smoke.
- Production storage smoke uses Supabase Storage, R2, or another S3-compatible backend; `/mock-storage/...` does not count as live storage.
- Supabase/R2 storage keys are not exposed to client components.
- `python-worker/.env` does not contain `SUPABASE_SERVICE_ROLE_KEY`.
- R2 live smoke uses bucket-specific public URL env values for `rendered-videos`, `thumbnails`, `subtitles`, and `upload-packages`; `R2_PUBLIC_BASE_URL` is fallback only.
- R2 product asset URLs must point at the bucket Public Development URL plus object key, for example `https://pub-video.r2.dev/job-123/video.mp4`, not `https://pub-video.r2.dev/rendered-videos/job-123/video.mp4`.
- Unsafe storage keys such as `../video.mp4` are rejected.
- Missing storage credentials fail/retry the worker job without fake success.
- Live storage smoke passes only when video, thumbnail, SRT, and upload package URLs return HTTP 200 or valid signed URL responses.

## Collector QA

- `/api/collectors/import-csv` is blocked in production unless `ENABLE_DEV_TOOLS=true`.
- CSV imports reject empty product names, empty URLs, and non-http(s) URLs.
- Imported rows are stored as `product_candidates`, not `product_queue`.
- Collectors do not create `worker_jobs` directly.
- Crawling/import work does not bypass login, CAPTCHA, bot blocking, terms, or copy protected review text.
- Imported candidates get `product_key`, `candidate_score`, `duplicate_status`, and `promotion_status`.
- Coupang candidates include safe `duplicate_key`, `score_breakdown`, `source_trace`, and `risk_flags` metadata.
- `product_key` generation must not include secret-like payload keys or token values.
- `/api/candidates/import-coupang` accepts only Coupang product detail URLs, strips tracking parameters, validates optional `link.coupang.com/a/...` affiliate links, and returns no queue, worker, or upload side effects.
- Coupang CSV rows use the same product key and affiliate readiness enrichment as manual `/candidates` input.
- Coupang candidate image URLs accept only usable `http`/`https` image sources; empty, `file:`, `javascript:`, and other unsafe schemes are blocked from render readiness.
- Missing `selected_affiliate_url` maps to `blocked_missing_affiliate`; missing `product_name` maps to `blocked_missing_name`.
- Missing or invalid product image maps to review/blocking behavior and cannot become a renderable queue row.
- Duplicate candidate, queued, or produced rows map to `blocked_duplicate`.
- Candidate promotion creates `product_queue` and generated-content scaffold only; `worker_jobs` must remain empty until `next-batch`.
- `/candidates` shows score, product key, duplicate status, promotion status, and keeps secret-like payload keys redacted.

## Content Draft QA

- `POST /api/queue/[id]/generate-content` blocks missing `selected_affiliate_url`, missing `product_name`, and missing `thumbnail_url`.
- Generated drafts include `video_title`, `video_script`, captions, hashtags, YouTube/TikTok text, and `disclosure_text`.
- Existing manually written generated-content fields are preserved.
- Content draft generation creates no `worker_jobs`.
- A queue item with generated `video_script`, disclosure text, affiliate link, and thumbnail can later pass next-batch render guards.
- `/queue/[id]` shows content readiness and the `콘텐츠 초안 생성` action without exposing secrets.

## Render Quality QA

- Python Worker image download uses a bounded timeout and requires HTTP 200.
- Non-image `Content-Type`, empty image bodies, and unreachable product image URLs fail/retry safely.
- Image download failure does not upload placeholder video/thumbnail/SRT/upload package artifacts.
- The vertical render layout stays 1080x1920 and uses scale/pad before burning subtitles.
- Generated thumbnails are 1080x1920 and wrap long product titles instead of overflowing.
- Render quality v2 layout presets (`hook`, `product_focus`, `benefit`, `caution`, `manual_cta`) keep image and caption boxes inside the 1080x1920 canvas.
- Render-plan shot durations map to SRT timing when `render_plan.shots[].duration_sec` is present.
- Dense captions wrap or clip with an ellipsis instead of overflowing the subtitle safe area.
- Thumbnail generation still succeeds with the default font fallback when a preferred Windows font path is unavailable.
- Render quality v3 keeps product imagery above the subtitle safe area instead of scaling it across the entire canvas.
- Subtitle styling uses a compact lower safe-area box, two-line wrapping, side margins, and a translucent background.
- Visual smoke must confirm subtitles do not cover the product image, title/caption text does not overflow, and the thumbnail title card remains readable.
- Upload package text may include non-secret render QA metadata; it must not include storage keys, service role keys, Authorization headers, or platform upload flags.

## Production Pilot QA

- `docs/PRODUCTION_HOSTING_DECISION.md` recommends the production pilot target before deployment.
- `docs/PRODUCTION_PILOT_RUNBOOK.md` documents Vercel WebApp plus local Windows Worker operation without executing deployment.
- `docs/PRODUCTION_PILOT_PREFLIGHT.md` documents the approval gate before any deploy or production smoke.
- `checklists/vercel-production-checklist.md` keeps WebApp secrets server-side and blocks `NEXT_PUBLIC_*` secrets.
- `checklists/local-worker-production-checklist.md` keeps `SUPABASE_SERVICE_ROLE_KEY` out of the Worker environment.
- `checklists/production-pilot-preflight-checklist.md` separates Vercel, Supabase, R2, Worker, approval, and safety readiness.
- `npm run preflight:production-pilot` prints configured/missing/manual-check status only.
- `npm run preflight:production-pilot` does not run Vercel deploy, Supabase CLI, R2 network calls, Python Worker, or platform upload APIs.
- Production pilot smoke confirms import creates candidates only.
- Promotion and content generation create zero `worker_jobs`.
- `/api/run/next-batch` remains the only worker-job creation path.
- Python Worker is started outside WebApp.
- R2 artifacts return HTTP 200 or expected signed URL responses.
- Channel upload package remains `manual_ready`, `upload_enabled=false`, and `manual_upload_only=true`.
- Pilot rollback stops the local worker, pauses automation, and preserves production data unless a backed-up cleanup is explicitly approved.

## Event Planner QA

- `GET /api/events` returns active event seeds without secrets.
- Upcoming event logic includes only active events inside the 7-30 day window.
- Event matching excludes duplicate candidates, missing affiliate URLs, and excluded keywords.
- Daily planner prefers `promotion_status=ready`, `duplicate_status=unique`, high candidate score, and higher event priority.
- Planner excludes product keys already produced on the same plan date.
- Channel profiles default to `upload_enabled=false` and `manual_upload_only=true`.
- `/channels` profile updates cannot enable upload automation and cannot disable manual-only mode.
- `/channels` responses and UI show OAuth readiness booleans only; they do not expose OAuth secrets or tokens.
- `GET /api/planner/daily` reports YouTube readiness booleans only and does not expose OAuth secrets.
- `candidate-video-smoke` seed creates a candidate only; it must not create a queue row or worker job.
- `/planner` is read-only planning UI; it must not create worker jobs.

## Table UX QA

- `/queue` supports product/keyword/error search, status filter, issue filter, sorting, and pagination.
- `/jobs` supports job/search text, status filter, job type filter, issue filter, sorting, and pagination.
- Existing server-side query filters still work before the client-side table filters are applied.
- Large local result sets remain client-side for now; server-side pagination is a later optimization.

## Content AI Provider QA

- `CONTENT_AI_PROVIDER=template` produces renderable draft content.
- `CONTENT_AI_PROVIDER=openai` without `OPENAI_API_KEY` falls back to template.
- Provider metadata exposes booleans only and no raw keys.
- Safety guard blocks guarantee, lowest-price, medical/health efficacy, and review-copy patterns.
- `generate-content` creates zero `worker_jobs`.
- `/api/run/next-batch` remains the only worker-job creation path.

## Render Plan Preview QA

- `/queue/[id]` shows a render plan preview when product name, affiliate link, thumbnail, video script, and disclosure text are ready.
- The preview shows `render_plan_attached=true`, shot count, total duration, per-shot captions, image URLs, voice text, and readiness status.
- `/queue/[id]` shows legacy fallback copy and missing inputs when a render plan cannot be built.
- The preview and lightweight override editor create zero `worker_jobs` and do not launch Python Worker.
- `POST /api/queue/[id]/render-plan-override` accepts only shot caption, voice text, duration, and operator metadata.
- Render plan override validation rejects unknown shot IDs, unsafe claim language, forbidden fields, image URL replacement, upload flags, and invalid durations.
- Saving an override stores `generated_contents.render_plan_override` separately from the deterministic base plan.
- `/api/run/next-batch` uses the effective render plan when a valid override exists.
- Invalid persisted overrides move the queue item to manual review instead of creating a worker job.
- The override workflow adds no ViMax dependency, no external video/image API call, and no platform upload behavior.

## Coupang Product-To-Video Smoke QA

- `/dev/test-lab` shows the `쿠팡 상품 → 쇼츠 영상 E2E Smoke` panel.
- Start creates only a `product_candidates` row.
- Promote creates a scheduled `product_queue` row and generated-content scaffold, not a worker job.
- Content draft generation fills `video_script` and creates zero worker jobs.
- Next-batch creates the `video_render` worker job and includes `image_url` or `thumbnail_url`.
- The status panel reports `render_plan_attached`, `render_plan_shot_count`, `render_plan_override_present`, and `effective_render_plan_shot_count`.
- The WebApp displays the Python Worker command but does not execute it.
- After the Worker runs externally, status reaches `video_ready` only when `video_url` exists.
- R2 or real storage artifact URLs for video, thumbnail, subtitle, and upload package return HTTP 200.
- Channel upload package creation returns `manual_ready`, `upload_enabled=false`, and `manual_upload_only=true`.
- YouTube/TikTok/Threads upload APIs remain absent and public upload stays disabled.

## Production Deployment QA

- Current production path is Coupang candidate import, candidate review, content draft, next-batch, Python Worker render, R2/S3 artifact upload, and manual channel upload package.
- n8n, Creatomate, and Google Docs generation are legacy/optional and not the primary production path.
- Web service env uses `AUTOMATION_REPOSITORY_ADAPTER=supabase`, `SUPABASE_URL`, and server-only `SUPABASE_SERVICE_ROLE_KEY`.
- Python Worker env uses `WEB_APP_BASE_URL`, `WORKER_API_SECRET`, `WORKER_ID`, `WORKER_JOB_TYPES`, and storage-specific R2/S3/Supabase Storage credentials.
- R2 live smoke uses `STORAGE_BACKEND=r2`, `R2_ENDPOINT_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_REGION=auto`, and four bucket-specific public base URLs.
- `CONTENT_AI_PROVIDER=template` remains the default production-safe content provider. `OPENAI_API_KEY` and `GEMINI_API_KEY` are optional server-only readiness values.
- `ENABLE_DEV_TOOLS` is unset or false for normal production.
- `/api/dev/*` mutation routes are available only in a controlled sandbox with `ENABLE_DEV_TOOLS=true`.
- Production smoke includes diagnostics, import-coupang, promote, generate-content, next-batch, external Python Worker, R2 artifact HTTP 200, build-upload-package, and manual result tracking.
- PowerShell Korean output issues are treated as console rendering problems unless browser/API-client output or UTF-8 source inspection proves a source string is corrupted.
- `npm run check:production-env` reports only configured booleans and warning codes; it must not print raw Supabase, R2, Worker, Coupang, OpenAI, or Gemini values.

## Verification Error-Triage Routine

- Record the failed phase first: request, repository adapter, migration, PostgREST schema cache, environment variable, Python Worker, image download, ffmpeg render, R2/S3 upload, browser rendering, or PowerShell console rendering.
- Capture evidence without secrets: request URL, HTTP status, safe response body, dev server stack trace, Supabase SQL result, worker log, `candidate_id`, `queue_id`, `worker_job_id`, branch, and commit.
- Identify the root cause before editing. Add a RED regression test first for empty 500s, schema failures, fake success risks, and `video_ready` without `video_url`.
- Keep fixes minimal. Do not change the worker job creation path, public upload defaults, manual-only channel package semantics, or secret handling.
- Verify GREEN with targeted tests, full `npm run test`, Python unittest, lint, build, compileall, `git diff --check`, secret grep, and forbidden-path staging scan.
- Report unavailable sandbox/live checks as NOT RUN, not PASS.

## Ops / Collector / Artifact QA Checks

- `GET /api/ops/production-readiness` returns counts and booleans only.
- `POST /api/candidates/collect-coupang` creates candidates only.
- Collector responses must show `queue_created=false` and `worker_jobs_created=false`.
- `GET /api/artifacts` returns safe artifact summaries.
- `POST /api/artifacts/[id]/qa` updates QA status without creating worker jobs or triggering upload.
- Collector responses must also show `upload_triggered=false`.
- `GET /api/artifacts` filters by QA status, asset type, missing artifact type, search text, and sort order.
- `POST /api/artifacts/bulk-qa` updates selected artifact QA fields only and returns `upload_triggered=false`, `worker_jobs_created=false`, and `queue_auto_uploaded_or_posted=false`.
- Client components must not reference service role keys, R2 secrets, worker secrets, Coupang secrets, or Authorization headers.
