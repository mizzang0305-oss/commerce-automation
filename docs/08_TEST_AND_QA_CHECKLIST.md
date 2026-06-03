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
- n8n webhook is not called by `/api/run/next-batch`.

## Security QA

- Client components do not reference `WORKER_API_SECRET`.
- Client components do not reference `SUPABASE_SERVICE_ROLE_KEY`.
- Client components do not reference service role or provider API keys.
- Logs do not print Authorization headers.
- Production blocks `POST /api/dev/seed`, `/api/dev/reset-storage`, and `/api/dev/reset-settings` unless `ENABLE_DEV_TOOLS=true`.
- `/api/dev/diagnostics` returns configured booleans only and does not expose raw Supabase URL or service role key.
- `.env.local` is not committed.
- `data/*.json` is not committed.

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
- `product_key` generation must not include secret-like payload keys or token values.
- `/api/candidates/import-coupang` accepts only Coupang product detail URLs, strips tracking parameters, validates optional `link.coupang.com/a/...` affiliate links, and returns `queue_items_created=0` plus `worker_jobs_created=0`.
- Coupang CSV rows use the same product key and affiliate readiness enrichment as manual `/candidates` input.
- Missing `selected_affiliate_url` maps to `blocked_missing_affiliate`; missing `product_name` maps to `blocked_missing_name`.
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

## Event Planner QA

- `GET /api/events` returns active event seeds without secrets.
- Upcoming event logic includes only active events inside the 7-30 day window.
- Event matching excludes duplicate candidates, missing affiliate URLs, and excluded keywords.
- Daily planner prefers `promotion_status=ready`, `duplicate_status=unique`, high candidate score, and higher event priority.
- Planner excludes product keys already produced on the same plan date.
- Channel profiles default to `upload_enabled=false` and `manual_upload_only=true`.
- `GET /api/planner/daily` reports YouTube readiness booleans only and does not expose OAuth secrets.
- `candidate-video-smoke` seed creates a candidate only; it must not create a queue row or worker job.
- `/planner` is read-only planning UI; it must not create worker jobs.

## Table UX QA

- `/queue` supports product/keyword/error search, status filter, issue filter, sorting, and pagination.
- `/jobs` supports job/search text, status filter, job type filter, issue filter, sorting, and pagination.
- Existing server-side query filters still work before the client-side table filters are applied.
- Large local result sets remain client-side for now; server-side pagination is a later optimization.
