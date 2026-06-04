# Production Pilot Preflight

Status: preparation only. This document does not approve, create, or execute a production deployment.

Use this preflight after the production target decision and before a human-approved Vercel WebApp plus local Windows Python Worker pilot.

## 0. Approval Gate

Actual deployment and production smoke are blocked until the operator explicitly approves them.

Do not run:

```text
vercel deploy
vercel --prod
supabase db push
wrangler deploy
```

The preflight checks only readiness inputs. It must not call Vercel CLI, Supabase CLI, R2 APIs, platform upload APIs, or Python Worker.

## 1. Safe Preflight Script

Run:

```powershell
npm run preflight:production-pilot
```

Expected behavior:

- prints configured/missing booleans and manual-check status only;
- prints no raw Supabase, R2, Worker, Coupang, OpenAI, Gemini, YouTube, or Authorization values;
- executes no deploy command;
- invokes no Vercel CLI;
- invokes no Supabase CLI;
- performs no R2 network call;
- leaves `production_pilot_preflight_ready=false` until manual approval and live checks are complete.

The script is a checklist aid, not a deployment gate bypass.

## 2. Vercel WebApp Readiness

Confirm manually:

- GitHub repository connected.
- Vercel project created or selected.
- Node runtime and build command reviewed.
- Build command is `npm run build`.
- `PUBLIC_APP_BASE_URL` will match the production URL.
- `ENABLE_DEV_TOOLS=false` or unset.
- `ENABLE_MOCK_STORAGE_ROUTE=false` or unset.
- `AUTOMATION_REPOSITORY_ADAPTER=supabase`.
- `SUPABASE_URL` configured server-side.
- `SUPABASE_SERVICE_ROLE_KEY` configured server-side.
- `WORKER_API_SECRET` configured server-side.
- `CONTENT_AI_PROVIDER=template`.
- YouTube upload env is absent or disabled.

Forbidden Vercel env:

```text
NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_WORKER_API_SECRET
NEXT_PUBLIC_R2_SECRET_ACCESS_KEY
NEXT_PUBLIC_OPENAI_API_KEY
NEXT_PUBLIC_GEMINI_API_KEY
NEXT_PUBLIC_COUPANG_SECRET_KEY
```

## 3. Supabase Readiness

Confirm manually:

- production project ref is known.
- migrations `001` through `007` are applied.
- `automation_settings.id='default'` exists.
- `channel_profiles` are seeded.
- `channel_upload_packages` exists.
- `generated_contents.render_plan_override` exists.
- `product_assets` exists.
- RLS is enabled on automation tables.
- broad anon/authenticated public read/write policies are absent.
- PostgREST schema cache was reloaded after migration.

Use:

```sql
notify pgrst, 'reload schema';
```

Do not paste the database connection string or service role key into docs, PRs, or chat.

## 4. Cloudflare R2 Readiness

Confirm manually:

- `rendered-videos` bucket exists.
- `thumbnails` bucket exists.
- `subtitles` bucket exists.
- `upload-packages` bucket exists.
- bucket-specific public base URLs are prepared.
- R2 endpoint and access keys are configured only in the local Worker runtime.
- first live render will verify artifact URL HTTP 200 or expected signed URL response.

The preflight script does not contact R2. Live URL checks happen only after the operator approves the production smoke.

## 5. Local Windows Worker Readiness

Confirm manually:

- Python 3.12.x installed.
- `python-worker/.venv` created with the supported interpreter.
- Worker requirements installed.
- ffmpeg or imageio-ffmpeg fallback verified.
- `WEB_APP_BASE_URL` will point at the Vercel production URL.
- `WORKER_API_SECRET` matches the WebApp server env.
- `STORAGE_BACKEND=r2`.
- R2 env is configured in `python-worker/.env`.
- `SUPABASE_SERVICE_ROLE_KEY` is not in `python-worker/.env`.
- Worker starts only when the operator runs it in PowerShell.

The WebApp must not launch Python Worker.

## 6. Smoke Approval Sequence

After approval only:

1. deploy WebApp.
2. run diagnostics and confirm configured booleans only.
3. import one Coupang candidate.
4. promote candidate.
5. generate content.
6. run next-batch.
7. start local Worker manually.
8. confirm R2 artifact HTTP 200.
9. build channel upload package.
10. record manual upload result if applicable.

The smoke passes only when `video_ready` has `video_url` and product assets exist. Passing smoke still does not enable YouTube, TikTok, Threads, OAuth token storage, or public upload.

## 7. Failure Handling

If any preflight item is missing:

1. record the failed area: Vercel, Supabase, R2, Worker, safety, or approval.
2. do not run deployment.
3. do not run production smoke.
4. fix the missing input.
5. rerun `npm run preflight:production-pilot`.

If a live smoke later fails, use `docs/PRODUCTION_PILOT_RUNBOOK.md` rollback and triage. Do not report PASS when artifact upload, worker completion, or `video_url` verification is missing.
