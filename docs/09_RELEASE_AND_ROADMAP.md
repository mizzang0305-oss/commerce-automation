# 09 Release And Roadmap

## v1.3 Worker Architecture

Release theme: move next-batch video generation from n8n webhook dispatch to web-managed `worker_jobs`.

Included:

- Worker job data model.
- Worker claim/heartbeat/complete/fail APIs.
- `/jobs` and `/workers` pages.
- Python Worker scaffold.
- Storage abstraction for generated artifacts.
- Guardrails against fake success.
- Next-batch dispatch guard based on settings and item readiness.

Not included:

- YouTube public upload.
- TikTok posting.
- Threads posting.
- Automatic public publishing.

## Legacy Items

n8n workflows remain as legacy/optional references. Nightly Scout may still use n8n or be replaced by a dedicated product collector.

## Roadmap

1. Keep the in-house Coupang MVP path focused on manual product input, candidate review, content draft generation, worker rendering, R2 artifacts, and manual upload packages.
2. Add operator APIs for retry/fail/cancel job actions.
3. Add real Google Sheets credential flow for `sheet_sync`.
4. Replace or formalize Nightly Scout product collection.
5. Persist planner/channel edits in Supabase.
6. Keep public upload as a separate, explicitly reviewed milestone.

## v2.4 Platform Upload Core

The upload layer now has a common readiness and planning model. YouTube has a server-only private smoke path behind explicit readiness and approval gates; TikTok and Threads remain readiness-only.

Included:

- `PlatformUploadProvider` for YouTube, TikTok, and Threads.
- Default-disabled `PlatformUploadSettings`.
- `PlatformUploadReadiness` with blocked reasons.
- Copy-only `PlatformUploadJobPlan`.
- `/api/uploads/platform-readiness`.
- `/api/candidates/[id]/platform-upload-plan`.
- `/uploads` dashboard-first private smoke form with readiness, UTF-8 disclosure preview, prepare/execute gates, and manual Studio verification.

Not included:

- TikTok Direct Post.
- Threads publish.
- Repository OAuth token storage.
- Public upload enablement.
- Automatic channel publishing.

YouTube adapter scaffold:

- Server-only YouTube readiness at `/api/uploads/youtube/readiness`.
- Local token provider metadata readiness at `/api/uploads/youtube/token-readiness`.
- Private request preparation at `/api/uploads/youtube/prepare`.
- Exact confirmation gate at `/api/uploads/youtube/execute`.
- Public visibility blocked.
- Token values and Authorization headers are not exposed.
- Domain-ready upload requires a server-accessible prepared video asset reference and a server-only token provider contract.
- Local Windows mp4 paths and local token files remain localhost diagnostics, not deployed-domain readiness evidence.
- `/api/uploads/assets/prepare-video-asset` and the `/uploads` domain asset section validate operator-provided signed URLs, prepared HTTPS asset URLs, and storage keys as prepare-only `PreparedVideoAssetRef` inputs with all upload/DB/R2/queue/job side effects false.
- Actual R2/S3 writes for upload assets remain a later, separately approved milestone.
- Access token refresh is attempted before the resumable session when a local refresh token exists; refresh failures require reauthorization and must not fake success.
- Live YouTube upload smoke remains blocked unless token readiness, quota/account/policy readiness, server-accessible prepared video asset readiness, exact confirmation, and separate smoke approval are present. The normal smoke path is the `/uploads` dashboard; direct PowerShell/curl prepare or execute calls are not the operator flow.
- The first private smoke succeeded for `candidate-video-smoke-001`; result verification is manual and safe, requiring YouTube Studio checks for private visibility, title, Korean disclosure, and public-upload-blocked status.

Next milestones:

1. Select or create one real server-accessible prepared video asset, then run `/uploads` domain asset prepare against the signed URL, HTTPS URL, or storage key.
2. Prepare real product video private packages from `/uploads` with candidate, product, affiliate URL, prepared video asset reference, Korean disclosure, and Studio checklist validation.
3. Add actual R2/S3 upload asset provider implementation only after explicit approval.
4. Add TikTok and Threads readiness adapters.
5. Add optional persisted YouTube smoke result evidence only after DB-write scope is explicitly approved.
6. Keep live upload execution blocked until explicit approval, token readiness, scopes, quota, account, policy, and server-accessible asset evidence exist.
7. Keep public upload as a separate explicitly reviewed milestone.

## v1.4 Repository Adapter Target

The Supabase/Postgres repository adapter moves control-room state beyond local JSON while keeping the existing WebApp API contract.

Included:

- Supabase migration for settings, queue, generated content, runs, worker jobs, heartbeats, candidates, assets, and history.
- Server-only Supabase admin client.
- Repository factory selection via `AUTOMATION_REPOSITORY_ADAPTER=supabase`.
- Local JSON remains the default development adapter.

Not included:

- Supabase Storage.
- Direct Python Worker database access.
- Public platform upload.

## v1.5 Planner Foundation Target

The event-driven planner moves the system from raw candidate review toward production prioritization.

Included:

- Static event calendar foundation for 7-30 day production windows.
- Candidate-to-event matching and ranking.
- Daily production plan computation.
- Manual-only YouTube channel profile routing.
- Candidate-to-video smoke seed.
- `/planner`, `/api/events`, `/api/channels`, and `/api/planner/daily`.

Not included:

- Persisted planner editing UI.
- YouTube OAuth flow.
- YouTube/TikTok/Threads upload calls.
- Automatic public publishing.

Next milestones:

1. Persist event/channel/plan edits in Supabase.
2. Add candidates review filters for event matches.
3. Add queue promotion from a selected planner item.
4. Expand Coupang candidate input with optional official API enrichment when credentials exist.
5. Keep public upload as a separate, explicitly reviewed milestone.

## v1.6 Coupang MVP Product Input

Included:

- `/candidates` manual Coupang product input form.
- `POST /api/candidates/import-coupang` for one candidate at a time.
- Coupang product URL normalization with tracking parameter removal.
- Deterministic `product_key` from product, item, and vendor identifiers.
- Affiliate short-link validation and `blocked_missing_affiliate` readiness for missing links.
- Product image URL readiness checks and image propagation from candidate to queue to worker payload.
- Python Worker product image download hardening and 1080x1920 render/thumbnail quality checks.
- CSV import enrichment for Coupang rows.

Not included:

- Queue creation from import.
- Worker job creation from import.
- n8n, Creatomate, or Google Docs expansion.
- YouTube/TikTok/Threads upload calls.

## v1.7 Candidate-To-Render Quality Target

The next quality layer keeps the MVP in-house while making rendered output less brittle.

Included:

- Candidate image readiness labels for missing or invalid image URLs.
- Promotion guard that prevents renderable queue rows without a usable product image.
- `/api/run/next-batch` payloads that pass both `image_url` and `thumbnail_url` to `video_render`.
- Worker download checks for status code, content type, empty bodies, and safe timeout handling.
- Vertical render layout and thumbnail title wrapping checks.

Not included:

- n8n, Creatomate, or Google Docs generation.
- Public platform upload.
- Login, CAPTCHA, block bypass, or protected review copying.

## v1.8 Content AI Provider Scaffold

The next content layer adds provider abstractions and diagnostics while retaining template fallback as the default. Live OpenAI/Gemini calls remain a later PR. Any future live provider must keep server-only secrets, template fallback, safety validation, manual review behavior, and upload-disabled defaults intact.

## v1.9 Production Deployment Checklist

The deployment checklist locks the current MVP into an auditable production path:

- Supabase/Postgres is the shared repository adapter.
- Cloudflare R2 or another S3-compatible backend stores rendered artifacts.
- Python Worker remains external to the WebApp and polls WebApp APIs.
- Coupang product import creates candidates only.
- Candidate promotion creates queue/content scaffold only.
- Content draft generation creates no worker jobs.
- `/api/run/next-batch` remains the only worker job creation path.
- Channel upload packages and upload result tracking remain manual-only.
- Queue detail pages show render plan preview/readiness without changing the Python Worker render engine.

Production release gates:

1. Run the full validation command set on `main`.
2. Verify Supabase migrations, RLS, and absence of public anon/authenticated write policies.
3. Verify diagnostics expose configured booleans only.
4. Run `npm run check:production-env` for safe env presence/warning output.
5. Run the Coupang product-to-video smoke through R2 artifact HTTP 200.
6. Build a manual channel upload package and verify `upload_enabled=false` plus `manual_upload_only=true`.
7. Confirm `.env.local`, `python-worker/.env`, local JSON data, worker outputs, temp files, logs, and virtualenv files are not staged.

Not included:

- YouTube/TikTok/Threads upload API calls.
- Public upload enablement.
- WebApp-controlled Python Worker process launching.
- Live OpenAI/Gemini content generation.
- ViMax or other agentic video engine integration.

## v2.0 Render Plan Operator Overrides

The next video-control layer keeps the deterministic storyboard template but lets an operator make lightweight shot edits before dispatch.

Included:

- `generated_contents.render_plan_override` for shot-level text and duration overrides.
- `/queue/[id]` render plan override editor.
- `POST /api/queue/[id]/render-plan-override` with safe validation and zero worker-job creation.
- Effective render plan preview that merges the base plan with a valid override.
- `/api/run/next-batch` revalidation so invalid overrides go to manual review instead of creating worker jobs.

Not included:

- image URL replacement inside overrides;
- worker job creation from override saves;
- Python Worker process launch from WebApp;
- ViMax dependency or external video/image API calls;
- YouTube/TikTok/Threads upload APIs or public upload enablement.

## v2.1 Coupang MVP Operating Roadmap

The next work stays centered on the current in-house Coupang MVP: candidate input, scoring/dedupe/readiness, queue promotion, content draft, render plan, Python Worker render, R2 artifact upload, channel upload package, and manual upload result tracking.

n8n, Creatomate, and Google Docs are not the current production path. Naver BrandConnect is deferred. multi-user SaaS is deferred. YouTube OAuth/upload stays last and must remain behind an explicit approval gate.

Recommended PR order:

1. PR #37. Render quality tuning v2
   - Improve shot layouts, subtitle positioning, thumbnail readability, product image card treatment, and vertical transition stability.
   - Keep the current Python Worker renderer; do not introduce ViMax or external video APIs.
   - Keep platform uploads disabled.
2. PR #38. Render quality tuning v3
   - Polish subtitle safe-area, subtitle contrast, product image card bounds, and upload-package render QA metadata.
   - Keep the current Python Worker renderer; do not introduce ViMax or external video APIs.
   - Keep platform uploads disabled.
3. PR #39. Production hosting target decision package
   - Compare Vercel, Render, Fly.io, and server options for the WebApp.
   - Decide where Python Worker runs.
   - Prepare Supabase/R2 production env rollout and production smoke steps.
   - Do not deploy until the target is approved.
   - Keep YouTube upload disabled.
   - Recommendation: Vercel WebApp, local Windows Python Worker for the first production pilot, Supabase/Postgres, and Cloudflare R2.
4. PR #40. Vercel local worker production pilot guide
   - Add Vercel WebApp production pilot guide.
   - Add local Windows Python Worker runbook.
   - Add Supabase/R2 production checklist, smoke sequence, rollback, and failure triage.
   - Do not execute deployment from the PR.
   - Keep YouTube upload disabled.
5. PR #41. Production pilot preflight
   - Add approval-gated production pilot preflight.
   - Add safe preflight script with configured booleans, missing env names, and manual checks only.
   - Do not create Vercel project, enter production env, deploy, or run production smoke from the PR.
   - Keep platform uploads disabled.
6. PR #53. Production pilot readiness closeout
   - Group env readiness into WebApp Base, Supabase, WebApp Runtime / AI, Local Python Worker, and Cloudflare R2.
   - Group manual readiness into Vercel, Supabase, R2, Local Worker, and Rollback / Approval.
   - Keep `production_pilot_ready=false` until env, manual evidence, explicit approval, and safety locks all pass.
   - Do not create a Vercel project, enter production env, deploy, run DB writes, run production smoke, or trigger uploads from the PR.
7. PR #42. Coupang collector MVP
   - Harden batch/manual URL import and server-only Coupang Partners API readiness.
   - Create candidates only; do not create queue rows or worker jobs from import.
8. PR #57. Image QA import bridge
   - Accept manually pasted image manifest text and create an in-memory QA/import plan.
   - Produce selected image asset JSON and readiness for a future slideshow package plan.
9. PR #61. Local slideshow render execution
   - Execute a separately approved local slideshow render package with exact confirmation.
   - Allow local file read/write and MP4 generation only.
   - Keep external APIs, DB writes, R2 upload, queue rows, worker jobs, deploy, and platform upload disabled.
   - Do not read local files, write files, write DB rows, call Google Drive/R2, generate images/videos, create worker jobs, create queue rows, or deploy.
9. PR #58. Selected image slideshow package plan
   - Turn selected image asset JSON into a copy-only 15-second slideshow package plan.
   - Produce timeline, image sequence, overlay/narration/subtitle mapping, CTA, disclosure reminder, FFmpeg/MoviePy previews, and manual render checklist.
   - Do not execute FFmpeg/MoviePy, read/write local files, upload to R2, create upload packages, create worker jobs, create queue rows, or deploy.
10. PR #59. Generated video QA import bridge
   - Accept manually pasted generated video manifest text and create an in-memory QA/import plan.
   - Produce QA markdown, next-step JSON, safety flags, missing requirements, and readiness for future manual upload package work.
   - Do not read local files, probe video metadata, execute FFmpeg/MoviePy, upload to R2, write DB rows, create upload packages, create worker jobs, create queue rows, or deploy.
11. PR #60. Approval-gated local slideshow render bridge
   - Require exact confirmation before returning copy-only local render package text.
   - Produce PowerShell step text, local FFmpeg/MoviePy preview text, input asset checklist text, output path suggestions, and package JSON.
   - Keep `execution_enabled=false`; do not read/write local files, execute FFmpeg/MoviePy, generate video, upload to R2, write DB rows, create upload packages, create worker jobs, create queue rows, or deploy.
7. PR #43. Daily production planner actual use
   - Turn event windows into a daily shortlist.
   - Let operators promote selected candidates.
   - Keep Naver, Musinsa, and BrandConnect as future candidate sources only.
8. PR #44. Channel package operations dashboard
   - Track manual_ready, uploaded, and needs_fix package counts by channel.
   - Keep upload URLs and result tracking manual-only.
9. PR #45. Content quality review queue

## v2.2 Operator UX Safety Tools

The operator UX layer improves speed without adding execution side effects.

Included:

- `cmdk` command palette for admin navigation.
- Recent commands, favorites, route-aware suggestions, and command aliases.
- Copy-only validation, Python Worker validation, targeted test, and git safety snippets.
- Read-only safety reminders.
- Keyboard access through `Ctrl+K` and `Cmd+K`.

Not included:

- Python Worker process launch from WebApp.
- Production deploy execution.
- Supabase db push, migrations, SQL writes, or database write smoke.
- Collector execution, queue creation, worker job creation, render plan creation, or upload package creation.
- YouTube/TikTok/Threads upload APIs, OAuth token storage, or public upload enablement.
   - Add checklist review for titles, scripts, hashtags, affiliate disclosure, and blocked claims.
   - Compare template and future provider outputs without enabling uploads.
10. PR #46. YouTube channel readiness only
   - Strengthen channel handle/channel ID/readiness metadata.
   - Show OAuth readiness booleans only.
   - Do not add OAuth start, token storage, or `videos.insert`.
11. PR #47. Approval-gated YouTube OAuth scaffold
   - Design OAuth and token policy only after manual operations are stable.
   - Keep upload API implementation as a later, separately approved step.
12. PR #48. Multi-user readiness design only
   - Document user/workspace/affiliate-account boundaries.
   - Keep the current single-operator MVP unchanged unless a production need is proven.

## v2.3 Commerce Image And Video Planning

The media planning layer keeps the system plan-only and copy-only while preparing better source material for future approval-gated image generation and video rendering work.

Motion-first shorts research adds a separate roadmap for open-source and cloud motion/video providers. See `docs/MOTION_FIRST_SHORTS_ARCHITECTURE.md`, `docs/FAL_KLING_I2V_PROVIDER.md`, `docs/COMFYUI_WAN_I2V_PROVIDER.md`, `docs/COMFYUI_WAN_LOCAL_SETUP_RUNBOOK.md`, `docs/COMFYUI_WAN_LOCAL_SMOKE_RUNBOOK.md`, `docs/research/CLOUD_VIDEO_PROVIDER_EVALUATION.md`, `docs/research/OPEN_SOURCE_MOTION_PROVIDER_EVALUATION.md`, `docs/research/COMMERCE_VIDEO_PROVIDER_ROADMAP.md`, `docs/research/SHOPPING_SOURCE_ADAPTER_RESEARCH.md`, and `docs/research/REVIEW_MEMORY_AND_PROMPT_FEEDBACK_RESEARCH.md`. The fal Kling I2V adapter is scaffolded behind disabled env readiness, API-key/model-id checks, cost approval, a mock client, and a live-execution approval gate. The ComfyUI Wan I2V adapter remains scaffolded behind disabled env readiness and a live-execution approval gate. The local setup kit adds safe doctor/config-check/dry-run commands so an operator can prepare their own local ComfyUI/Wan workflow without repository-managed install, model download, GPU execution, workflow submit, or generated media artifacts. The default fal blocker is `FAL_KLING_I2V_PROVIDER_DISABLED`; configured fal readiness without future paid-smoke approval blocks at `FAL_KLING_I2V_LIVE_EXECUTION_NOT_APPROVED`. The first one-scene fal Kling paid smoke submit stopped at `FAL_SUBMIT_HTTP_502` before request id, so no polling, result fetch, retry, second submit, or generated clip occurred.

Included:

- Candidate-based image asset plan for `main_product`, `benefit_scene`, `hook_thumbnail`, and `comparison_card`.
- Candidate-based `VideoPlan` with a 15-second shorts storyboard, shot list, narration, subtitle lines, CTA, and affiliate disclosure reminder.
- `/image-prompts` copy-only preview and JSON export controls.
- Local image generation package with suggested filenames, local output folders, Google Drive sync-folder suggestions, manifest JSON, prompt markdown, manual steps, and QA checklist text.
- Documentation for local asset folders, optional Google Drive sync-folder conventions, and future KPI candidates.

Not included:

- Image generation API calls.
- Image-to-video API calls.
- ComfyUI workflow execution.
- ComfyUI, Wan, LTX, CogVideo, or Hunyuan installation or model downloads.
- GPU execution.
- Real mp4/mov/webm motion clip generation.
- FFmpeg/MoviePy execution from the planning layer.
- Google Drive API/OAuth.
- DB writes, local file writes, queue creation, worker job creation, upload packages, uploads, production deploys, or production smoke.

Next motion-first milestones:

1. Review and merge the fal Kling adapter/readiness/mock PR.
2. Decide API budget and provider terms for fal/Kling.
3. For any retry after `FAL_SUBMIT_HTTP_502`, first run the no-cost payload audit, manually check fal dashboard billing/credit state, and require fresh retry approval `APPROVE_FAL_KLING_ONE_SCENE_PAID_SMOKE_RETRY_AFTER_502`.
4. In that future smoke, verify paid call readiness without YouTube, R2, DB writes, migrations, public upload, unlisted upload, production deploy, or committed media artifacts.
5. Keep local ComfyUI fallback documented while the Desktop/backend runtime remains unavailable.
6. Only after motion evidence is reviewed by a human, decide whether to connect generated motion clips to a private-upload package gate.

Setup kit safety:

- No YouTube Execute.
- No videos.insert.
- No R2 upload/write.
- No DB write.
- No migration.
- No production deploy.
- No public or unlisted upload.

Priority rule:

1. Operations stability.
2. Render quality.
3. Product collection and selection.
4. Daily production planning.
5. Channel operations dashboard.
6. YouTube readiness metadata.
7. YouTube OAuth/upload stays last.

## Next MVP Operations Layer

- Ops readiness dashboard: implemented as an approval-gated visibility layer, not a deploy flow.
- Coupang Collector MVP: candidates-only dry-run collection with deterministic duplicate keys, score breakdowns, source trace metadata, and risk flags. Queue promotion remains a separate operator action.
- Worker Artifact QA: manual review state for generated artifacts, now with filters and bulk review. QA pass is not platform upload.
- Candidate Scoring Analytics: read-only dashboard for candidate score, duplicate, source trace, risk flag, and linked artifact QA signals. It does not infer sales outcome and does not create queue rows, worker jobs, upload packages, or uploads.
- Artifact QA Productivity: review queues, note templates, and keyboard shortcuts for faster manual QA. These controls update QA metadata only.
- Candidate Analytics Filters And Seed Strategy: use filtered candidate quality signals to plan future candidate-only collector seeds without auto-running collectors.
- Candidate Seed Dry-run Planner: preview, copy, and export candidate-only collector dry-run payloads from filtered seed strategy insights without executing collectors or creating queue/job/upload side effects.
- Artifact QA Pagination: keep large artifact review queues operational without changing QA state or upload status.
- Production pilot readiness: Migration 008 artifact QA persistence SQL verification is PASS, but deployment and production smoke remain approval-gated.
- Deferred: YouTube OAuth/upload, TikTok Direct Post, Threads post, multi-user SaaS, n8n/Creatomate/Google Docs-first pipelines.
