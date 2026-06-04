# Local Windows Worker Production Checklist

This checklist prepares the operator-controlled Windows Python Worker for the first production pilot.

## Runtime

- [ ] Python 3.12.x installed.
- [ ] `python-worker/.venv` created with Python 3.12.x.
- [ ] Worker dependencies installed.
- [ ] `python -m unittest discover tests` passes inside `python-worker`.
- [ ] `python -m compileall .` passes inside `python-worker`.
- [ ] ffmpeg or imageio-ffmpeg fallback is available.
- [ ] PowerShell UTF-8 helper is available for smoke commands.

## Worker Env

- [ ] `WEB_APP_BASE_URL` points to the deployed WebApp.
- [ ] `WORKER_API_SECRET` matches the WebApp server value.
- [ ] `WORKER_ID=local-windows-worker-01` or another unique id.
- [ ] `WORKER_JOB_TYPES=video_render,sheet_sync`.
- [ ] `STORAGE_BACKEND=r2`.
- [ ] `R2_ENDPOINT_URL` set.
- [ ] `R2_ACCESS_KEY_ID` set.
- [ ] `R2_SECRET_ACCESS_KEY` set.
- [ ] `R2_REGION=auto`.
- [ ] `R2_PUBLIC_BASE_URL_RENDERED_VIDEOS` set.
- [ ] `R2_PUBLIC_BASE_URL_THUMBNAILS` set.
- [ ] `R2_PUBLIC_BASE_URL_SUBTITLES` set.
- [ ] `R2_PUBLIC_BASE_URL_UPLOAD_PACKAGES` set.

## Forbidden Worker Env

- [ ] No `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] No `NEXT_PUBLIC_*` variables.
- [ ] No YouTube OAuth token.
- [ ] No platform upload credentials.

## Operation

- [ ] Worker is started manually by operator for first pilot.
- [ ] Worker heartbeat appears in WebApp.
- [ ] Worker claims only allowed job types.
- [ ] Worker failure reports `failed` or `retry_wait`, not fake success.
- [ ] Worker completion requires `video_url`.
- [ ] Rendered artifacts upload to real R2 URLs.
- [ ] Worker logs do not print raw secrets.
