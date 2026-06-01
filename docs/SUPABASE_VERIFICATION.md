# Supabase Verification

Use this checklist before treating the Supabase repository adapter as production-ready. Do not print service role keys, database passwords, storage keys, or full connection strings in logs, PRs, screenshots, or terminal output.

## Scope

This verifies the WebApp repository database only:

- automation settings
- product queue
- generated content
- run logs
- worker jobs
- worker heartbeats
- product candidates
- product assets
- production history

The Python Worker must still poll the WebApp API. It must not connect directly to Supabase Postgres.

Supabase Storage or R2 artifact upload is verified separately in the storage smoke section below.

## Dashboard Verification

In the Supabase dashboard for the sandbox or target project:

1. Open Table Editor and confirm these public tables exist:
   - `automation_settings`
   - `product_queue`
   - `generated_contents`
   - `automation_runs`
   - `worker_jobs`
   - `worker_heartbeats`
   - `product_candidates`
   - `product_assets`
   - `production_history`
2. Confirm the migrations from `supabase/migrations/001_automation_core.sql` and `supabase/migrations/002_candidate_scoring_fields.sql` have been applied.
3. Confirm `automation_settings` contains one row where `id = 'default'`.
4. Confirm Row Level Security is enabled on every table above.
5. Confirm there are no wide-open `anon` or `authenticated` public read/write policies.
6. Confirm `product_candidates` has the candidate quality fields from `002_candidate_scoring_fields.sql`: `product_key`, `candidate_score`, `duplicate_status`, `promotion_status`, and `promoted_queue_id`.

Expected result:

- `rowsecurity = true` for all nine tables.
- `pg_policies` returns no policy rows, or only intentionally reviewed server-side policies.
- No policy grants broad `anon` or `authenticated` read/write access.

## SQL Verification

Run the SQL in `docs/sql/verify_supabase_core.sql` from the Supabase SQL Editor, or with `psql` when you have a database connection string.

PowerShell with `psql`:

```powershell
psql "DB_CONNECTION_STRING" -f docs/sql/verify_supabase_core.sql
```

Do not commit or print `DB_CONNECTION_STRING`.

Manual SQL snippets:

```sql
select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'automation_settings',
    'product_queue',
    'generated_contents',
    'automation_runs',
    'worker_jobs',
    'worker_heartbeats',
    'product_candidates',
    'product_assets',
    'production_history'
  )
order by tablename;
```

```sql
select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'automation_settings',
    'product_queue',
    'generated_contents',
    'automation_runs',
    'worker_jobs',
    'worker_heartbeats',
    'product_candidates',
    'product_assets',
    'production_history'
  )
order by tablename, policyname;
```

```sql
select * from public.automation_settings where id = 'default';
```

## WebApp Diagnostics

With `.env.local` configured server-side only:

```text
AUTOMATION_REPOSITORY_ADAPTER=supabase
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
WORKER_API_SECRET=...
PUBLIC_APP_BASE_URL=http://localhost:3000
```

Run:

```powershell
npm run dev
Invoke-RestMethod http://localhost:3000/api/dev/diagnostics | ConvertTo-Json -Depth 8
```

Expected:

- `repository.adapter = "supabase"`
- `repository.supabase_url_configured = true`
- `repository.supabase_service_role_configured = true`

The response must not contain:

- raw Supabase URL
- `SUPABASE_SERVICE_ROLE_KEY`
- `WORKER_API_SECRET`
- JWT-like service role values
- raw Authorization headers

If Korean text appears corrupted in Windows PowerShell, run:

```powershell
.\scripts\dev\powershell-utf8.ps1
```

If the console still displays mojibake, verify the endpoint in a browser or inspect source strings with Python:

```powershell
python -c "from pathlib import Path; print(repr(Path('app/api/dev/seed/route.ts').read_text(encoding='utf-8')[0:500]))"
```

## Supabase Worker Smoke

Use a sandbox database. Do not run destructive cleanup against production.

Optional sandbox cleanup:

```sql
delete from public.product_assets where product_queue_id = 'queue-worker-smoke-001';
delete from public.production_history where product_queue_id = 'queue-worker-smoke-001';
delete from public.worker_jobs where product_queue_id = 'queue-worker-smoke-001';
delete from public.generated_contents where product_queue_id = 'queue-worker-smoke-001';
delete from public.product_queue where id = 'queue-worker-smoke-001';
```

Smoke steps:

1. Confirm diagnostics shows `repository.adapter = "supabase"`.
2. Seed a renderable item:

```powershell
Invoke-RestMethod -Method Post -ContentType "application/json" -Body '{"mode":"worker-smoke"}' http://localhost:3000/api/dev/seed | ConvertTo-Json -Depth 8
```

3. Trigger next batch:

```powershell
Invoke-RestMethod -Method Post http://localhost:3000/api/run/next-batch | ConvertTo-Json -Depth 8
```

4. Run the Python Worker with WebApp API credentials only:

```powershell
cd python-worker
.\.venv\Scripts\python worker.py
```

5. Confirm in Supabase:
   - `worker_jobs.status = 'completed'`
   - `worker_jobs.result->>'video_url'` is not empty
   - `product_queue.queue_status = 'video_ready'`
   - `product_queue.video_url` is not empty
   - `product_assets` has video, thumbnail, subtitle, and upload package rows
   - `production_history` has `worker_job_completed`

Failure condition:

- `queue_status = 'video_ready'` with an empty `video_url` is a release blocker.
- A failed render must remain `retry_wait` or `failed`; it must not be marked completed.

## Artifact Storage Live Smoke

Local mock storage is not enough for production readiness. Choose one backend for live smoke:

- Supabase Storage through its S3-compatible endpoint
- Cloudflare R2 or another S3-compatible backend

Required buckets:

- `rendered-videos`
- `thumbnails`
- `subtitles`
- `upload-packages`

Optional buckets used by other worker flows:

- `sheet-exports`
- `product-images`

Python Worker storage env examples:

```text
STORAGE_BACKEND=supabase
SUPABASE_STORAGE_ENDPOINT_URL=https://project-ref.storage.supabase.co/storage/v1/s3
SUPABASE_STORAGE_ACCESS_KEY_ID=replace-with-storage-access-key
SUPABASE_STORAGE_SECRET_ACCESS_KEY=replace-with-storage-secret-key
SUPABASE_STORAGE_REGION=us-east-1
SUPABASE_STORAGE_PUBLIC_BASE_URL=https://project-ref.supabase.co/storage/v1/object/public
```

```text
STORAGE_BACKEND=r2
R2_ENDPOINT_URL=https://account-id.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=replace-with-r2-access-key
R2_SECRET_ACCESS_KEY=replace-with-r2-secret-key
R2_REGION=auto
R2_PUBLIC_BASE_URL=https://cdn.example.com
```

Storage live smoke passes only when:

- `STORAGE_BACKEND` is not `local`.
- Generated URLs are not `/mock-storage/...`.
- video, thumbnail, SRT, and upload package objects exist in the selected backend.
- each artifact URL returns HTTP 200 or a valid signed URL response.
- `product_assets.url` values match the selected backend URLs.

Do not put `SUPABASE_SERVICE_ROLE_KEY` in `python-worker/.env`. The worker should use storage-specific credentials, and it should continue to report results through WebApp APIs only.
