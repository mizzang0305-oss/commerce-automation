# 08 Test And QA Checklist

## Required Commands

```powershell
npm run test
npm run lint
npm run build
python -m compileall python-worker
```

## Vitest Timeout Policy

- `npm run test` is the exact full-suite gate for local PR review.
- Vitest uses a 10 second `testTimeout` and `hookTimeout` in `vitest.config.ts`.
- Reason: Windows local jsdom full-suite runs can intermittently exceed Vitest's 5 second per-test default under CPU contention, while focused reruns and a 10 second diagnostic full run pass.
- This timeout is not a waiver for hanging tests. If one test consistently approaches or exceeds 10 seconds, treat it as a test performance issue and either make the test cheaper or split the setup.
- Do not replace this gate with `npm run test -- --testTimeout=10000`; the configured policy should make exact `npm run test` defensible.

## Local Console QA

- Run `.\scripts\dev\powershell-utf8.ps1` before PowerShell smoke checks.
- Confirm `Invoke-RestMethod http://localhost:3000/api/dev/diagnostics | ConvertTo-Json -Depth 8` displays Korean text without mojibake.
- If PowerShell output is still corrupted, verify the same endpoint in a browser before treating it as an API failure.
- For Korean request payloads, prefer a UTF-8 body file such as `tmp-coupang-import-body.json` and send it with `-ContentType "application/json; charset=utf-8"` plus `-InFile`.
- For response inspection, write diagnostics to `tmp-diagnostics.json` with `Out-File -Encoding utf8`, then read it with `Get-Content -Encoding utf8`.
- Run `node scripts/check-mojibake.mjs --paths README.md,docs/07_OPERATIONS_RUNBOOK.md,src/components/DevScenarioPanel.tsx` when you need to distinguish source corruption from PowerShell console rendering.
- Do not print `.env.local`, `SUPABASE_SERVICE_ROLE_KEY`, or raw Authorization headers while debugging console output.

## Worker Job QA

- Claim returns one pending job.
- Already claimed job is not claimed by another worker.
- Heartbeat updates job and worker heartbeat.
- Complete with `video_url` moves queue item to `video_ready`.
- Complete without `video_url` does not complete job.
- Complete without `video_url` does not move queue item to `video_ready`.
- Fail stores `error_message` and uses retry policy.
- Missing or wrong `WORKER_API_SECRET` returns 401.

## Next Batch QA

- `python_worker_enabled=false` creates no jobs.
- Missing `video_render` in `allowed_worker_job_types` creates no jobs.
- `max_daily_videos` limit prevents additional jobs.
- No due scheduled items returns safe no-op.
- Missing `selected_affiliate_url` moves item to `manual_review`.
- Missing disclosure text moves item to `manual_review`.
- Missing script moves item to `manual_review`.
- Missing thumbnail/image URL moves item to `manual_review`.
- Valid worker job payload includes `image_url` or `thumbnail_url` for product image download.
- n8n webhook is not called by `/api/run/next-batch`.

## Security QA

- Client components do not reference `WORKER_API_SECRET`.
- Client components do not reference `SUPABASE_SERVICE_ROLE_KEY`.
- Client components do not reference service role, R2/S3, Coupang, OpenAI, Gemini, or provider API keys.
- Logs do not print Authorization headers.
- Production blocks `POST /api/dev/seed`, `/api/dev/reset-storage`, and `/api/dev/reset-settings` unless `ENABLE_DEV_TOOLS=true`.
- `/api/dev/diagnostics` returns configured booleans only and does not expose raw Supabase URL or service role key.
- `.env.local` is not committed.
- `data/*.json` is not committed.
- `python-worker/.env` is not committed.
- `python-worker/.venv`, `python-worker/outputs`, `python-worker/temp`, and worker logs are not committed.

## Auto Scene Image Shorts QA

- One selected candidate generates eight scene image briefs without asking the operator for manual prompts.
- Generated scene images are written to `commerce-assets/generated-scenes/<candidate_id>/v008/`.
- `scene-manifest.json`, `scene-contact-sheet.jpg`, and `quality-report.json` are present before rendering.
- The local renderer consumes the scene manifest image paths and does not use one product image as the full-video fallback.
- Missing scene images block rendering before MP4 generation.
- The local deterministic scene-card generator and local composited scene provider are preview/debug only. They cannot satisfy final private-upload readiness by themselves.
- Final readiness requires `provider_mode=photorealistic_generated` or `provider_mode=realistic_generated`, a reviewed provider such as `codex_photorealistic_scene_image_provider`, `photorealistic_scene_provider_configured=true`, `photorealistic_score >= 80`, at least 8 generated scene images, at least 8 unique scene image hashes, no vector/shape/abstract scene set, no unrealistic hands, product identity consistency score at least 70, semantic scene-kind uniqueness, product image reuse ratio at or below 0.35, and color-card-only ratio equal to 0.
- True scene change probe passes: at least 8 frame samples, same-frame ratio at or below 0.25, static-background ratio at or below 0.30, product image bbox changes at least 6 times, caption position changes at least 5 times, dominant background changes at least 7 times, and visual motion score at least 90.
- Human review false positives are tracked in `docs/SHORTS_RENDERING_HUMAN_REVIEW_FALSE_POSITIVE.md`.
- Hook title, captions, CTA, disclosure, and affiliate URL gates remain required.
- Public and unlisted visibility remain blocked.
- Generated `commerce-assets/**` files are never committed.

## Motion-First ComfyUI Wan I2V QA

- `COMFYUI_WAN_I2V_ENABLED=false` remains the default in `.env.example`.
- Default readiness returns `COMFYUI_WAN_I2V_PROVIDER_DISABLED`.
- Enabled readiness without `COMFYUI_BASE_URL` returns `COMFYUI_BASE_URL_MISSING`.
- Enabled readiness without `COMFYUI_WAN_I2V_WORKFLOW_PATH` returns `COMFYUI_WAN_I2V_WORKFLOW_PATH_MISSING`.
- Missing workflow files return `COMFYUI_WAN_I2V_WORKFLOW_NOT_FOUND`.
- Invalid workflow JSON or missing required workflow placeholders returns `COMFYUI_WAN_I2V_WORKFLOW_INVALID_JSON`.
- Configured readiness summaries expose booleans, timeout values, and basenames only; they must not expose the raw ComfyUI URL, full local paths, Authorization headers, token values, client secrets, raw affiliate URLs, image URLs, or asset URLs.
- `config/comfyui/wan-i2v.workflow.example.json` remains a placeholder template only, with no model paths, absolute local paths, or secrets.
- Scene mapping defaults to 1080x1920 vertical output.
- `hand_pickup` scenes require hand interaction, utensil interaction, and kitchen context signals.
- `cooking_use` scenes require hand interaction, utensil interaction, and kitchen context signals.
- `product_rotate` scenes require product rotate and kitchen context signals.
- Prompt mapping requires photorealistic vertical 9:16 kitchen usage context and negative prompts against cartoon/vector/abstract/fake-review/distorted-hand output.
- Router priority remains `comfyui_wan_i2v`, `ltx_video`, `animated_still`, `slideshow`.
- Router selects ComfyUI when configured and falls back to LTX when ComfyUI is disabled.
- Configured ComfyUI generation still returns `COMFYUI_WAN_I2V_LIVE_EXECUTION_NOT_APPROVED` unless a separately approved local smoke path is provided.
- Tests use mocked `ComfyUIClient` instances only.
- Mocked ComfyUI clips must have `providerMode=image_to_video_generated`, `realMotion=true`, positive duration, `mimeType` starting with `video/`, and a safe clip reference or local path.
- Motion quality gate accepts only valid mocked motion clips with enough real motion, hand interaction, utensil interaction, product rotate, and public-upload-blocked evidence.
- Motion quality gate blocks missing hand interaction.
- Motion quality gate blocks missing product rotate.
- Motion quality gate keeps public and unlisted uploads blocked.
- Provider disabled or not configured states must not call the ComfyUI client, YouTube execute route, `videos.insert`, R2 writes, DB writes, migrations, deploys, or public/unlisted uploads.
- ComfyUI, Wan, LTX, CogVideo, and Hunyuan installation or model downloads are out of scope for this PR.
- Real motion clip generation, GPU execution, and mp4/mov/webm artifact creation are out of scope for this PR.
- Local setup kit checks run through `npm run comfyui:doctor`, `npm run comfyui:config-check`, and `npm run comfyui:smoke:dry-run`.
- Setup doctor and config check outputs must expose booleans, basenames, and blocker codes only; they must not expose `.env.local` contents, raw ComfyUI base URL values, full local workflow paths, tokens, secrets, Authorization headers, raw affiliate URLs, raw image URLs, or raw asset URLs.
- The local smoke dry-run must create exactly the scene briefs `scene-04-hand-pickup`, `scene-05-cooking-use`, and `scene-06-product-rotate` without server calls or media generation.
- The local smoke dry-run output must keep `server_called=false`, `workflow_submit_attempted=false`, `motion_clip_generation=false`, `youtube_execute=false`, `videos_insert=false`, `r2_upload_write=false`, and `db_write=false`.
- No YouTube Execute, No videos.insert, No R2 upload/write, and No DB write remain required for all setup-kit and dry-run checks.
- `.env.local.comfyui.example` is a committed dummy example only. `.env.local`, `.env.local.comfyui`, `config/comfyui/*.local.json`, `commerce-assets/generated-motion/`, and `commerce-assets/review/` must not be committed.
- `config/comfyui/wan-i2v.workflow.local.example.json` remains a placeholder example only. A real local smoke requires a user-exported workflow JSON in an ignored local file.
- Local smoke success criteria include `smoke_only=true`, `final_upload_allowed=false`, `clip_count >= 1`, readable `ffprobe` output, frame difference detected, and human review before any future upload-package decision.
- Run `npm run test -- tests/comfyui-wan-i2v-provider.test.ts` before broader upload and full-suite validation.

## Low-Cost Motion Shorts Pivot QA

- Default autopilot blocks paid I2V with `PAID_I2V_AUTOPILOT_BLOCKED`.
- paid I2V is premium/manual only; fal Kling requires premium/manual approval,
  a positive scene cap, a positive cost cap, and fresh approval before mock or
  future live execution.
- Default paid policy keeps `autopilotPaidI2VEnabled=false`,
  `maxPaidI2VScenesPerShort=0`, and `maxPaidI2VCostPerShortUsd=0`.
- Autopilot provider priority starts with `rights_confirmed_source_video`,
  `advanced_still_motion`, `photorealistic_scene_still`, local ComfyUI fallback,
  and low-cost still/animated fallbacks before any paid provider.
- `advanced_still_motion` plans exactly eight scenes and supports product
  push-in, product orbit illusion, product cutout slide, parallax countertop,
  slow zoom/pan, before/after split, checklist overlay motion, and CTA hero
  motion.
- Low-cost quality requires `paid_i2v_scene_count=0`,
  `low_cost_motion_scene_count >= 6`, `static_only_ratio <= 0.30`,
  `same_frame_ratio <= 0.35`, safe captions, voiceover audio, first-second hook
  visibility, no clipped text, and public upload blocked.
- The render path remains blocked with `LOW_COST_MOTION_RENDERER_NOT_EXECUTED`
  until a separately approved local renderer run produces reviewed artifacts.
- Source video provider remains disabled by default, requires
  `rights_confirmed=true`, and blocks raw video download.
- Source-video blockers are `SOURCE_VIDEO_PROVIDER_DISABLED`,
  `SOURCE_VIDEO_RIGHTS_NOT_CONFIRMED`, and
  `SOURCE_VIDEO_RAW_DOWNLOAD_BLOCKED`.
- The pivot path must not call paid APIs, fal/Kling, `videos.insert`, YouTube
  Execute, R2 writes, product_assets writes, DB writes, migrations, production
  deploy, or public/unlisted upload.
- Run `npm run test -- tests/low-cost-motion-shorts-pivot.test.ts` before the
  broader upload and full-suite validation.

## Operator Command Palette QA

- `Ctrl+K` and `Cmd+K` open the command palette.
- `Esc` closes the command palette.
- Navigation commands route only to admin pages.
- Safe copy commands copy text only and never execute shell commands.
- Safe copy commands are grouped by Validation, Python Worker, Targeted Tests, and Git Safety.
- Recent commands render after navigation and safe copy actions.
- Recent commands store command metadata only, not copied command bodies.
- Favorite commands can be toggled and persist only safe command ids.
- Context-aware commands change by current route and remain navigation/copy-only.
- Aliases/search tags such as `qa`, `seed`, `preflight`, `test`, `worker`, and `env` find the expected safe commands.
- Copied snippets contain no service-role keys, storage keys, provider keys, Coupang keys, worker secrets, or Authorization headers.
- The palette does not include deploy, database write, worker execution, collector execution, platform upload, queue creation, worker job creation, render plan creation, or upload package creation commands.
- Artifact QA shortcuts are ignored while the command palette input is focused.

## Repository Adapter QA

- Default repository adapter remains `local-json`.
- `AUTOMATION_REPOSITORY_ADAPTER=supabase` selects the Supabase adapter.
- `AUTOMATION_STORAGE_ADAPTER=supabase` remains supported for compatibility.
- Missing `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` returns a safe server error.
- Supabase worker completion still rejects missing `video_url`.
- `docs/sql/verify_supabase_core.sql` confirms all automation tables have RLS enabled.
- `docs/sql/verify_supabase_core.sql` confirms there are no broad anon/authenticated read/write policies.
- Supabase migration creates `automation_settings.id = 'default'`.
- Supabase integration tests run only when explicit Supabase env is configured.

## Upload QA

- `run_mode` default is `generate_only`.
- `youtube_upload_enabled` default is `false`.
- `tiktok_upload_enabled` default is `false`.
- `threads_upload_enabled` default is `false`.
- `public_upload_enabled` default is `false`.
- `manual_upload_only` remains `true` for platform upload core.
- YouTube private execute is enabled only for a server-only private upload when token readiness, quota readiness, account readiness, policy readiness, upload enablement, exact confirmation, and private visibility are all present.
- YouTube live smoke is a separate `execution_intent=live_smoke` contract and additionally requires `RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE`.
- TikTok/Threads upload code paths are not enabled.
- `GET /api/uploads/platform-readiness` returns safe readiness booleans and blocked reasons only.
- `POST /api/candidates/[id]/platform-upload-plan` requires `video_path_or_url`, `disclosure_text`, candidate `product_name`, candidate `selected_affiliate_url`, and provider targets.
- Platform upload plans keep `uploaded=false`, `platform_api_called=false`, `token_exchanged=false`, `token_stored=false`, `db_written=false`, `queue_created=false`, `worker_job_created=false`, and `upload_package_created=false`.
- `/uploads` is dashboard-first for the approved YouTube private smoke flow. It must not expose OAuth token entry, deploy, DB write, queue creation, worker job creation, or upload package creation controls.
- `GET /api/uploads/youtube/readiness` returns YouTube readiness booleans and blocked reasons only; it must not return client secret, access token, refresh token, or Authorization values.
- `GET /api/uploads/youtube/token-readiness` returns local token file metadata booleans only; it must not return token file contents, access token, refresh token, client secret, or Authorization values.
- `node scripts/youtube-local-oauth-helper.mjs print-auth-url` is a local helper command only; it must not exchange tokens or write token files.
- `node scripts/youtube-local-oauth-helper.mjs exchange-code` is blocked unless exact confirmation `APPROVE_YOUTUBE_LOCAL_OAUTH_TOKEN_GENERATION` is supplied.
- `node scripts/youtube-local-oauth-helper.mjs validate-token-file` returns metadata only and must not print access tokens, refresh tokens, client secrets, or Authorization values.
- The local OAuth helper must reject token file paths inside this repository.
- `POST /api/uploads/youtube/prepare` rejects missing or non-server-accessible `prepared_video_asset`, missing `disclosure_text`, missing `selected_affiliate_url`, missing title/copy, and `public` visibility.
- `POST /api/uploads/youtube/execute` rejects `public` and `unlisted` visibility before adapter upload.
- Local Windows paths, relative `.mp4` paths, and `/var/task/...` paths are localhost diagnostics only. They must not satisfy domain/serverless upload readiness.
- Domain upload readiness requires `PreparedVideoAssetRef.server_accessible=true`, `mime_type=video/mp4`, and a resolvable `signed_url`, `prepared_video_asset_url`, or storage reference.
- `POST /api/uploads/assets/prepare-video-asset` validates operator-provided prepared video asset refs without calling YouTube, Google token endpoints, R2 write APIs, Supabase writes, queue APIs, or worker job APIs.
- Prepared video asset validation blocks `windows_local_path`, `var_task_runtime_path`, `relative_mp4_path`, `server_accessible_false`, `all_server_refs_missing`, `signed_url_expired`, `mime_type_invalid`, `size_bytes_missing`, and `size_bytes_zero`.
- Prepared video asset responses must keep `external_api_called=false`, `r2_uploaded=false`, `db_written=false`, `queue_created=false`, and `worker_job_created=false`.
- `/uploads` must render a separate "도메인용 영상 자산 준비" section with `asset_id`, provider, `storage_key`, `signed_url`, `prepared_video_asset_url`, `mime_type`, `size_bytes`, checksum, expiry, and `server_accessible` controls.
- `/uploads` must mask signed URL query strings in rendered prepare results and copied safe JSON. Raw token-like query params, Authorization headers, client secrets, and OAuth tokens must not render.
- `POST /api/uploads/youtube/prepare` rejects garbled Korean disclosure text before execute. Required disclosure text includes `쿠팡파트너스`, `활동의 일환`, and `수수료`/`제공받을 수 있습니다`, and replacement-question-mark mojibake such as `? ????` must return `disclosure_text_garbled`.
- `POST /api/uploads/youtube/execute-readiness` is a side-effect-free dry-run that returns `can_execute=false` and non-empty `blocked_reasons` when exact confirmation, private execute approval, private-only visibility, or server readiness is missing.
- Missing upload confirmation must return `upload_confirmation_missing`; missing final private execute approval must return `private_execute_approval_missing`; missing dashboard smoke approval must return `live_smoke_approval_missing` only for `execution_intent=live_smoke`.
- `/uploads` must send the same private execute fields to execute-readiness and execute: `execution_intent=private_execute`, `visibility=private`, and `confirmation=APPROVE_YOUTUBE_PRIVATE_UPLOAD`.
- `/uploads` live smoke controls must send the separate smoke fields to execute-readiness and execute: `execution_intent=live_smoke`, `visibility=private`, `smoke_approval=RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE`, and `confirmation=APPROVE_YOUTUBE_PRIVATE_UPLOAD`.
- `/uploads` must render candidate id, local mp4 diagnostic path, prepared video asset reference fields, private visibility, UTF-8 Korean disclosure preview, prepare/execute gates, and manual Studio verification without exposing token values or invoking public upload.
- `/uploads` must render the product video private package section separately from the smoke flow. It validates candidate id, product name, selected affiliate URL, server-accessible prepared video asset reference, title, description, Korean Coupang Partners disclosure, private visibility, and Studio verification checklist.
- `POST /api/uploads/youtube/product-package/prepare` is copy-only and must keep `external_api_called=false`, `youtube_upload_executed=false`, `uploaded=false`, `db_written=false`, `r2_uploaded=false`, `queue_created=false`, `worker_job_created=false`, and `upload_package_created=false`.
- The product package flow must not call `/api/uploads/youtube/execute`, YouTube, Google token endpoints, Supabase writes, R2 uploads, queue/job creation, or upload-package persistence in this PR.
- Product package prepare and execute request building must block static single-image-only videos, missing story script, missing why-buy reason, missing voiceover audio, fewer than 8 scenes, fewer than 8 captions, fewer than 8 visual transitions, duration under 20 seconds, and developer/test placeholder descriptions.
- Story-driven package readiness requires hook, problem, product benefit, target customer, why-buy reason, caution/check-before-buy, CTA, Korean voiceover script, voiceover audio, hook title visible in the first second, hook readability score at least 90, caption safe-area pass, distinct visual motion, use-case/checklist/CTA scenes, product image, disclosure, affiliate URL, and content quality score at least 88.
- Product package final verification requires a YouTube video id plus manual Studio checks for private visibility, correct title, Korean disclosure, affiliate link text, and no public/scheduled state.
- `/uploads` must render Korean readiness labels, current blocker summaries, and next-action hints for YouTube provider, local token file, token readiness, scopes, quota, account, policy, upload-enabled, manual-only, approval, and public-upload-blocked gates.
- `/uploads` must render the readiness gate resolver panel with "왜 실행이 막혔나요?", safe env-name-only configuration guidance, and manual checks for account/channel, quota, policy/disclosure, private visibility, and public upload blocked state.
- The readiness gate resolver may show env names such as `YOUTUBE_TOKEN_FILE`, `YOUTUBE_QUOTA_READY`, and `YOUTUBE_CLIENT_SECRET`, but it must not show env values, token JSON, access tokens, refresh tokens, client secret values, or raw Authorization headers.
- `/uploads` execute controls must remain disabled when `readiness.can_upload=false`; the UI should show safe blocked reasons rather than requiring operators to infer the blocker from raw API codes.
- `/uploads` execute controls must also remain disabled when `/api/uploads/youtube/execute-readiness` returns `can_execute=false`, even if the top-level readiness card shows `can_upload=true`.
- `POST /api/uploads/youtube/execute` requires `APPROVE_YOUTUBE_PRIVATE_UPLOAD`, `readiness.can_upload=true`, `execute-readiness.can_execute=true`, and `visibility=private`; otherwise it returns blocked JSON with top-level safe error and blocked reasons, and all side effects remain false. `RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE` is required only when `execution_intent=live_smoke`.
- `POST /api/uploads/youtube/execute` requires a server-accessible prepared video asset reference. It must return blocked JSON when only a local path is present and must not report domain upload success from `C:\...mp4`, relative `.mp4`, or `/var/task/...` paths.
- `POST /api/uploads/youtube/real-product-pilot/video-asset/prepare` may call the one-product local-only video generator only in `generate_local_only` mode with exact `RUN_REAL_PRODUCT_VIDEO_ASSET_GENERATION`; generated local mp4 output must keep `domain_ready=false`, `r2_uploaded=false`, `db_written=false`, `product_assets_written=false`, `queue_created=false`, `worker_job_created=false`, `upload_package_created=false`, and `youtube_execute_called=false`.
- Candidate-only server asset registration requires `product_assets.product_queue_id` to accept `null` and `product_assets.product_candidate_id` to exist. If the schema is not ready, registration must return `PRODUCT_ASSETS_SCHEMA_REQUIRES_QUEUE_ID` before any R2/S3 upload attempt.
- Candidate-only server asset registration must write `product_queue_id=null`, never `product_queue_id=""`, and must preserve `product_candidate_id` in the saved asset row.
- If R2/S3 upload succeeds but `product_assets` persistence fails, the response must keep `product_assets_written=false` and include `product_asset_orphan_object_possible`; do not report fake DB success.
- When a local token file includes `refresh_token`, the server-only adapter must refresh access before creating the resumable session; refresh failure returns `youtube_token_refresh_failed`, `reauth_required=true`, and does not fall back to a stale access token.
- YouTube adapter success requires a returned YouTube video id; if no id is returned, `succeeded=false`.
- YouTube adapter tests must mock provider HTTP calls and must not report fake production success.
- YouTube private smoke result verification accepts only private results with `candidate_id`, `youtube_video_id`, and `youtube_url`.
- YouTube private smoke result verification rejects public visibility and missing `youtube_video_id`.
- YouTube private smoke result verification remains manual/copy-only; it must not call `/api/uploads/youtube/execute`, call YouTube again, write DB rows, upload to R2, create queue rows, create worker jobs, or create upload packages.
- YouTube Studio verification must confirm private visibility, title, Korean disclosure text, and no public conversion before a result is treated as final verified.
- Smoke mp4 files under `commerce-assets/output/video-packages/` remain local evidence only and must not be committed.

## Artifact Storage QA

- Local storage still serves `/mock-storage/...` only for local/dev smoke.
- Production storage smoke uses Supabase Storage, R2, or another S3-compatible backend; `/mock-storage/...` does not count as live storage.
- Supabase/R2 storage keys are not exposed to client components.
- `python-worker/.env` does not contain `SUPABASE_SERVICE_ROLE_KEY`.
- R2 live smoke uses bucket-specific public URL env values for `rendered-videos`, `thumbnails`, `subtitles`, and `upload-packages`; `R2_PUBLIC_BASE_URL` is fallback only.
- R2 product asset URLs must point at the bucket Public Development URL plus object key, for example `https://pub-video.r2.dev/job-123/video.mp4`, not `https://pub-video.r2.dev/rendered-videos/job-123/video.mp4`.
- Unsafe storage keys such as `../video.mp4` are rejected.
- Missing storage credentials fail/retry the worker job without fake success.
- Live storage smoke passes only when video, thumbnail, SRT, and upload package URLs return HTTP 200 or valid signed URL responses.

## Collector QA

- `/api/collectors/import-csv` is blocked in production unless `ENABLE_DEV_TOOLS=true`.
- CSV imports reject empty product names, empty URLs, and non-http(s) URLs.
- Imported rows are stored as `product_candidates`, not `product_queue`.
- Collectors do not create `worker_jobs` directly.
- Crawling/import work does not bypass login, CAPTCHA, bot blocking, terms, or copy protected review text.
- Imported candidates get `product_key`, `candidate_score`, `duplicate_status`, and `promotion_status`.
- Coupang candidates include safe `duplicate_key`, `score_breakdown`, `source_trace`, and `risk_flags` metadata.
- `score_breakdown` includes `demand_score`, `price_score`, `content_angle_score`, `risk_penalty`, `duplicate_penalty`, and `final_score`.
- `source_trace` includes `source_platform`, `source_keyword`, `collected_mode`, `collected_at`, and `collector_version` without secrets.
- `product_key` generation must not include secret-like payload keys or token values.
- `/api/candidates/import-coupang` accepts only Coupang product detail URLs, strips tracking parameters, validates optional Coupang Partners affiliate URLs, and returns no queue, worker, or upload side effects.
- Live Coupang Partners import mapping must normalize `selected_affiliate_url`, `affiliate_url`, `landing_url`, `product_url`, `productUrl`, `deeplink_url`, and `shorten_url` into `selected_affiliate_url` when the selected value is a safe `link.coupang.com` Partners URL.
- Live Coupang Partners import mapping must normalize `thumbnail_url`, `image_url`, `product_image_url`, `productImage`, `productImageUrl`, `imagePath`, and `image_path` into the product image readiness path, including protocol-relative image URLs.
- Coupang Partners auth diagnostics must report booleans only: env file present, provider enabled, access key present, secret key present, customer/partner id present, signature builder present, timestamp check present, request path present, method present, and raw values masked.
- Coupang Partners signature self-tests must use dummy credentials only and must not print raw secrets, raw HMAC signatures, Authorization headers, raw API URLs, raw affiliate URLs, or raw image URLs.
- A generic Coupang Partners HTTP 401 must map to `COUPANG_PARTNERS_API_HTTP_401`, block candidate import, block automatic retry, require fresh approval, and keep render/R2/product_assets/YouTube side effects false.
- Event-aware live scout must prove `baseline_candidate_excluded=true` before scout provider calls, ranking, or import; failure maps to `BASELINE_CANDIDATE_EXCLUSION_NOT_PROVEN`.
- Import mapping blockers such as `COUPANG_IMPORT_AFFILIATE_URL_INVALID` and `COUPANG_IMPORT_IMAGE_URL_INVALID` must not collapse into generic `AUTO_REAL_PRODUCT_REQUIRED`.
- Coupang CSV rows use the same product key and affiliate readiness enrichment as manual `/candidates` input.
- Coupang candidate image URLs accept only usable `http`/`https` image sources; empty, `file:`, `javascript:`, and other unsafe schemes are blocked from render readiness.
- Missing `selected_affiliate_url` maps to `blocked_missing_affiliate`; missing `product_name` maps to `blocked_missing_name`.
- Missing or invalid product image maps to review/blocking behavior and cannot become a renderable queue row.
- Duplicate candidate, queued, or produced rows map to `blocked_duplicate`.
- Candidate promotion creates `product_queue` and generated-content scaffold only; `worker_jobs` must remain empty until `next-batch`.
- `/candidates` shows score, product key, duplicate status, promotion status, and keeps secret-like payload keys redacted.
- `/candidates/analytics` returns read-only aggregate candidate analytics and `side_effects.queue_created=false`, `side_effects.worker_jobs_created=false`, and `side_effects.upload_triggered=false`.
- Candidate analytics copy must not claim revenue, profit, or guaranteed channel performance.

## Content Draft QA

- `POST /api/queue/[id]/generate-content` blocks missing `selected_affiliate_url`, missing `product_name`, and missing `thumbnail_url`.
- Generated drafts include `video_title`, `video_script`, captions, hashtags, YouTube/TikTok text, and `disclosure_text`.
- Existing manually written generated-content fields are preserved.
- Content draft generation creates no `worker_jobs`.
- A queue item with generated `video_script`, disclosure text, affiliate link, and thumbnail can later pass next-batch render guards.
- `/queue/[id]` shows content readiness and the `콘텐츠 초안 생성` action without exposing secrets.

## Commerce Image Prompt Planning QA

- `GET /api/candidates/[id]/image-plan` returns four plan-only asset prompts: `main_product`, `benefit_scene`, `hook_thumbnail`, and `comparison_card`.
- `GET /api/candidates/[id]/image-video-plan` returns the image asset plan plus a plan-only 15-second `VideoPlan`.
- The `VideoPlan` must include a 4-6 shot list covering 0-15 seconds, narration, subtitle lines, CTA, and Coupang Partners disclosure reminder.
- Every image plan response keeps `image_generated=false`, `video_generated=false`, `uploaded=false`, `worker_job_created=false`, and `queue_created=false`.
- Every image-video plan response keeps `scraped_live_web=false`, `external_api_called=false`, `db_written=false`, `file_uploaded=false`, `payment_triggered=false`, `message_sent=false`, `deployment_triggered=false`, `worker_job_created=false`, and `queue_created=false`.
- Every image-video plan response keeps `approval_required=true`.
- `/image-prompts` exposes copy-only prompt, negative prompt, storyboard, narration, subtitle, CTA, and JSON controls.
- The image planning flow must not call image APIs, Google Drive APIs, Worker APIs, queue APIs, upload APIs, or platform upload APIs.
- `GET /api/candidates/[id]/local-image-package` returns a local image generation package with suggested filenames, local output paths, Google Drive sync-folder suggestions, manifest JSON, prompt markdown, manual steps, and QA checklist text.
- Every local image package response keeps `scraped_live_web=false`, `external_api_called=false`, `image_generated=false`, `video_generated=false`, `uploaded=false`, `db_written=false`, `file_uploaded=false`, `payment_triggered=false`, `message_sent=false`, `deployment_triggered=false`, `worker_job_created=false`, `queue_created=false`, `local_file_written=false`, and `google_drive_api_called=false`.
- Local image package UI controls are copy-only. They must not generate images, write local files, call Google Drive, create artifacts, create queue rows, create worker jobs, create upload packages, or run uploads.
- `POST /api/candidates/[id]/image-qa-import-plan` validates optional import manifest text and returns an in-memory `ImageQaImportPlan`.
- Image QA import manifest validation checks `candidate_id`, asset type, filename, path text, and QA status without reading local files or calling Google Drive.
- Image QA import plans return selected image asset JSON, QA markdown, missing required asset types, and `ready_for_slideshow_plan`.
- Every image QA import response keeps `external_api_called=false`, `scraped_live_web=false`, `image_generated=false`, `video_generated=false`, `uploaded=false`, `db_written=false`, `file_uploaded=false`, `local_file_read=false`, `local_file_written=false`, `google_drive_api_called=false`, `r2_uploaded=false`, `worker_job_created=false`, and `queue_created=false`.
- `/image-prompts` exposes copy-only QA import bridge controls and must not expose Upload Image, Browse Local File, Read File, Import to DB, Save Selected Assets, Send to Google Drive, Upload to R2, Generate Video, Run FFmpeg, or platform post buttons.
- `POST /api/candidates/[id]/slideshow-package-plan` returns an in-memory `SlideshowPackagePlan` with selected image sequence, 15-second timeline, overlay/narration/subtitle mapping, CTA, disclosure reminder, FFmpeg preview, MoviePy preview, and manual render checklist.
- Every slideshow package plan response keeps `external_api_called=false`, `scraped_live_web=false`, `image_generated=false`, `video_generated=false`, `uploaded=false`, `db_written=false`, `file_uploaded=false`, `local_file_read=false`, `local_file_written=false`, `google_drive_api_called=false`, `r2_uploaded=false`, `ffmpeg_executed=false`, `moviepy_executed=false`, `upload_package_created=false`, `worker_job_created=false`, and `queue_created=false`.
- `/image-prompts` exposes copy-only slideshow package controls and must not expose Run FFmpeg, Run MoviePy, Create Video File, Upload Video, Create Upload Package, Send to R2, or platform post buttons.
- `POST /api/candidates/[id]/local-slideshow-render-package` requires exact confirmation `PREPARE_LOCAL_SLIDESHOW_RENDER_PACKAGE` before returning a copy-only `LocalSlideshowRenderPackage`.
- Every local slideshow render package response keeps `execution_enabled=false`, `external_api_called=false`, `deployment_triggered=false`, `image_generated=false`, `video_generated=false`, `uploaded=false`, `db_written=false`, `local_file_read=false`, `local_file_written=false`, `ffmpeg_executed=false`, `moviepy_executed=false`, `upload_package_created=false`, `worker_job_created=false`, and `queue_created=false`.
- `/image-prompts` exposes local render package copy controls for PowerShell steps, FFmpeg preview text, MoviePy preview text, and package JSON only. It must not expose render execution, file browsing, file writes, R2 upload, upload package creation, queue creation, or worker job actions.
- `POST /api/candidates/[id]/execute-local-slideshow-render` requires exact confirmation `APPROVE_LOCAL_SLIDESHOW_RENDER_EXECUTION`.
- Local slideshow render execution validates allowlisted local image paths before reading files.
- Local slideshow render execution may set `local_file_read=true`, `local_file_written=true`, `video_generated=true`, and either `ffmpeg_executed=true` or `moviepy_executed=true`.
- Local slideshow render execution must keep `external_api_called=false`, `db_written=false`, `uploaded=false`, `r2_uploaded=false`, `upload_package_created=false`, `worker_job_created=false`, and `queue_created=false`.
- Local slideshow render execution writes only local MP4/manifest/report files under `commerce-assets/output/video-packages/{candidate_id}/`; generated outputs must remain untracked.
- `/image-prompts` exposes local render execution controls only for exact approval, engine preference, local execution, output paths, logs, and report JSON. It must not expose R2 upload, DB import, queue creation, worker job creation, deploy, or platform post controls.
- `POST /api/candidates/[id]/generated-video-qa-import-plan` validates optional generated video manifest text and returns an in-memory `GeneratedVideoQaImportPlan`.
- Generated video QA import manifest validation checks `candidate_id`, filename, path text, source, duration text/number, format, QA status, and QA notes without reading local files, probing video metadata, calling R2, or writing DB rows.
- Generated video QA import plans return QA markdown, next-step JSON, missing requirements, safety flags, and `ready_for_manual_upload_package`.
- `ready_for_manual_upload_package=true` requires at least one `passed` or `selected_for_manual_upload` video, `format=shorts_9_16`, and duration between 10 and 60 seconds.
- Every generated video QA import response keeps `external_api_called=false`, `scraped_live_web=false`, `image_generated=false`, `video_generated=false`, `uploaded=false`, `db_written=false`, `file_uploaded=false`, `local_file_read=false`, `local_file_written=false`, `google_drive_api_called=false`, `r2_uploaded=false`, `ffmpeg_executed=false`, `moviepy_executed=false`, `upload_package_created=false`, `worker_job_created=false`, and `queue_created=false`.
- `/image-prompts` exposes copy-only generated video QA import controls and must not expose Read Video Metadata, Run FFmpeg, Run MoviePy, Upload Video, Create Upload Package, Send to R2, Import to DB, or platform post buttons.

## Render Quality QA

- Python Worker image download uses a bounded timeout and requires HTTP 200.
- Non-image `Content-Type`, empty image bodies, and unreachable product image URLs fail/retry safely.
- Image download failure does not upload placeholder video/thumbnail/SRT/upload package artifacts.
- The vertical render layout stays 1080x1920 and uses scale/pad before burning subtitles.
- Generated thumbnails are 1080x1920 and wrap long product titles instead of overflowing.
- Render quality v2 layout presets (`hook`, `product_focus`, `benefit`, `caution`, `manual_cta`) keep image and caption boxes inside the 1080x1920 canvas.
- Render-plan shot durations map to SRT timing when `render_plan.shots[].duration_sec` is present.
- Dense captions wrap or clip with an ellipsis instead of overflowing the subtitle safe area.
- Thumbnail generation still succeeds with the default font fallback when a preferred Windows font path is unavailable.
- Render quality v3 keeps product imagery above the subtitle safe area instead of scaling it across the entire canvas.
- Subtitle styling uses a compact lower safe-area box, two-line wrapping, side margins, and a translucent background.
- Visual smoke must confirm subtitles do not cover the product image, title/caption text does not overflow, and the thumbnail title card remains readable.
- Upload package text may include non-secret render QA metadata; it must not include storage keys, service role keys, Authorization headers, or platform upload flags.

## Production Pilot QA

- `docs/PRODUCTION_HOSTING_DECISION.md` recommends the production pilot target before deployment.
- `docs/PRODUCTION_PILOT_RUNBOOK.md` documents Vercel WebApp plus local Windows Worker operation without executing deployment.
- `docs/PRODUCTION_PILOT_PREFLIGHT.md` documents the approval gate before any deploy or production smoke.
- `checklists/vercel-production-checklist.md` keeps WebApp secrets server-side and blocks `NEXT_PUBLIC_*` secrets.
- `checklists/local-worker-production-checklist.md` keeps `SUPABASE_SERVICE_ROLE_KEY` out of the Worker environment.
- `checklists/production-pilot-preflight-checklist.md` separates Vercel, Supabase, R2, Worker, approval, and safety readiness.
- `npm run preflight:production-pilot` prints configured/missing/manual-check status only.
- `/ops/production-readiness` shows grouped env readiness, grouped manual readiness, not-ready reasons, and safety locks only.
- Production pilot readiness is false until required env, manual evidence, explicit approval, and upload/deploy safety locks all pass.
- `npm run preflight:production-pilot` does not run Vercel deploy, Supabase CLI, R2 network calls, Python Worker, or platform upload APIs.
- Production pilot smoke confirms import creates candidates only.
- Promotion and content generation create zero `worker_jobs`.
- `/api/run/next-batch` remains the only worker-job creation path.
- Python Worker is started outside WebApp.
- R2 artifacts return HTTP 200 or expected signed URL responses.
- Channel upload package remains `manual_ready`, `upload_enabled=false`, and `manual_upload_only=true`.
- Pilot rollback stops the local worker, pauses automation, and preserves production data unless a backed-up cleanup is explicitly approved.

## Event Planner QA

- `GET /api/events` returns active event seeds without secrets.
- Upcoming event logic includes only active events inside the 7-30 day window.
- Event matching excludes duplicate candidates, missing affiliate URLs, and excluded keywords.
- Event-aware Coupang candidate scout builds an Asia/Seoul rolling 30-day window from the current date.
- Event-aware scout maps static/seasonal events to primary keywords, secondary keywords, preferred categories, excluded keywords, and blocked categories.
- Event-aware ranking blocks the baseline candidate, missing affiliate URL, missing product image, policy-risk categories, and low event relevance.
- Event-aware scout imports at most one candidate and does not render video, create MP4 files, upload to R2, write `product_assets`, execute YouTube uploads, call `videos.insert`, or enable public/unlisted upload.
- Event-aware safe summaries expose booleans, scores, event names, keyword plans, and candidate id/name/category only; they must not expose raw affiliate URLs, raw image URLs, secrets, tokens, Authorization headers, or raw request URLs.
- After external verification, persistent Coupang Partners HTTP 401 maps to `COUPANG_PARTNERS_API_HTTP_401_PERSISTED_AFTER_EXTERNAL_VERIFICATION` and locks live scout retries for the MVP path.
- The `manual_event_candidate` fallback accepts only event-relevant, non-baseline, policy-safe candidates with product name, `https://link.coupang.com` affiliate URL, and HTTP(S) product image URL.
- Manual event candidate fallback safe summaries expose booleans and scores only; raw affiliate/image URLs, credentials, Authorization headers, signatures, and raw request URLs remain masked.
- Manual event candidate fallback marks `ready_for_low_cost_motion_v1_1_render=true` only after validation passes.
- Manual event candidate fallback does not call Coupang Partners, call external scout, insert/update candidates, render video, create MP4 files, upload to R2, write `product_assets`, write DB rows, execute YouTube, call `videos.insert`, or enable public/unlisted upload.
- Daily planner prefers `promotion_status=ready`, `duplicate_status=unique`, high candidate score, and higher event priority.
- Planner excludes product keys already produced on the same plan date.
- Channel profiles default to `upload_enabled=false` and `manual_upload_only=true`.
- `/channels` profile updates cannot enable upload automation and cannot disable manual-only mode.
- `/channels` responses and UI show OAuth readiness booleans only; they do not expose OAuth secrets or tokens.
- `GET /api/planner/daily` reports YouTube readiness booleans only and does not expose OAuth secrets.
- `candidate-video-smoke` seed creates a candidate only; it must not create a queue row or worker job.
- `/planner` is read-only planning UI; it must not create worker jobs.

## Table UX QA

- `/queue` supports product/keyword/error search, status filter, issue filter, sorting, and pagination.
- `/jobs` supports job/search text, status filter, job type filter, issue filter, sorting, and pagination.
- Existing server-side query filters still work before the client-side table filters are applied.
- Large local result sets remain client-side for now; server-side pagination is a later optimization.

## Content AI Provider QA

- `CONTENT_AI_PROVIDER=template` produces renderable draft content.
- `CONTENT_AI_PROVIDER=openai` without `OPENAI_API_KEY` falls back to template.
- Provider metadata exposes booleans only and no raw keys.
- Safety guard blocks guarantee, lowest-price, medical/health efficacy, and review-copy patterns.
- `generate-content` creates zero `worker_jobs`.
- `/api/run/next-batch` remains the only worker-job creation path.

## Render Plan Preview QA

- `/queue/[id]` shows a render plan preview when product name, affiliate link, thumbnail, video script, and disclosure text are ready.
- The preview shows `render_plan_attached=true`, shot count, total duration, per-shot captions, image URLs, voice text, and readiness status.
- `/queue/[id]` shows legacy fallback copy and missing inputs when a render plan cannot be built.
- The preview and lightweight override editor create zero `worker_jobs` and do not launch Python Worker.
- `POST /api/queue/[id]/render-plan-override` accepts only shot caption, voice text, duration, and operator metadata.
- Render plan override validation rejects unknown shot IDs, unsafe claim language, forbidden fields, image URL replacement, upload flags, and invalid durations.
- Saving an override stores `generated_contents.render_plan_override` separately from the deterministic base plan.
- `/api/run/next-batch` uses the effective render plan when a valid override exists.
- Invalid persisted overrides move the queue item to manual review instead of creating a worker job.
- The override workflow adds no ViMax dependency, no external video/image API call, and no platform upload behavior.

## Coupang Product-To-Video Smoke QA

- `/dev/test-lab` shows the `쿠팡 상품 → 쇼츠 영상 E2E Smoke` panel.
- Start creates only a `product_candidates` row.
- Promote creates a scheduled `product_queue` row and generated-content scaffold, not a worker job.
- Content draft generation fills `video_script` and creates zero worker jobs.
- Next-batch creates the `video_render` worker job and includes `image_url` or `thumbnail_url`.
- The status panel reports `render_plan_attached`, `render_plan_shot_count`, `render_plan_override_present`, and `effective_render_plan_shot_count`.
- The WebApp displays the Python Worker command but does not execute it.
- After the Worker runs externally, status reaches `video_ready` only when `video_url` exists.
- R2 or real storage artifact URLs for video, thumbnail, subtitle, and upload package return HTTP 200.
- Channel upload package creation returns `manual_ready`, `upload_enabled=false`, and `manual_upload_only=true`.
- YouTube/TikTok/Threads upload APIs remain absent and public upload stays disabled.

## fal Kling I2V Adapter QA

- `fal_kling_i2v` defaults to `enabled=false`, `configured=false`, and
  `FAL_KLING_I2V_PROVIDER_DISABLED`.
- Enabling the provider still requires `FAL_API_KEY`,
  `FAL_KLING_I2V_MODEL_ID`, and `FAL_KLING_I2V_COST_APPROVED=true`.
- Missing API key, model id, or cost approval must return explicit blockers and
  must not call a client.
- Non-mock live execution must block at
  `FAL_KLING_I2V_LIVE_EXECUTION_NOT_APPROVED` unless a future paid smoke prompt
  handles separate approval.
- Unit tests must use `createMockFalKlingI2VClient`; no network call, vendor SDK,
  paid API call, or raw provider response is allowed.
- Scene mapping must use safe image references only and must not log raw source
  image URLs.
- Paid-smoke payload audit must pass before any future submit. It checks prompt
  presence, masked `image_url` presence, duration enum, `duration=5` for the
  one-scene smoke, aspect ratio enum, `aspect_ratio=9:16`, negative prompt
  presence, valid optional `cfg_scale`, safe source image reference, external
  image accessibility known, model id presence, API key presence boolean, cost
  approval, `scene-06-product-rotate`, and `scene_count=1`.
- The recorded first paid smoke blocker is `FAL_SUBMIT_HTTP_502`. It occurred
  before `request_id`, so polling, result fetch, retry loop, second submit, and
  clip generation must remain false.
- A 502/no-request-id retry requires a manual fal dashboard billing/credit check
  plus fresh retry approval
  `APPROVE_FAL_KLING_ONE_SCENE_PAID_SMOKE_RETRY_AFTER_502`.
- Mock results must satisfy the motion clip contract before quality-gate tests:
  `providerMode=image_to_video_generated`, `realMotion=true`,
  `durationSeconds > 0`, `mimeType=video/*`, and a safe clip reference.
- Public/unlisted upload remains blocked unless a later upload approval changes
  the upload gate.

## Production Deployment QA

- Current production path is Coupang candidate import, candidate review, content draft, next-batch, Python Worker render, R2/S3 artifact upload, and manual channel upload package.
- n8n, Creatomate, and Google Docs generation are legacy/optional and not the primary production path.
- Web service env uses `AUTOMATION_REPOSITORY_ADAPTER=supabase`, `SUPABASE_URL`, and server-only `SUPABASE_SERVICE_ROLE_KEY`.
- Python Worker env uses `WEB_APP_BASE_URL`, `WORKER_API_SECRET`, `WORKER_ID`, `WORKER_JOB_TYPES`, and storage-specific R2/S3/Supabase Storage credentials.
- R2 live smoke uses `STORAGE_BACKEND=r2`, `R2_ENDPOINT_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_REGION=auto`, and four bucket-specific public base URLs.
- `CONTENT_AI_PROVIDER=template` remains the default production-safe content provider. `OPENAI_API_KEY` and `GEMINI_API_KEY` are optional server-only readiness values.
- `ENABLE_DEV_TOOLS` is unset or false for normal production.
- `/api/dev/*` mutation routes are available only in a controlled sandbox with `ENABLE_DEV_TOOLS=true`.
- Production smoke includes diagnostics, import-coupang, promote, generate-content, next-batch, external Python Worker, R2 artifact HTTP 200, build-upload-package, and manual result tracking.
- PowerShell Korean output issues are treated as console rendering problems unless browser/API-client output or UTF-8 source inspection proves a source string is corrupted.
- `npm run check:production-env` reports only configured booleans and warning codes; it must not print raw Supabase, R2, Worker, Coupang, OpenAI, or Gemini values.

## Verification Error-Triage Routine

- Record the failed phase first: request, repository adapter, migration, PostgREST schema cache, environment variable, Python Worker, image download, ffmpeg render, R2/S3 upload, browser rendering, or PowerShell console rendering.
- Capture evidence without secrets: request URL, HTTP status, safe response body, dev server stack trace, Supabase SQL result, worker log, `candidate_id`, `queue_id`, `worker_job_id`, branch, and commit.
- Identify the root cause before editing. Add a RED regression test first for empty 500s, schema failures, fake success risks, and `video_ready` without `video_url`.
- Keep fixes minimal. Do not change the worker job creation path, public upload defaults, manual-only channel package semantics, or secret handling.
- Verify GREEN with targeted tests, full `npm run test`, Python unittest, lint, build, compileall, `git diff --check`, secret grep, and forbidden-path staging scan.
- Report unavailable sandbox/live checks as NOT RUN, not PASS.

## Ops / Collector / Artifact QA Checks

- `GET /api/ops/production-readiness` returns counts and booleans only.
- `POST /api/candidates/collect-coupang` creates candidates only.
- Collector responses must show `queue_created=false` and `worker_jobs_created=false`.
- `GET /api/artifacts` returns safe artifact summaries.
- `POST /api/artifacts/[id]/qa` updates QA status without creating worker jobs or triggering upload.
- Collector responses must also show `upload_triggered=false`.
- `GET /api/artifacts` filters by QA status, asset type, missing artifact type, search text, and sort order.
- `GET /api/candidates/analytics` returns `applied_filters`, `available_filters`, and read-only side-effect booleans.
- Candidate Seed Strategy returns keep/expand/review/avoid groups and copy/export controls only. It must not execute collectors or create queue/job/upload side effects.
- `GET /api/candidates/seed-plan` returns `mode=candidate_only_dry_run_plan`, active filters, strategy, payload preview, copy blocks, and false side-effect booleans.
- Seed Dry-run Planner UI shows preview/copy/export controls only. It must not show Run Collector, Create Queue, Start Worker, Promote, or Upload buttons.
- `GET /api/artifacts` returns pagination metadata, clamps `page_size` to `100`, preserves filters, and must not update QA/upload/worker state.
- `POST /api/artifacts/bulk-qa` updates selected artifact QA fields only and returns `upload_triggered=false`, `worker_jobs_created=false`, and `queue_auto_uploaded_or_posted=false`.
- Artifact QA review queues and keyboard shortcuts update QA status only and must show `QA status only changed. No platform upload was executed.`
- Artifact QA large-list rendering caps visible rows to the page window, clears selection on page/filter/search/sort/page-size changes, and keeps keyboard selection inside the visible page.
- Client components must not reference service role keys, R2 secrets, worker secrets, Coupang secrets, or Authorization headers.
