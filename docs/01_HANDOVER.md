# 01 Handover

Current status: v1.3 worker architecture.

The project is no longer centered on n8n for batch video generation. The Next.js web service is the operations control room, and the Python Worker is the execution worker for heavy jobs only.

## What The Web App Owns

- Settings and safety flags.
- Product candidates and product queue.
- `worker_jobs` creation and status tracking.
- Worker heartbeat visibility.
- Automation run logs.
- Generated content/result URL display.
- Manual review and upload readiness decisions.

## What The Python Worker Owns

- Polling `/api/worker/jobs/claim`.
- Processing only `video_render` and `sheet_sync`.
- Sending heartbeat updates.
- Uploading generated files to storage.
- Reporting complete/fail back to the web app.

The worker is not called directly from the browser.

## Current Batch Flow

1. Operator or schedule calls `POST /api/run/next-batch`.
2. Web app reads settings.
3. Web app selects due queue items.
4. Web app validates affiliate link, disclosure text, script, image URL, worker enablement, allowed job type, and daily video capacity.
5. Valid items become `processing`.
6. Web app creates `video_render` rows in `worker_jobs`.
7. Python Worker claims jobs and reports results.
8. Web app updates queue/results from DB and storage URLs.

`/api/run/next-batch` does not call n8n.

## Legacy n8n Position

n8n may still be used for Nightly Scout/product collection or as an optional legacy integration. It is not the video render path for next-batch.

## Non-Negotiables

- `run_mode=generate_only` by default.
- `youtube_upload_enabled=false` by default.
- No actual YouTube/TikTok/Threads public upload implementation.
- No fake success.
- No `video_ready` without `video_url`.
- No manual upload readiness without `selected_affiliate_url` and disclosure text.
