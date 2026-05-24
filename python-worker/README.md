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

## ffmpeg

`ffmpeg` is required for real MP4 rendering, but it is not required for worker startup or `sheet_sync`. The worker checks it when a `video_render` job starts.

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
