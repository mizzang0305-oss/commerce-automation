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

`ffmpeg` is required for real MP4 rendering:

```powershell
ffmpeg -version
```

If `ffmpeg` is missing, startup can still succeed, but `video_render` jobs fail or retry without marking the queue item as `video_ready`.
