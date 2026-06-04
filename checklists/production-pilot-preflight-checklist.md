# Production Pilot Preflight Checklist

Use this before any Vercel production deployment or production smoke.

## Approval

- [ ] Operator explicitly approved the production pilot timing.
- [ ] Deployment owner is identified.
- [ ] Rollback owner is identified.
- [ ] Evidence capture path is prepared without secrets.
- [ ] No deploy command has been run by this checklist.

## Vercel WebApp

- [ ] GitHub repo connected.
- [ ] Vercel project created or selected.
- [ ] Build command reviewed as `npm run build`.
- [ ] `PUBLIC_APP_BASE_URL` will match the production URL.
- [ ] `AUTOMATION_REPOSITORY_ADAPTER=supabase`.
- [ ] `SUPABASE_URL` configured server-side.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` configured server-side.
- [ ] `WORKER_API_SECRET` configured server-side.
- [ ] `CONTENT_AI_PROVIDER=template`.
- [ ] `ENABLE_DEV_TOOLS` unset or `false`.
- [ ] `ENABLE_MOCK_STORAGE_ROUTE` unset or `false`.
- [ ] No `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`.
- [ ] No `NEXT_PUBLIC_WORKER_API_SECRET`.
- [ ] No `NEXT_PUBLIC_R2_SECRET_ACCESS_KEY`.

## Supabase

- [ ] Production project ref confirmed.
- [ ] Migrations `001` through `007` applied.
- [ ] PostgREST schema cache reloaded.
- [ ] RLS enabled on automation tables.
- [ ] Broad anon/authenticated public policies absent.
- [ ] `automation_settings.id='default'` exists.
- [ ] `channel_profiles` seeded.
- [ ] `channel_upload_packages` exists.
- [ ] `generated_contents.render_plan_override` exists.
- [ ] `product_assets` exists.

## R2

- [ ] `rendered-videos` bucket ready.
- [ ] `thumbnails` bucket ready.
- [ ] `subtitles` bucket ready.
- [ ] `upload-packages` bucket ready.
- [ ] bucket-specific public base URLs prepared.
- [ ] R2 credentials kept out of client env.
- [ ] first live smoke will verify artifact URL HTTP 200 or expected signed URL response.

## Local Worker

- [ ] Python 3.12.x installed.
- [ ] `python-worker/.venv` created.
- [ ] Worker requirements installed.
- [ ] ffmpeg or imageio-ffmpeg fallback verified.
- [ ] `WEB_APP_BASE_URL` will point at production URL.
- [ ] `WORKER_API_SECRET` matches WebApp server env.
- [ ] `STORAGE_BACKEND=r2`.
- [ ] R2 env configured in `python-worker/.env`.
- [ ] No `SUPABASE_SERVICE_ROLE_KEY` in `python-worker/.env`.
- [ ] Worker starts manually in PowerShell only.

## Safety

- [ ] YouTube `videos.insert` absent.
- [ ] TikTok Direct Post absent.
- [ ] Threads post absent.
- [ ] OAuth token storage absent.
- [ ] `youtube_upload_enabled=false`.
- [ ] channel `upload_enabled=false`.
- [ ] channel package `manual_upload_only=true`.
- [ ] public upload disabled.
- [ ] `/api/run/next-batch` remains the only worker-job creation path.
- [ ] WebApp does not launch Python Worker.
- [ ] `.env.local` not committed.
- [ ] `python-worker/.env` not committed.
- [ ] worker outputs/temp/logs not committed.
