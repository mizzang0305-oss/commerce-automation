# Security Checklist

## Secrets

- [ ] No server secret is referenced from client components.
- [ ] `WORKER_API_SECRET` is server-only.
- [ ] Supabase service role key is server-only.
- [ ] Coupang/Gemini/OpenAI secrets are server-only.
- [ ] Authorization headers are not logged.
- [ ] `.env.local` is not committed.

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

## Data

- [ ] `data/*.json` is ignored and not committed.
- [ ] Generated media stays in storage, not source control.
