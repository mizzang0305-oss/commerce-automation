# Commerce Automation Python Worker

The Python Worker is a poller, not a web service. It claims `video_render` and `sheet_sync` jobs from the Next.js web app, writes artifacts to storage, and reports success or failure back to the worker API.

## Supported Runtime

- Recommended on Windows: Python 3.12.x
- Accepted: Python 3.11.x through Python 3.12.x
- Not supported: Python 3.13+ and Python 3.14+

The worker checks the Python runtime before loading configuration or contacting the web API. Unsupported runtimes exit locally with an operator-friendly message and do not report fake job success.

## Windows Setup

```powershell
cd python-worker
py -3.12 --version
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install --upgrade pip
.\.venv\Scripts\pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python worker.py
```

Python 3.14 is intentionally not supported for this worker. Some binary wheels can lag new interpreter releases, which can force source builds for packages such as Pillow on Windows.

## Requirements Sets

- `requirements.txt`: default worker runtime, including `imageio-ffmpeg` for ffmpeg fallback.
- `requirements-video.txt`: optional MoviePy stack for future advanced video templates.
- `requirements-collector.txt`: optional Crawlee Python and Playwright stack for future collector work.

MoviePy and Crawlee are not part of the default worker install. Collector work must not bypass login, CAPTCHA, blocking, terms, or copy protected review text.

## Collector Helpers

`src/collectors/` contains the first safe collector scaffolding:

- `toss_link_importer.py`: loads CSV/XLSX link tables into product candidate records.
- `musinsa_public_collector.py`: placeholder for public-page collection only.
- `coupang_api_collector.py`: safe no-op until official Coupang API credentials are configured.

Collectors should only produce candidates. They must not create `video_render` jobs, mark queue items ready, bypass login/CAPTCHA/bot controls, or copy protected review text.

## ffmpeg

`ffmpeg` is required for real MP4 rendering, but it is not required for worker startup or `sheet_sync`. The worker checks it when a `video_render` job starts.

Resolution order:

1. `IMAGEIO_FFMPEG_EXE`
2. `imageio-ffmpeg`
3. system `PATH`

System ffmpeg is optional when `imageio-ffmpeg` resolves correctly, but installing it is recommended for smoke verification and local diagnostics.

Check the current shell:

```powershell
ffmpeg -version
where.exe ffmpeg
```

Install with `winget`:

```powershell
winget --version
winget search ffmpeg
winget install --id Gyan.FFmpeg --source winget --accept-source-agreements --accept-package-agreements
```

Restart PowerShell, then verify:

```powershell
ffmpeg -version
where.exe ffmpeg
```

Alternative package:

```powershell
winget install --id BtbN.FFmpeg --source winget --accept-source-agreements --accept-package-agreements
```

Manual install:

1. Download a Windows build from the official FFmpeg download page via gyan.dev or BtbN.
2. Extract it so `C:\Tools\ffmpeg\bin\ffmpeg.exe` exists.
3. Add `C:\Tools\ffmpeg\bin` to the user PATH:

```powershell
[Environment]::SetEnvironmentVariable(
  "Path",
  [Environment]::GetEnvironmentVariable("Path", "User") + ";C:\Tools\ffmpeg\bin",
  "User"
)
```

4. Restart PowerShell and run `ffmpeg -version`.

If `ffmpeg` is missing, startup can still succeed, but `video_render` jobs fail or retry without marking the queue item as `video_ready`. `video_ready` without `video_url` is a bug.

## Local Smoke Rerun

After installing Python 3.12 and ffmpeg:

```powershell
cd C:\Users\LOVE\MyProjects\commerce-automation\python-worker
ffmpeg -version
py -3.12 --version
Remove-Item -Recurse -Force .venv -ErrorAction SilentlyContinue
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install --upgrade pip
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\python worker.py
```

Safety expectations:

- Missing `ffmpeg` is a `video_render` job failure/retry reason, not a startup failure.
- Missing `ffmpeg` must not produce fake success.
- Public upload and YouTube/TikTok/Threads posting are not implemented by this worker.

## Artifact Storage

The worker uploads generated files and reports URLs back to the WebApp. It must not connect to Supabase DB directly.

Local smoke storage:

```text
STORAGE_BACKEND=local
LOCAL_STORAGE_BASE_DIR=./outputs/storage
PUBLIC_STORAGE_BASE_URL=http://localhost:3000/mock-storage
```

Supabase Storage uses the S3 protocol endpoint and storage-specific access keys:

```text
STORAGE_BACKEND=supabase
SUPABASE_STORAGE_ENDPOINT_URL=https://project-ref.storage.supabase.co/storage/v1/s3
SUPABASE_STORAGE_ACCESS_KEY_ID=replace-with-storage-access-key
SUPABASE_STORAGE_SECRET_ACCESS_KEY=replace-with-storage-secret-key
SUPABASE_STORAGE_REGION=us-east-1
SUPABASE_STORAGE_PUBLIC_BASE_URL=https://project-ref.supabase.co/storage/v1/object/public
```

Do not put `SUPABASE_SERVICE_ROLE_KEY` in `python-worker/.env`. The service role key is for the server-side WebApp repository adapter only.

Cloudflare R2 and other S3-compatible storage can use the generic `S3_*` variables or these aliases:

```text
STORAGE_BACKEND=r2
R2_ENDPOINT_URL=https://account-id.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=replace-with-r2-access-key
R2_SECRET_ACCESS_KEY=replace-with-r2-secret-key
R2_REGION=auto
R2_PUBLIC_BASE_URL=https://cdn.example.com
```

The storage client rejects unsafe object keys such as `../video.mp4` before upload. Missing storage credentials fail the job safely; they must not be reported as successful renders.
