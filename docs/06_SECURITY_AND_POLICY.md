# 06 Security And Policy

## Secrets

Server-only secrets:

- `WORKER_API_SECRET`
- `COMMERCE_AUTOMATION_API_SECRET`
- n8n webhook secrets, if legacy n8n is used.
- Coupang, Gemini, OpenAI, Supabase service role, and S3/R2 keys.

Rules:

- Do not reference server secrets in client components.
- Do not log `Authorization` headers.
- Do not put secret values in payload bodies.
- Do not commit `.env.local`.
- `.env.example` must contain placeholders only.

## Worker API Security

Worker endpoints are server-to-server only and require `WORKER_API_SECRET`. Browser UI must never call these endpoints with secrets.

## Upload Policy

Actual public uploads are not implemented:

- YouTube upload disabled.
- TikTok post disabled.
- Threads post disabled.

Defaults:

- `run_mode=generate_only`
- `youtube_upload_enabled=false`
- public upload disabled

## Affiliate And Disclosure Policy

An item cannot become ready for manual upload without:

- `selected_affiliate_url`
- affiliate disclosure text
- generated output URL

If `selected_affiliate_url` or disclosure text is missing during next-batch, the item moves to `manual_review` with a safe Korean message.

## Fake Success Policy

Fake success is prohibited.

For `video_render`:

- `result.video_url` is mandatory on complete.
- Missing `video_url` does not complete the job.
- Missing `video_url` does not set `queue_status=video_ready`.
- Partial assets may be stored for debugging/review, but completion is rejected.
