# Deployment Checklist

## Before Deploy

- [ ] `npm run test`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `python -m compileall python-worker`
- [ ] `.env.local` is not staged.
- [ ] `data/*.json` is not staged.

## Web Service Env

- [ ] `WORKER_API_SECRET` is set server-side.
- [ ] `PUBLIC_APP_BASE_URL` is set.
- [ ] `AUTOMATION_STORAGE_ADAPTER` is set.
- [ ] `AUTOMATION_DATA_DIR` or production DB adapter is configured.
- [ ] n8n env vars are set only if legacy Nightly Scout is used.

## Python Worker Env

- [ ] `WEB_APP_BASE_URL` points to the deployed web service.
- [ ] `WORKER_API_SECRET` matches the web service secret.
- [ ] `WORKER_ID` is unique per worker.
- [ ] `WORKER_JOB_TYPES=video_render,sheet_sync`.
- [ ] `STORAGE_BACKEND` is configured.
- [ ] Local or S3/R2/Supabase-compatible storage settings are configured.
- [ ] `ffmpeg` is installed if real MP4 rendering is expected.

## Safety

- [ ] `run_mode=generate_only`.
- [ ] `youtube_upload_enabled=false`.
- [ ] Public upload remains disabled.
- [ ] No actual YouTube/TikTok/Threads upload integration is deployed.
- [ ] Worker complete without `video_url` has been tested.
