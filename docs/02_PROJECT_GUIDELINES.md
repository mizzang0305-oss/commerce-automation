# 02 Project Guidelines

## Product Direction

Build a web-managed commerce automation control center. The web service coordinates state and review; Python workers execute heavy media and sheet jobs.

## Core Rules

- Preserve `mybizLab`; do not modify it from this project.
- Public upload is never enabled by default.
- Do not implement YouTube/TikTok/Threads publishing in this phase.
- Never return fake success.
- Never expose server secrets to client code.
- Do not commit `.env.local` or `data/*.json`.
- A product without `selected_affiliate_url` must not become ready for manual upload.
- A product without disclosure text must not become ready for manual upload.
- A `video_render` job without `video_url` must not mark queue status `video_ready`.

## Worker Dispatch Rules

`/api/run/next-batch` may create `video_render` jobs only when:

- `settings.python_worker_enabled === true`
- `settings.allowed_worker_job_types` includes `video_render`
- today's active `video_render` count is below `settings.max_daily_videos`
- queue item is due and `queue_status=scheduled`
- item has `selected_affiliate_url`
- generated content has `disclosure_text`
- generated content has `video_script`
- item has `thumbnail_url`

Invalid items go to `manual_review` with a safe Korean error message.

## Documentation Rule

Treat n8n docs as legacy/optional unless the section explicitly talks about Nightly Scout/product collection.
