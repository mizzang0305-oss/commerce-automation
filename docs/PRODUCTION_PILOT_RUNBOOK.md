# Vercel WebApp + Local Windows Worker Production Pilot Runbook

Status: preparation guide only. No deployment is executed by this document.

Target baseline:

- WebApp: Vercel-hosted Next.js service.
- Worker: local Windows Python Worker started by the operator.
- Repository: Supabase/Postgres.
- Artifact storage: Cloudflare R2.
- Uploads: manual-only channel upload packages.

This runbook prepares the first production pilot for the single-operator Coupang MVP. It must not enable YouTube, TikTok, Threads, public upload, OAuth token storage, or WebApp-managed Python Worker execution.

## 0. Hard Boundaries

- Do not run production deployment commands until the operator explicitly approves the deployment step.
- Do not upload `.env.local` or `python-worker/.env`.
- Do not put secrets in `NEXT_PUBLIC_*` variables.
- Do not put `SUPABASE_SERVICE_ROLE_KEY` in the Python Worker environment.
- Do not implement or enable YouTube `videos.insert`.
- Do not implement or enable TikTok Direct Post.
- Do not implement or enable Threads post.
- Keep `youtube_upload_enabled=false`.
- Keep channel `upload_enabled=false`.
- Keep channel packages `manual_upload_only=true`.
- Keep `/api/run/next-batch` as the only worker-job creation path.
- Do not let the WebApp launch Python Worker.

## 1. Prerequisites

Local checks before any provider setup:

```powershell
npm run check:production-env
npm run check:mojibake
npm run test
python -m unittest discover python-worker/tests
npm run lint
npm run build
python -m compileall python-worker
git diff --check
```

Expected:

- Tests pass.
- `check:mojibake` reports zero source-level matches.
- `check:production-env` prints names, booleans, and warning codes only.
- No raw Supabase, R2, Worker, Coupang, OpenAI, Gemini, or Authorization values are printed.

## 2. Vercel WebApp Setup

Operator steps:

1. Create or select a Vercel project.
2. Connect the GitHub repository.
3. Confirm the project root is the repository root.
4. Use the default Next.js build or set build command to:

```text
npm run build
```

5. Set production environment variables in Vercel's server-side environment store:

```text
AUTOMATION_REPOSITORY_ADAPTER=supabase
SUPABASE_URL=<supabase-project-url>
SUPABASE_SERVICE_ROLE_KEY=<server-only-service-role-key>
WORKER_API_SECRET=<shared-worker-secret>
PUBLIC_APP_BASE_URL=https://<vercel-domain>
CONTENT_AI_PROVIDER=template
ENABLE_DEV_TOOLS=false
ENABLE_MOCK_STORAGE_ROUTE=false
```

Forbidden Vercel env:

```text
NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_WORKER_API_SECRET
NEXT_PUBLIC_COUPANG_SECRET_KEY
NEXT_PUBLIC_OPENAI_API_KEY
NEXT_PUBLIC_GEMINI_API_KEY
NEXT_PUBLIC_R2_SECRET_ACCESS_KEY
```

Do not set YouTube upload automation env values for this pilot.

## 3. Supabase Setup

Apply migrations in order:

```text
001_automation_core.sql
002_candidate_scoring_fields.sql
003_event_calendar_and_planner.sql
004_channel_upload_packages.sql
005_channel_upload_package_results.sql
006_channel_profile_admin_readiness.sql
007_generated_content_render_plan_override.sql
```

Reload PostgREST schema after migrations:

```sql
notify pgrst, 'reload schema';
```

Verify:

- `automation_settings.id='default'` exists.
- `channel_profiles` seed rows exist.
- `channel_upload_packages` has result-tracking fields.
- `generated_contents.render_plan_override` exists.
- RLS is enabled on automation tables.
- No broad anon/authenticated public read/write policies exist.

Use:

```text
docs/SUPABASE_VERIFICATION.md
docs/sql/verify_supabase_core.sql
```

## 4. Cloudflare R2 Setup

Use the existing four-bucket layout:

```text
rendered-videos
thumbnails
subtitles
upload-packages
```

For each bucket:

1. Confirm the bucket exists.
2. Configure a public development URL or production custom domain.
3. Record only the public base URL needed for artifact links.
4. Keep access keys server-side in the Python Worker environment only.

Do not expose R2 access keys to the WebApp client.

## 5. Local Windows Python Worker Setup

Required local runtime:

- Python 3.12.x.
- Worker virtual environment under `python-worker/.venv`.
- ffmpeg available through system ffmpeg or imageio-ffmpeg fallback.

Worker `.env` template:

```text
WEB_APP_BASE_URL=https://<vercel-domain>
WORKER_API_SECRET=<same-as-webapp>
WORKER_ID=local-windows-worker-01
WORKER_JOB_TYPES=video_render,sheet_sync
POLL_INTERVAL_SECONDS=5
HEARTBEAT_INTERVAL_SECONDS=15
STORAGE_BACKEND=r2
R2_ENDPOINT_URL=<r2-endpoint>
R2_ACCESS_KEY_ID=<r2-access-key>
R2_SECRET_ACCESS_KEY=<r2-secret-key>
R2_REGION=auto
R2_PUBLIC_BASE_URL_RENDERED_VIDEOS=<video-public-base-url>
R2_PUBLIC_BASE_URL_THUMBNAILS=<thumbnail-public-base-url>
R2_PUBLIC_BASE_URL_SUBTITLES=<subtitle-public-base-url>
R2_PUBLIC_BASE_URL_UPLOAD_PACKAGES=<upload-package-public-base-url>
```

Do not add:

```text
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_URL
NEXT_PUBLIC_*
```

Do not put `SUPABASE_SERVICE_ROLE_KEY` in `python-worker/.env`.

Manual worker start:

```powershell
cd C:\Users\LOVE\MyProjects\commerce-automation\python-worker
.\.venv\Scripts\python worker.py
```

For first pilot, keep an operator-visible PowerShell window. Windows Task Scheduler or NSSM can be evaluated after the manual pilot passes.

## 6. Production Smoke Sequence

Run this only after the operator approves the production pilot smoke.

1. Open the deployed WebApp.
2. Confirm diagnostics show configured booleans only and no raw secrets.
3. Import one Coupang candidate.
4. Confirm import creates:
   - one `product_candidates` row;
   - zero `product_queue` rows;
   - zero `worker_jobs`.
5. Promote the candidate.
6. Confirm promotion creates:
   - one scheduled `product_queue` row;
   - generated-content scaffold;
   - zero `worker_jobs`.
7. Generate content draft.
8. Confirm content generation creates zero `worker_jobs`.
9. Optionally inspect render plan preview or save a safe render plan override.
10. Run `/api/run/next-batch`.
11. Confirm exactly one `video_render` worker job is created.
12. Start Python Worker manually from PowerShell.
13. Confirm worker claim and heartbeat.
14. Confirm final job status is `completed`.
15. Confirm final queue status is `video_ready`.
16. Confirm `video_url` exists.
17. Confirm product assets exist:
    - `video`;
    - `thumbnail`;
    - `subtitle`;
    - `upload_package`.
18. Confirm each artifact URL returns HTTP 200 or the expected signed URL response.
19. Build a channel upload package.
20. Confirm:
    - `status=manual_ready`;
    - `upload_enabled=false`;
    - `manual_upload_only=true`.
21. Mark upload package `uploaded`, `skipped`, or `needs_fix` only as a manual result-tracking action.

Passing this smoke does not mean platform upload is enabled. It means the manual-upload production pilot path is ready.

## 7. Rollback Plan

If the pilot fails:

1. Stop the local Python Worker.
2. Set automation settings to paused.
3. Do not run `next-batch`.
4. Hold or skip problematic queue items.
5. Roll back to the previous Vercel deployment if the WebApp is the suspected fault.
6. Keep Supabase data and R2 artifacts unless a backed-up cleanup plan is explicitly approved.
7. Preserve worker logs and safe response bodies for triage.

Do not delete production data as a first response.

## 8. Failure Triage

| Symptom | Likely cause | First action |
| --- | --- | --- |
| Worker claim returns 401 | `WORKER_API_SECRET` mismatch | Compare configured booleans and rotate if exposed |
| Worker claim returns 404 | Wrong `WEB_APP_BASE_URL` | Verify deployed base URL |
| Supabase 500 or schema error | Missing migration or stale PostgREST cache | Apply migration and run `notify pgrst, 'reload schema';` |
| R2 upload fails | R2 endpoint/key/bucket mismatch | Verify worker env and bucket names |
| R2 URL returns 403/404 | Public base URL or custom domain mismatch | Verify bucket public URL mapping |
| `created_jobs=0` | Queue not scheduled or readiness guard failed | Check affiliate URL, disclosure, video script, thumbnail, daily limit |
| Worker completed without artifact | Blocker bug | Stop pilot and inspect worker completion path |
| `video_ready` without `video_url` | Blocker bug | Stop pilot and do not report PASS |
| Korean API text looks corrupted in PowerShell | Console encoding | Run `.\scripts\dev\powershell-utf8.ps1` and verify in browser |

## 9. Evidence To Capture

Capture these without secrets:

- deployed WebApp host;
- `candidate_id`;
- `queue_id`;
- `worker_job_id`;
- final job status;
- final queue status;
- product asset count;
- artifact URL HTTP status only;
- upload package id and status;
- diagnostics booleans only;
- worker heartbeat visibility.

Never paste raw service role keys, R2 secrets, Worker API secrets, Coupang secrets, OpenAI/Gemini keys, or Authorization headers into PRs, docs, issues, or chat.
