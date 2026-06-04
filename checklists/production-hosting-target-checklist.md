# Production Hosting Target Checklist

Use this before executing any production deployment. This checklist decides the target; it does not deploy.

## Target Decision

- [ ] WebApp target selected.
- [ ] Python Worker target selected.
- [ ] Supabase project selected.
- [ ] R2 buckets/custom domains selected.
- [ ] Expected monthly cost reviewed against current official provider pricing.
- [ ] Rollback path documented.
- [ ] Production deploy explicitly approved by the operator.

## Recommended First Pilot

- [ ] WebApp: Vercel.
- [ ] Python Worker: local Windows machine.
- [ ] Repository: Supabase/Postgres.
- [ ] Storage: Cloudflare R2.
- [ ] Upload mode: manual-only.

## WebApp Safety

- [ ] `AUTOMATION_REPOSITORY_ADAPTER=supabase`.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is server-only.
- [ ] `WORKER_API_SECRET` is server-only.
- [ ] `ENABLE_DEV_TOOLS` is false or unset.
- [ ] `ENABLE_MOCK_STORAGE_ROUTE` is false or unset.
- [ ] `CONTENT_AI_PROVIDER=template`.
- [ ] No `NEXT_PUBLIC_*SECRET*` value exists.
- [ ] Diagnostics expose booleans only, not raw URLs or keys.

## Python Worker Safety

- [ ] Worker is started outside WebApp.
- [ ] Worker polls only WebApp API.
- [ ] Worker does not contain `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Worker uses storage-specific R2 credentials.
- [ ] `WEB_APP_BASE_URL` points to the deployed WebApp.
- [ ] `WORKER_API_SECRET` matches the WebApp secret.
- [ ] Python version is verified.
- [ ] ffmpeg or imageio-ffmpeg fallback is verified.

## Supabase And R2

- [ ] All required Supabase migrations are applied.
- [ ] RLS is enabled.
- [ ] Broad anon/authenticated public policies are absent.
- [ ] `automation_settings.id='default'` exists.
- [ ] R2 buckets exist: `rendered-videos`, `thumbnails`, `subtitles`, `upload-packages`.
- [ ] R2 public/custom URLs are configured for each bucket.

## Smoke Gate

- [ ] Import Coupang candidate.
- [ ] Confirm import creates zero queue rows and zero worker jobs.
- [ ] Promote candidate to queue.
- [ ] Confirm promotion creates queue/content scaffold and zero worker jobs.
- [ ] Generate content draft.
- [ ] Confirm content generation creates zero worker jobs.
- [ ] Run `next-batch`.
- [ ] Confirm `next-batch` creates one `video_render` job.
- [ ] Start Python Worker manually.
- [ ] Confirm worker claims job and sends heartbeat.
- [ ] Confirm final worker job status is `completed`.
- [ ] Confirm final queue status is `video_ready`.
- [ ] Confirm `video_url` exists.
- [ ] Confirm video, thumbnail, subtitle, and upload package URLs are real R2 URLs.
- [ ] Confirm all artifact URLs return HTTP 200 or expected signed URL responses.
- [ ] Build channel upload package.
- [ ] Confirm package status is `manual_ready`.
- [ ] Confirm `upload_enabled=false`.
- [ ] Confirm `manual_upload_only=true`.

## Hard Blocks

- [ ] Production deploy not executed before this checklist is approved.
- [ ] YouTube `videos.insert` not implemented.
- [ ] TikTok Direct Post not implemented.
- [ ] Threads post not implemented.
- [ ] OAuth token storage not implemented.
- [ ] Public upload not enabled.
- [ ] `video_ready` without `video_url` not observed.
- [ ] Fake success not observed.
