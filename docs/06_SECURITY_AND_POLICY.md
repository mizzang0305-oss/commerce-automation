# 06 Security And Policy

## Secrets

Server-only secrets:

- `WORKER_API_SECRET`
- `COMMERCE_AUTOMATION_API_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- n8n webhook secrets, if legacy n8n is used.
- Coupang, Gemini, OpenAI, Supabase service role, and S3/R2 keys.
- Supabase Storage S3 access keys, if the worker uses Supabase Storage.

Rules:

- Do not reference server secrets in client components.
- Do not log `Authorization` headers.
- Do not put secret values in payload bodies.
- Do not commit `.env.local`.
- `.env.example` must contain placeholders only.

## Worker API Security

Worker endpoints are server-to-server only and require `WORKER_API_SECRET`. Browser UI must never call these endpoints with secrets.

## Development API Security

Development mutation APIs are disabled in production by default:

- `POST /api/dev/seed`
- `POST /api/dev/reset-storage`
- `POST /api/dev/reset-settings`

Only set `ENABLE_DEV_TOOLS=true` in a controlled sandbox where seed/reset operations are expected. Normal production deployments must leave it unset. `/api/dev/diagnostics` is read-only and may be used for configured booleans only; it must not return raw URLs, service role keys, worker secrets, or Authorization headers.

## Supabase/Postgres Security

The Supabase repository adapter is server-only.

- `SUPABASE_SERVICE_ROLE_KEY` must be set only in server runtime env.
- Do not use `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`.
- Client components must not import `src/lib/server/supabaseAdmin.ts`.
- Python Worker must continue to use WebApp worker APIs; it must not receive the service role key.
- Python Worker storage credentials must be storage-specific keys. Do not put `SUPABASE_SERVICE_ROLE_KEY` in `python-worker/.env`.
- The migration enables RLS and creates no public anon write/read policy. Public writes are prohibited.
- Supabase Storage is artifact storage only. It does not change the WebApp repository adapter and does not enable public platform uploads.

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

## Content AI Safety

`OPENAI_API_KEY` and `GEMINI_API_KEY` are optional server-only secrets. They must not use a `NEXT_PUBLIC_` prefix and must not be referenced by client components.

Content drafts are checked for missing disclosure text, missing affiliate URL, lowest-price claims, guarantee language, medical/health efficacy claims, suspicious review-copy wording, and unusably short scripts. Blocked AI drafts fall back to template output or stay in manual review; they must not be treated as successful AI output.
