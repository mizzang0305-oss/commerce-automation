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
- Supabase migration enables RLS and creates no anon/public write policies.
- Supabase integration tests run only when explicit Supabase env is configured.

## Upload QA

- `run_mode` default is `generate_only`.
- `youtube_upload_enabled` default is `false`.
- No real YouTube/TikTok/Threads upload code path is enabled.

## Artifact Storage QA

- Local storage still serves `/mock-storage/...` only for local/dev smoke.
- Supabase/R2 storage keys are not exposed to client components.
- `python-worker/.env` does not contain `SUPABASE_SERVICE_ROLE_KEY`.
- Unsafe storage keys such as `../video.mp4` are rejected.
- Missing storage credentials fail/retry the worker job without fake success.

## Collector QA

- `/api/collectors/import-csv` is blocked in production unless `ENABLE_DEV_TOOLS=true`.
- CSV imports reject empty product names, empty URLs, and non-http(s) URLs.
- Imported rows are stored as `product_candidates`, not `product_queue`.
- Collectors do not create `worker_jobs` directly.
- Crawling/import work does not bypass login, CAPTCHA, bot blocking, terms, or copy protected review text.

## Table UX QA

- `/queue` supports product/keyword/error search, status filter, issue filter, sorting, and pagination.
- `/jobs` supports job/search text, status filter, job type filter, issue filter, sorting, and pagination.
- Existing server-side query filters still work before the client-side table filters are applied.
- Large local result sets remain client-side for now; server-side pagination is a later optimization.
