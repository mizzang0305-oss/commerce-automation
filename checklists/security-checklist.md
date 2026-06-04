# Security Checklist

## Secrets

- [ ] No server secret is referenced from client components.
- [ ] `WORKER_API_SECRET` is server-only.
- [ ] Supabase service role key is server-only.
- [ ] R2/S3 storage keys are worker/server-only.
- [ ] Coupang/Gemini/OpenAI secrets are server-only.
- [ ] Authorization headers are not logged.
- [ ] `.env.local` is not committed.
- [ ] `python-worker/.env` is not committed.
- [ ] `.env.example` and `examples/.env.example` contain placeholders only.

## Worker APIs

- [ ] Claim requires `Authorization: Bearer WORKER_API_SECRET`.
- [ ] Heartbeat requires worker auth.
- [ ] Complete requires worker auth.
- [ ] Fail requires worker auth.
- [ ] Wrong/missing secret returns 401.

## Content Policy

- [ ] No item becomes ready for manual upload without `selected_affiliate_url`.
- [ ] No item becomes ready for manual upload without disclosure text.
- [ ] No `video_render` completion is accepted without `video_url`.
- [ ] Public upload is disabled by default.
- [ ] Content AI defaults to template fallback.
- [ ] OpenAI/Gemini keys are not exposed to client components.
- [ ] Content safety blocks guarantee, lowest-price, medical/health efficacy, and review-copy patterns.

## Data

- [ ] `data/*.json` is ignored and not committed.
- [ ] Generated media stays in storage, not source control.
- [ ] Worker output/temp/log directories are ignored and not committed.

## Production Guardrails

- [ ] `AUTOMATION_REPOSITORY_ADAPTER=supabase` is used for shared production state.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is never copied into Python Worker storage env.
- [ ] `ENABLE_DEV_TOOLS` is unset or false in normal production.
- [ ] `/api/dev/*` mutation routes are enabled only in controlled sandboxes.
- [ ] `/api/dev/diagnostics` returns configured booleans only.
- [ ] Artifact storage smoke uses real R2/S3/Supabase Storage URLs, not `/mock-storage`.
- [ ] Artifact QA updates and bulk QA updates do not trigger uploads, posts, worker jobs, or queue status changes.
- [ ] Collector responses report no queue, worker, or upload side effects.
- [ ] WebApp does not launch Python Worker.
- [ ] Worker jobs are created only by `/api/run/next-batch`.
- [ ] `npm run check:production-env` output contains no raw secret or URL values.

## Manual Upload Only

- [ ] YouTube `videos.insert` is not implemented.
- [ ] TikTok Direct Post is not implemented.
- [ ] Threads post is not implemented.
- [ ] `youtube_upload_enabled=false`.
- [ ] Channel profile `upload_enabled=false`.
- [ ] Channel upload package `manual_upload_only=true`.
- [ ] Manual result tracking records operator state only and does not call platform upload APIs.
- [ ] UTF-8 smoke/debug files such as `tmp-diagnostics.json` and `tmp-coupang-import-body.json` are removed and not staged.
- [ ] Mojibake checks do not read or print `.env.local`, `python-worker/.env`, worker outputs, temp files, logs, or virtualenv contents.
