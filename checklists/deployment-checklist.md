# Deployment Checklist

## Before Deploy

- [ ] `npm run test`
- [ ] `python -m unittest discover python-worker/tests`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `python -m compileall python-worker`
- [ ] `npm run check:production-env`
- [ ] `git diff --check`
- [ ] `git diff --cached --check`
- [ ] `.env.local` is not staged.
- [ ] `python-worker/.env` is not staged.
- [ ] `data/*.json` is not staged.
- [ ] `data/*.tmp` is not staged.
- [ ] `python-worker/.venv`, `python-worker/outputs`, `python-worker/temp`, and worker logs are not staged.

## Web Service Env

- [ ] `WORKER_API_SECRET` is set server-side.
- [ ] `PUBLIC_APP_BASE_URL` is set.
- [ ] `AUTOMATION_REPOSITORY_ADAPTER=supabase`.
- [ ] `SUPABASE_URL` is set server-side.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is set server-side and has no `NEXT_PUBLIC_` prefix.
- [ ] `CONTENT_AI_PROVIDER=template`.
- [ ] `OPENAI_API_KEY` and `GEMINI_API_KEY` are unset or server-only placeholders unless a later reviewed PR enables live provider calls.
- [ ] `ENABLE_DEV_TOOLS` is unset or false for normal production.
- [ ] n8n env vars are unset unless legacy Nightly Scout is intentionally used.

## Python Worker Env

- [ ] `WEB_APP_BASE_URL` points to the deployed web service.
- [ ] `WORKER_API_SECRET` matches the web service secret.
- [ ] `WORKER_ID` is unique per worker.
- [ ] `WORKER_JOB_TYPES=video_render,sheet_sync`.
- [ ] `STORAGE_BACKEND=r2` or another production storage backend.
- [ ] `R2_ENDPOINT_URL` is set if using R2.
- [ ] `R2_ACCESS_KEY_ID` is set if using R2.
- [ ] `R2_SECRET_ACCESS_KEY` is set if using R2.
- [ ] `R2_REGION=auto` if using R2.
- [ ] `R2_PUBLIC_BASE_URL_RENDERED_VIDEOS` is set.
- [ ] `R2_PUBLIC_BASE_URL_THUMBNAILS` is set.
- [ ] `R2_PUBLIC_BASE_URL_SUBTITLES` is set.
- [ ] `R2_PUBLIC_BASE_URL_UPLOAD_PACKAGES` is set.
- [ ] Python Worker does not contain `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Python Worker uses storage-specific credentials only.
- [ ] `imageio-ffmpeg` or system ffmpeg resolves before live render smoke.

## Supabase And Storage

- [ ] Supabase migrations `001` through the latest required migration are applied.
- [ ] RLS is enabled on automation tables.
- [ ] No broad anon/authenticated public read/write policy exists.
- [ ] `automation_settings.id='default'` exists.
- [ ] Migration 008 artifact QA columns, indexes, RLS/policy posture, and smoke row behavior are verified.
- [ ] R2/S3 buckets exist for rendered videos, thumbnails, subtitles, and upload packages.
- [ ] Artifact URLs are real storage URLs, not `/mock-storage`.

## Production Smoke

- [ ] Diagnostics show `repository.adapter=supabase`.
- [ ] Diagnostics show Supabase configured booleans only and no raw key/secret.
- [ ] `POST /api/candidates/import-coupang` creates a candidate only.
- [ ] Candidate promotion creates a scheduled queue item and generated-content scaffold only.
- [ ] `POST /api/queue/[id]/generate-content` fills `video_script` and creates zero worker jobs.
- [ ] `POST /api/run/next-batch` creates the `video_render` worker job.
- [ ] Python Worker is started externally and not by WebApp.
- [ ] Worker job completes only with `video_url`.
- [ ] Queue reaches `video_ready` only with `video_url`.
- [ ] Video, thumbnail, subtitle, and upload package URLs return HTTP 200 or valid signed URL responses.
- [ ] Artifact QA filters and bulk QA update selected rows without creating worker jobs or triggering upload.
- [ ] Channel upload package is `manual_ready`, `upload_enabled=false`, and `manual_upload_only=true`.
- [ ] Manual result tracking can mark uploaded, skipped, or needs_fix without calling platform APIs.

## Safety

- [ ] `run_mode=generate_only`.
- [ ] `youtube_upload_enabled=false`.
- [ ] Channel profiles keep `upload_enabled=false`.
- [ ] Channel packages keep `manual_upload_only=true`.
- [ ] Public upload remains disabled.
- [ ] No actual YouTube/TikTok/Threads upload integration is deployed.
- [ ] Worker complete without `video_url` has been tested.
- [ ] PowerShell Korean mojibake is checked with `.\scripts\dev\powershell-utf8.ps1`, browser output, or an API client before treating it as a source/API failure.
- [ ] Korean PowerShell smoke payloads use a UTF-8 body file such as `tmp-coupang-import-body.json` with `application/json; charset=utf-8`.
- [ ] `node scripts/check-mojibake.mjs` reports no unexpected source-level mojibake before release notes are finalized.
