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

## Product Image Render Safety

`video_render` requires a product image URL in `payload.image_url` or `payload.thumbnail_url`. The worker downloads that image before TTS, subtitles, or ffmpeg rendering. Download checks require:

- non-empty URL
- HTTP 200 response
- `image/*` response content type
- non-empty response body
- bounded network timeout

Failures raise safe worker errors and use the normal fail/retry path. The worker must not upload placeholder artifacts, complete `video_render`, or mark a queue item `video_ready` after image download failure.

## Korean TTS Provider

Production `video_render` uses only the explicitly approved local Korean voice command:

```text
<command> --script <voiceover-script.txt> --output <voiceover.wav> --language ko --format wav
```

Required environment settings are `KOREAN_VOICE_PROVIDER=local_command`,
`KOREAN_VOICE_PROVIDER_APPROVED=true`, `KOREAN_VOICE_LANGUAGE=ko`, and an
absolute existing `KOREAN_VOICE_COMMAND`. Windows SAPI and paid/cloud provider
markers are rejected. Command output is captured rather than logged, validated
as non-silent PCM WAV, and normalized to the render-plan duration with FFmpeg.
Provider failure follows the normal worker fail/retry path and must not persist
rendered artifacts or move the queue item to `video_ready`.

The placeholder WAV path remains available only to explicit local/unit dry-run
configurations. `load_config()` defaults missing production voice configuration
to `disabled`, which fails closed for `video_render`.

Rendered videos and thumbnails target a 1080x1920 vertical format. The ffmpeg filter scales and pads product imagery into the vertical frame, uses a dark safe background, burns generated subtitles with readable outline styling, and the thumbnail generator wraps long product names so text stays inside the output.

Render quality v2 keeps the same Python/ffmpeg renderer and does not add ViMax or an external video API. Current quality controls are:

- layout presets: `hook`, `product_focus`, `benefit`, `caution`, and `manual_cta`
- safe-area boxes that stay within the 1080x1920 canvas
- two-line caption wrapping with ellipsis clipping for dense captions
- render-plan shot durations mapped into SRT timing when `render_plan.shots[].duration_sec` is present
- thumbnail font fallback for Windows environments without a specific font path

Render quality v3 tightens subtitle polish without changing the artifact flow:

- product imagery is scaled into a bounded center card instead of filling the whole vertical canvas;
- the subtitle box stays in the lower safe area with compact font sizing, side margins, and a translucent background;
- dense captions default to two compact lines with ellipsis clipping;
- upload package text includes non-secret render QA metadata such as `render_layout_version`, `subtitle_style`, `render_plan_used`, and `shot_count`.

These controls improve readability only. They must not bypass image download checks, ffmpeg failures, storage failures, or the `video_url` requirement for `video_ready`.

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
R2_PUBLIC_BASE_URL_RENDERED_VIDEOS=https://pub-video.r2.dev
R2_PUBLIC_BASE_URL_THUMBNAILS=https://pub-thumb.r2.dev
R2_PUBLIC_BASE_URL_SUBTITLES=https://pub-subtitle.r2.dev
R2_PUBLIC_BASE_URL_UPLOAD_PACKAGES=https://pub-package.r2.dev
# Optional fallback only.
R2_PUBLIC_BASE_URL=https://fallback.example.com
```

For the four-bucket R2 setup, keep the real bucket names equal to the logical names: `rendered-videos`, `thumbnails`, `subtitles`, and `upload-packages`. Enable each bucket's Public Development URL and set the matching `R2_PUBLIC_BASE_URL_*` value. The returned artifact URL uses that public base URL plus the object key only, so key `job-123/video.mp4` in `rendered-videos` becomes `https://pub-video.r2.dev/job-123/video.mp4`. Do not reuse `SUPABASE_SERVICE_ROLE_KEY` as a worker storage secret, and keep R2 secrets only in `python-worker/.env`.

The storage client rejects unsafe object keys such as `../video.mp4` before upload. Missing storage credentials fail the job safely; they must not be reported as successful renders.
