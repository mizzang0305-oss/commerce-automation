# YouTube Upload Adapter

This adapter is an approval-gated server-only path for YouTube private upload.

It does not enable public upload. It does not run live upload smoke by default. It does not store OAuth tokens in the repository or expose token values to the client.

## Scope

- Provider: YouTube only.
- Final execute visibility: `private` only. `public` and `unlisted` are blocked by the execute gate.
- Final execute confirmation phrase: `APPROVE_YOUTUBE_PRIVATE_UPLOAD`.
- Live smoke phrase: `RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE`, required only with `execution_intent=live_smoke`.
- Default behavior: blocked by readiness.
- Upload method: YouTube Data API resumable `videos.insert` from a server-accessible prepared video asset reference.
- Local `.mp4` paths are localhost diagnostics only and do not satisfy domain/serverless readiness.

## Required Readiness

The readiness APIs return boolean/status fields only:

- provider configured
- token ready
- scopes ready
- quota ready
- account ready
- policy ready
- upload enabled
- can upload
- blocked reasons

The APIs must not return raw client IDs, client secrets, access tokens, refresh tokens, Authorization headers, or provider response bodies.

The upload request builder rejects garbled Korean affiliate disclosure text
before prepare or execute can proceed. A valid YouTube upload request must keep
the disclosure readable in UTF-8 and include three Korean disclosure axes:
`쿠팡파트너스`, `활동의 일환`, and `수수료`/`제공받을 수 있습니다`. Strings that look
like replacement-question-mark mojibake, for example `? ????`, are blocked with
`disclosure_text_garbled`.

## Request Requirements

YouTube upload request preparation requires:

- `candidate_id`
- `prepared_video_asset`
- `title`
- `description` or `caption`
- `disclosure_text`
- `selected_affiliate_url`
- `visibility` as `private` or `unlisted`

`public` visibility is rejected during prepare. Final execute additionally requires `private` visibility. The final description must include the affiliate disclosure text and affiliate URL.

`video_path_or_url` is deprecated for domain readiness. It may remain in a
localhost diagnostic payload, but a Windows path such as `C:\...\video.mp4`, a
relative local `.mp4` path, or a serverless `/var/task/...` path must not be
treated as upload-ready. Domain readiness requires a `PreparedVideoAssetRef`
with `server_accessible=true`, `mime_type=video/mp4`, and a resolvable
`signed_url`, `prepared_video_asset_url`, or storage reference. See
[UPLOAD_ASSET_PROVIDER_CONTRACT.md](UPLOAD_ASSET_PROVIDER_CONTRACT.md).

For the local private smoke, use `candidate-video-smoke-001`. That id is the
existing dev smoke candidate created by `/api/dev/seed` with
`mode="candidate-video-smoke"`. The YouTube adapter does not create candidates
or write queue/job/upload-package rows; it only requires the upload payload to
remain linked to a candidate id.

Required disclosure text example:

```text
※ 이 콘텐츠는 쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.
```

## APIs

- `GET /api/uploads/youtube/readiness`
- `GET /api/uploads/youtube/token-readiness`
- `POST /api/uploads/youtube/prepare`
- `POST /api/uploads/youtube/execute-readiness`
- `POST /api/uploads/youtube/execute`
- `POST /api/uploads/youtube/product-package/prepare`
- `POST /api/uploads/assets/prepare-video-asset`
- `POST /api/uploads/youtube/real-product-pilot/video-asset/prepare`

The operator-facing path is `/uploads`. The dashboard builds the UTF-8 JSON payload in the browser, runs prepare only
from a button click, keeps execute disabled until prepare succeeds plus both exact approval phrases are entered, and
shows a manual Studio verification card. Do not use direct PowerShell/curl prepare or execute calls for the normal
private smoke loop.

The `/uploads` page also renders a Korean readiness dashboard for operators. It maps each safe boolean/status gate to
Korean labels, current blocker summaries, and fix hints:

- YouTube provider configuration
- local token file path and token readiness
- `youtube.upload` scope readiness
- quota, account, and policy readiness
- `YOUTUBE_PRIVATE_UPLOAD_ENABLED` or legacy `YOUTUBE_UPLOAD_ENABLED`
- manual-only and exact-approval requirements
- public upload blocked state

These labels are diagnostics only. They must not expose token values, client secrets, raw Authorization headers, webhook
URLs, or direct execution commands.

## Prepared Video Asset Prepare

`POST /api/uploads/assets/prepare-video-asset` validates an operator-provided
domain video asset reference before it is used by the product package flow. It
supports:

- `signed_url` with a future `expires_at`
- `prepared_video_asset_url`
- storage-backed `storage_key` for future R2/Supabase Storage adapters

It blocks Windows `C:\...` paths, serverless `/var/task/...` paths, relative
`.mp4` paths, missing `server_accessible=true`, missing/zero `size_bytes`,
invalid MIME types, and expired signed URLs. It returns safe blocker names and
masked display strings only. Signed URL query strings must render as
`?[redacted]`.

This endpoint is prepare-only. It must keep `external_api_called=false`,
`r2_uploaded=false`, `db_written=false`, `queue_created=false`, and
`worker_job_created=false`. It does not call `/api/uploads/youtube/execute`,
Google OAuth token endpoints, YouTube `videos.insert`, R2 write APIs, or
Supabase write APIs.

## Product Video Private Package Prepare

`POST /api/uploads/youtube/product-package/prepare` builds a copy-only package
for a real product video after the private smoke path is proven. It validates:

- `candidate_id`
- `product_name`
- `selected_affiliate_url`
- `video_path_or_url`
- `prepared_video_asset`
- `title`
- `description`
- `disclosure_text`
- `visibility=private`

`public` visibility is rejected during prepare. Final execute additionally requires `private` visibility. The disclosure must include readable
`쿠팡파트너스`, `활동의 일환`, and `수수료`/`제공받을 수 있습니다` text and must not
look garbled.

The product package endpoint distinguishes localhost diagnostics from domain
readiness. A local path only returns a blocked package state. A package is
domain-ready only when it includes a server-accessible prepared video asset
reference.

Product packages must also pass the final story-driven Shorts quality gate
before private execute. The package is blocked when it is only a static
single-image video, has fewer than 8 scenes or 8 captions, has fewer than 8
visual transitions, is shorter than 20 seconds, lacks hook/problem/why-buy/
target/customer-benefit/check-before-buy/CTA copy, lacks a Korean voiceover
script, lacks voiceover audio, has low hook readability, has unsafe/clipped
caption layout, has insufficient visual motion, has missing use-case/checklist/
CTA scenes, or contains developer/test placeholder copy such as `manual review
package`, `prepared package`, `test upload`, or `smoke upload`. Representative
blockers include
`CONTENT_QUALITY_FAILED`, `STATIC_IMAGE_ONLY_VIDEO_BLOCKED`,
`VOICEOVER_AUDIO_REQUIRED`, `STORY_SCRIPT_REQUIRED`,
`WHY_BUY_REASON_REQUIRED`, `DEV_PLACEHOLDER_DESCRIPTION_BLOCKED`,
`CAPTION_COUNT_TOO_LOW`, `SCENE_COUNT_TOO_LOW`, `HOOK_TITLE_LOW_VISIBILITY`,
`VISUAL_VARIATION_TOO_LOW`, `VOICEOVER_NATURALNESS_TOO_LOW`,
`TRUE_SCENE_CHANGE_FAILED`, `FRAME_HASH_DELTA_TOO_LOW`,
`PRODUCT_IMAGE_BBOX_STATIC`, `BACKGROUND_STATIC_TOO_LONG`,
`CAPTION_POSITION_STATIC_TOO_LONG`, `VISUAL_LAYOUT_VARIATION_TOO_LOW`, and
`VIDEO_DURATION_TOO_SHORT`.

Human review of the prior `mLytN-u2C5M`, `hRq1iap1C14`, and `G-r6rWsZwiU`
private outputs found that metadata success was still visually static or too
abstract: local generated cards changed colors/layouts but did not show
photorealistic kitchen context, realistic human hands, or credible utensil
interaction in the use-case scene. Those outputs are now recorded as false
positives in `docs/SHORTS_RENDERING_HUMAN_REVIEW_FALSE_POSITIVE.md`.

The local deterministic scene-card generator and local composited scene-image
provider are preview/debug fallbacks, not final real usage scene-image
providers. They must not set final `content_quality_ready=true` by themselves.
Final private upload readiness now requires `provider_mode=photorealistic_generated`
or `provider_mode=realistic_generated`, a reviewed provider such as
`codex_photorealistic_scene_image_provider`,
`photorealistic_scene_provider_configured=true`, `photorealistic_score >= 80`,
`photorealistic_scene_count >= 5`, no vector/shape/abstract scene set, no
unrealistic hands, product identity consistency score at least 70, real provider
evidence, unique scene image hashes, semantic scene kind uniqueness, product
image reuse ratio at or below 0.35, color-card-only ratio equal to 0, same-frame
ratio at or below 0.25, static-background ratio at or below 0.30, dominant
background changes at least 7 times, product bbox changes at least 6 times,
caption position changes at least 5 times, visual motion score at least 90, real
use-case human context, at least two human-use signal scenes, explicit utensil
interaction, no shape-card scene, and abstract scene ratio at or below 0.15.

Related blockers include `BLOCKED_REAL_SCENE_IMAGE_PROVIDER_NOT_CONFIGURED`,
`REAL_SCENE_IMAGE_PROVIDER_REQUIRED`, `LOCAL_SCENE_CARD_GENERATOR_NOT_ENOUGH`,
`LOCAL_COMPOSITED_PROVIDER_NOT_ENOUGH`, `PHOTOREALISTIC_SCENE_PROVIDER_REQUIRED`,
`PHOTOREALISTIC_SCORE_TOO_LOW`, `VECTOR_OR_SHAPE_SCENE_BLOCKED`,
`UNREALISTIC_HAND_SCENE_BLOCKED`, `NON_PHOTOREALISTIC_USAGE_SCENE_BLOCKED`,
`PRODUCT_IDENTITY_INCONSISTENT`,
`COLOR_CARD_ONLY_SCENE_BLOCKED`, `REAL_SCENE_IMAGE_MISSING`,
`SCENE_IMAGE_HASH_DUPLICATE`, `SCENE_IMAGE_SEMANTIC_DUPLICATE`,
`PRODUCT_IMAGE_REUSE_TOO_HIGH`, `BACKGROUND_VARIATION_TOO_LOW`, and
`SCENE_IMAGE_VISUAL_REALISM_TOO_LOW`. Human-use blockers include
`USE_CASE_SCENE_HAS_NO_HUMAN_CONTEXT`, `USE_CASE_SCENE_TOO_ABSTRACT`,
`REAL_USAGE_VISUAL_MISSING`, `KITCHEN_CONTEXT_MISSING`, and
`SHAPE_CARD_SCENE_BLOCKED`.

The local one-product renderer now uses an automatic scene image pipeline before
video rendering. The pipeline builds eight product-specific scene briefs,
generates scene card PNGs locally, writes `scene-manifest.json`, creates a
contact sheet, and then renders the MP4 from the manifest image paths. It does
not ask the operator to write prompts manually and it must not fall back to one
static product image when scene images are missing. Local artifacts are written
under:

- `commerce-assets/generated-scenes/<candidate_id>/v008/`
- `commerce-assets/generated-videos/<candidate_id>/v008/story-shorts.mp4`
- `commerce-assets/generated-audio/<candidate_id>/v008/`

These generated artifacts are local evidence only and must not be committed.

This endpoint is prepare-only. It must return
`external_api_called=false`, `youtube_upload_executed=false`, `uploaded=false`,
`db_written=false`, `r2_uploaded=false`, `queue_created=false`,
`worker_job_created=false`, and `upload_package_created=false`.

The `/uploads` product package section may copy package JSON for manual review,
but it must not call `/api/uploads/youtube/execute` in this PR.

## One-product Real Product Video Asset Entrypoint

`POST /api/uploads/youtube/real-product-pilot/video-asset/prepare` adds the
approval-gated bridge between a candidate-only real product and the
server-accessible `video/mp4` asset required by real product auto pilot.

It validates one candidate id at a time, blocks smoke/test candidates, requires
affiliate and image readiness, and can call the approval-gated local-only video
generator for `generate_local_only`. The generated mp4 remains local evidence:
`local_only=true`, `domain_ready=false`, no raw source URL in the response, and
no R2/DB/upload side effects. `register_server_asset` validates the prepared
asset reference and persists one candidate-linked `product_assets` row only after
the schema capability precheck passes.

Candidate-only persistence requires
`supabase/migrations/009_candidate_linked_product_assets.sql`: `product_queue_id`
must be nullable and `product_candidate_id` must exist. If this schema is not
ready, the endpoint returns `PRODUCT_ASSETS_SCHEMA_REQUIRES_QUEUE_ID` before any
R2/S3 upload is attempted. It must never write `product_queue_id=""`. If storage
upload succeeds but the DB write fails, the response must include
`product_asset_orphan_object_possible` and keep `product_assets_written=false`.

The endpoint and `/uploads` UI must keep all YouTube execution, public upload,
queue/job creation, upload-package persistence, and raw URL or secret display
disabled outside the exact server asset registration path.

## Readiness Gate Resolver

The dashboard uses a dedicated readiness gate resolver so operators can see what is blocked, why it is blocked, and which
safe configuration source to inspect. It is still read-only diagnostics. It does not run token exchange, does not call
`/api/uploads/youtube/execute`, does not call YouTube, and does not write DB/R2/queue/job/upload-package state.

Resolver gates:

- `quota_ready`: YouTube 할당량 준비. Source: `YOUTUBE_QUOTA_READY`.
- `account_ready`: YouTube 계정/채널 준비. Source: `YOUTUBE_ACCOUNT_READY`.
- `policy_ready`: 업로드 정책 준비. Source: `YOUTUBE_POLICY_READY` plus `PUBLIC_UPLOAD_ENABLED=false`.
- `youtube_upload_enabled`: YouTube private upload feature flag. Source: `YOUTUBE_PRIVATE_UPLOAD_ENABLED` or legacy `YOUTUBE_UPLOAD_ENABLED`.
- `public_upload_blocked`: public visibility and public upload remain blocked. Source: `PUBLIC_UPLOAD_ENABLED=false`.
- `manual_upload_only`: manual verification remains enabled.
- `approval_required`: exact approval phrases remain required.
- `token_ready`: token provider metadata only. Source names: `YOUTUBE_TOKEN_FILE`, `YOUTUBE_LOCAL_TOKEN_FILE_PATH`, and token readiness metadata.
- domain token provider readiness: `YOUTUBE_TOKEN_PROVIDER` plus safe readiness booleans such as `YOUTUBE_TOKEN_READY` and `YOUTUBE_SCOPES_READY`; local token files remain localhost diagnostics.
- `scopes_ready`: `youtube.upload` scope metadata only.
- `candidate_ready`, `video_file_ready`, `disclosure_ready`, and `prepare_ready`: dashboard form/manual checks.
- `execute_ready`: aggregate server readiness. Execute remains blocked until `readiness.can_upload=true` plus prepare and approval phrases pass.

The UI may show env names such as `YOUTUBE_CLIENT_SECRET`, but it must never show env values, token JSON, access tokens,
refresh tokens, client secret values, or Authorization headers.

`token-readiness` checks local token file metadata only. It reports file placement, file existence, token readiness, and scope readiness without returning token values.

`prepare` validates and returns request JSON only. It does not call YouTube.

`execute-readiness` is a side-effect-free dry-run for the stricter execute
contract. The default `private_execute` intent combines `readiness.can_upload`,
the exact upload confirmation, and private-only visibility into a single
`can_execute` boolean. It must return non-empty `blocked_reasons` when blocked,
for example `upload_confirmation_missing`, `private_execute_approval_missing`,
or `visibility_unlisted_blocked`, and it must keep all upload side effects false.
The `/uploads` dashboard uses this endpoint to keep the execute button disabled
when server execute gates are stricter than the top-level readiness card.

The real-product execute path sends the same private execute confirmation to both
`execute-readiness` and `execute`:

```json
{
  "execution_intent": "private_execute",
  "visibility": "private",
  "confirmation": "APPROVE_YOUTUBE_PRIVATE_UPLOAD"
}
```

Live smoke remains a separate contract. It must explicitly send
`execution_intent=live_smoke` and the smoke approval phrase:

```json
{
  "execution_intent": "live_smoke",
  "visibility": "private",
  "smoke_approval": "RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE",
  "confirmation": "APPROVE_YOUTUBE_PRIVATE_UPLOAD"
}
```

If `execute-readiness` returns `can_execute=true`, the subsequent Execute
request must preserve the same intent, visibility, and approval fields. A later
`live_smoke_approval_missing` response on a `private_execute` request means the
dashboard/server contract is misaligned, not that an upload succeeded.

`execute` requires:

- exact confirmation phrase
- readiness `can_upload=true`
- execute readiness `can_execute=true`
- private visibility
- required disclosure and affiliate URL

Without readiness and explicit approval, it returns `BLOCKED_BY_CONFIRMATION` or
`BLOCKED_BY_YOUTUBE_READINESS` with a safe top-level `safe_error` and non-empty
`blocked_reasons`.

## Local Token Provider

Local token provider readiness is documented in [YOUTUBE_LOCAL_TOKEN_PROVIDER.md](YOUTUBE_LOCAL_TOKEN_PROVIDER.md).
The local OAuth helper for creating an operator-owned token file is documented in
[YOUTUBE_LOCAL_OAUTH_TOKEN_HELPER.md](YOUTUBE_LOCAL_OAUTH_TOKEN_HELPER.md).

The local token provider:

- requires the token file path to be outside this repository
- supports `YOUTUBE_LOCAL_TOKEN_FILE_PATH` first, then `YOUTUBE_TOKEN_FILE` as a fallback
- checks token file existence and metadata only
- never returns token values
- never logs token JSON
- does not run OAuth exchange
- remains localhost diagnostic metadata only for domain readiness

## Refresh Before Upload

PR #80 changes the domain upload contract so the server-only adapter no longer
treats a local token file as the production/domain token source. Local token
files remain useful for localhost diagnostics, but deployed-domain readiness
requires a server-only token provider contract.

Current contract behavior:

- `YOUTUBE_TOKEN_PROVIDER` must point to a server-accessible provider contract.
- readiness returns booleans, blockers, and safe messages only.
- token/client secret/raw Authorization values are never returned to the client.
- if no server token implementation is available, execute returns
  `server_token_provider_contract_only` instead of falling back to a local token
  file.

The adapter must never print access tokens, refresh tokens, client secrets,
Authorization headers, or raw Google token responses.

## Live Smoke

Live upload smoke is not run by default.

Required conditions before any live smoke:

- `RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE`
- `APPROVE_YOUTUBE_PRIVATE_UPLOAD`
- `readiness.can_upload=true`
- `token_ready=true`
- `quota_ready=true`
- visibility is `private`
- `prepared_video_asset` exists
- `prepared_video_asset.server_accessible=true`
- `prepared_video_asset.mime_type=video/mp4`
- `disclosure_text` exists
- `selected_affiliate_url` exists

If any condition is missing, report:

```text
live_upload_smoke: NOT RUN
blocked_reason: BLOCKED_BY_YOUTUBE_READINESS or BLOCKED_BY_MISSING_SMOKE_APPROVAL
```

If a previous live smoke reached YouTube but returned HTTP 401, first refresh or
re-authorize the server token provider outside the client. A new live smoke
still requires the exact smoke approval phrase and exact upload confirmation.

The first private smoke completed successfully for the documented smoke
candidate `candidate-video-smoke-001`. Result tracking after that smoke is a
manual verification bridge only: it records private Studio visibility, title,
Korean disclosure, and public-upload-blocked checks without calling
`/api/uploads/youtube/execute` again, without calling YouTube again, and without
writing DB/R2/queue/job/upload-package state.

## Safety Boundaries

- Public upload is blocked.
- OAuth token exchange remains local-only and approval-gated by `APPROVE_YOUTUBE_LOCAL_OAUTH_TOKEN_GENERATION`.
- OAuth token storage is not implemented in the repository.
- Access tokens and refresh tokens must never be shown in UI or logs.
- Raw Authorization headers must never be shown.
- Fake success is forbidden.
- Queue rows, worker jobs, R2 uploads, upload package rows, and platform upload result writes are not created by this adapter.
- TikTok and Threads are out of scope.

## videos.insert Boundary

The adapter performs YouTube Data API `videos.insert` only through a server-only resumable upload path after readiness, exact confirmation, private visibility, and any intent-specific approval pass. `RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE` is required only for `execution_intent=live_smoke`. Success requires a returned YouTube video id. Missing video id, missing server-accessible asset reference, missing token readiness, public or unlisted visibility, or failed provider responses must return `succeeded=false`.

Motion-first shorts add a provider-quality prerequisite before final private execute. `slideshow_generated`, `animated_still_generated` without real clips, missing hand/utensil/product-rotate interactions, missing provider configuration, or public/unlisted upload policy gaps must block before any `videos.insert` attempt.

See [YOUTUBE_PRIVATE_UPLOAD_SMOKE.md](YOUTUBE_PRIVATE_UPLOAD_SMOKE.md) for the smoke checklist.
