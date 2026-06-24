# Motion-First Shorts Architecture

This architecture makes motion generation the primary path for commerce shorts.
Image slideshow output is retained only as a blocked diagnostic fallback.

## Flow

```text
ProductSourceAdapter
  -> safe ProductCandidateLike
  -> MotionSceneBrief[]
  -> MotionProviderRouter
  -> MotionClipResult[]
  -> MotionManifest
  -> MotionQualityGate
  -> private-only upload package readiness
```

The current production-safe state is:

```text
CURRENT_EXPECTED_BLOCKER=PAID_I2V_AUTOPILOT_BLOCKED for paid provider paths
CURRENT_RENDER_BLOCKER=LOW_COST_MOTION_RENDERER_NOT_EXECUTED
```

## Provider Router

Priority:

1. `rights_confirmed_source_video`
2. `advanced_still_motion`
3. `photorealistic_scene_still`
4. `comfyui_wan_i2v` when local runtime is available
5. `animated_still`
6. `fal_kling_i2v` or other paid I2V only with premium/manual approval and cost cap
7. `slideshow`

Rules:

- Prefer rights-confirmed source video only when rights are explicitly confirmed.
- Use `advanced_still_motion` as the low-cost default autopilot path.
- Keep ComfyUI Wan I2V as a local fallback, but do not retry until its runtime is available.
- Fall back to animated still only as a non-final preview path.
- Treat paid I2V as premium/manual only; paid I2V is premium/manual only.
- Block autopilot paid I2V with `PAID_I2V_AUTOPILOT_BLOCKED`.
- Block slideshow for motion-first final upload.
- Return `MOTION_PROVIDER_NOT_CONFIGURED` when no provider is configured.
- Return `CLOUD_VIDEO_PROVIDER_NOT_CONFIGURED` when cloud provider name or API
  key presence is missing.
- Return `CLOUD_VIDEO_PROVIDER_COST_APPROVAL_REQUIRED` when a cloud provider key
  is present but quota/cost approval is absent.
- Return `COMFYUI_WAN_I2V_PROVIDER_DISABLED` for the default ComfyUI adapter
  state.
- Return `COMFYUI_WAN_I2V_LIVE_EXECUTION_NOT_APPROVED` when ComfyUI config is
  present but a separately approved local smoke has not been granted.

The provider contract uses:

```text
MotionProviderMode = "source_video_generated" | "real_motion_generated" | "image_to_video_generated" | "programmed_still_motion_generated" | "animated_still_generated" | "slideshow_generated"
MotionProviderName = "rights_confirmed_source_video" | "advanced_still_motion" | "photorealistic_scene_still" | "cloud_image_to_video" | "comfyui_wan_i2v" | "ltx_video" | "animated_still" | "slideshow"
```

## Low-Cost Advanced Still Motion

The MVP default path is now advanced still motion, not paid cloud I2V. The
renderer plan uses product push-in, orbit illusion, cutout slide, parallax
countertop, slow zoom/pan, before/after split, checklist overlay motion, and CTA
hero motion. It is designed for local FFmpeg/MoviePy execution in a separate
approval step.

The low-cost quality gate requires at least six programmed-motion scenes, no
paid I2V scenes, static-only ratio at or below 0.30, same-frame ratio at or
below 0.35, safe captions, voiceover audio, a visible first-second hook, no
clipped text, and public upload blocked. Until a local render is executed and
reviewed, the expected blocker is:

```text
LOW_COST_MOTION_RENDERER_NOT_EXECUTED
```

## Source Video Provider Scaffold

`rights_confirmed_source_video` is a scaffold for future product/supplier videos.
It is disabled by default, requires explicit rights confirmation, and blocks raw
video download in this PR.

Blockers:

```text
SOURCE_VIDEO_PROVIDER_DISABLED
SOURCE_VIDEO_RIGHTS_NOT_CONFIRMED
SOURCE_VIDEO_RAW_DOWNLOAD_BLOCKED
```

## Cloud Image-To-Video Scaffold

The `cloud_image_to_video` scaffold exists because the local ComfyUI Desktop
runtime is currently unavailable before HTTP server bind. The observed runtime
failure is a Windows access violation around `torch.cuda.is_available` with the
stack entering `comfy_kitchen/backends/cuda`.

The cloud scaffold is intentionally conservative:

- default enabled: false
- configured without API key: false
- configured without cost approval: false
- tests use mock-only clip generation
- no paid API calls are implemented
- no vendor SDK is installed
- no API key value is logged in `safeSummary`

Candidate research is in `docs/research/CLOUD_VIDEO_PROVIDER_EVALUATION.md`.
The local runtime fallback note is in `docs/COMFYUI_LOCAL_RUNTIME_FALLBACK.md`.

## fal Kling I2V Adapter

The first concrete cloud adapter is `fal_kling_i2v`. It is still disabled by
default and implements only config parsing, readiness, scene mapping, a client
interface, and a mock client. It is no longer part of the default autopilot path:
paid I2V is premium/manual only.

Required configuration:

- `FAL_KLING_I2V_ENABLED=true`
- `FAL_API_KEY` present
- `FAL_KLING_I2V_MODEL_ID` present
- `FAL_KLING_I2V_COST_APPROVED=true`

Default blocker:

```text
FAL_KLING_I2V_PROVIDER_DISABLED
```

Configured but non-mock live execution still blocks at:

```text
FAL_KLING_I2V_LIVE_EXECUTION_NOT_APPROVED
```

Paid API calls remain blocked in this adapter PR. The future paid local smoke
approval phrase is documented as `APPROVE_FAL_KLING_I2V_PAID_LOCAL_SMOKE_ONLY`
and must be handled in a separate prompt/PR.

The default paid policy is:

```text
autopilotPaidI2VEnabled=false
maxPaidI2VScenesPerShort=0
maxPaidI2VCostPerShortUsd=0
premiumManualOnly=true
freshApprovalRequired=true
```

The first one-scene paid smoke reached fal submit once and stopped with:

```text
FAL_SUBMIT_HTTP_502
```

The submit failed before a request id was returned. The architecture now treats
that as a hard stop: no polling, no result fetch, no retry loop, no second
submit, and no generated clip. A future retry must first pass a no-cost payload
audit, confirm provider config and cost approval, complete a manual fal
dashboard billing/credit check, and provide fresh explicit retry approval:

```text
APPROVE_FAL_KLING_ONE_SCENE_PAID_SMOKE_RETRY_AFTER_502
```

See `docs/FAL_KLING_I2V_PROVIDER.md`.

## ComfyUI Wan I2V Adapter

The ComfyUI Wan I2V adapter is a disabled-by-default provider implementation.
It adds:

- env readiness parsing from ComfyUI-specific names in `.env.example`
- safe readiness summaries with booleans and basenames only
- placeholder workflow-template loading and validation
- scene-brief mapping for `hand_pickup`, `cooking_use`, and `product_rotate`
- a `ComfyUIClient` interface for mocked tests and future local-only smoke work
- live execution blocking by default

Configured readiness requires `COMFYUI_WAN_I2V_ENABLED=true`, a base URL, a
workflow path, an existing workflow template, and valid workflow JSON. The
adapter still blocks generation with `COMFYUI_WAN_I2V_LIVE_EXECUTION_NOT_APPROVED`
unless a future local smoke explicitly opts in.

Current local runtime diagnosis: config and workflow JSON pass, but ComfyUI
Desktop/backend does not expose `http://127.0.0.1:8188` or `/system_stats`.
Do not retry local smoke until the operator manually starts ComfyUI successfully.

See `docs/COMFYUI_WAN_I2V_PROVIDER.md`.

## Event-Aware Coupang Scout Guard

The event-aware live Coupang scout is an upstream product-source gate for the
low-cost motion v1.1 next-product flow. It must prove baseline exclusion before
any live scout provider call, ranking, or candidate import:

```text
baseline_candidate_id=candidate-490aa6d25e8ea89d
baseline_candidate_excluded=true
```

If baseline exclusion is not proven, the scout stops with
`BASELINE_CANDIDATE_EXCLUSION_NOT_PROVEN`. If Coupang Partners returns HTTP 401,
the scout stops with `COUPANG_PARTNERS_API_HTTP_401`; it does not retry, import a
candidate, render, upload to R2, write `product_assets`, execute YouTube, call
`videos.insert`, or allow public/unlisted upload. See
`docs/COUPANG_PARTNERS_AUTH_DIAGNOSTICS.md`.

After external verification, the final one-shot live scout still returned
`COUPANG_PARTNERS_API_HTTP_401_PERSISTED_AFTER_EXTERNAL_VERIFICATION`. The MVP
live scout path is therefore locked until provider/account support resolves the
auth issue. The replacement source gate is `manual_event_candidate`, which
accepts a manually provided rainy-season product name, category, affiliate URL,
and product image URL, then validates event relevance, baseline exclusion,
policy safety, URL presence, and low-cost motion suitability without executing
import, render, R2, DB, or YouTube side effects. See
`docs/COUPANG_EVENT_AWARE_SCOUT.md`.

## Quality Gate

The final upload gate requires:

- `motion_scene_count >= 4`
- `real_motion_scene_count >= 2`
- `hand_interaction_scene_count >= 2`
- `utensil_interaction_scene_count >= 2`
- `product_rotate_scene_present = true`
- `slideshow_like_ratio <= 0.25`
- `all_scenes_static = false`
- `public_upload_blocked = true`

Required blockers:

- `MOTION_PROVIDER_NOT_CONFIGURED`
- `CLOUD_VIDEO_PROVIDER_NOT_CONFIGURED`
- `CLOUD_VIDEO_PROVIDER_COST_APPROVAL_REQUIRED`
- `CLOUD_VIDEO_PROVIDER_LIVE_API_NOT_IMPLEMENTED`
- `FAL_KLING_I2V_PROVIDER_DISABLED`
- `FAL_API_KEY_MISSING`
- `FAL_KLING_I2V_MODEL_ID_MISSING`
- `FAL_KLING_I2V_COST_APPROVAL_REQUIRED`
- `FAL_KLING_I2V_PROVIDER_NOT_CONFIGURED`
- `FAL_KLING_I2V_LIVE_EXECUTION_NOT_APPROVED`
- `FAL_KLING_I2V_PAID_API_CALL_BLOCKED`
- `FAL_SUBMIT_HTTP_502`
- `PAID_I2V_MANUAL_PREMIUM_APPROVAL_REQUIRED`
- `PAID_I2V_COST_CAP_REQUIRED`
- `PAID_I2V_SCENE_CAP_EXCEEDED`
- `PAID_I2V_AUTOPILOT_BLOCKED`
- `SOURCE_VIDEO_RIGHTS_NOT_CONFIRMED`
- `SOURCE_VIDEO_PROVIDER_DISABLED`
- `SOURCE_VIDEO_RAW_DOWNLOAD_BLOCKED`
- `LOW_COST_MOTION_RENDERER_NOT_EXECUTED`
- `COUPANG_PARTNERS_API_HTTP_401_PERSISTED_AFTER_EXTERNAL_VERIFICATION`
- `MANUAL_EVENT_CANDIDATE_FALLBACK_REQUIRES_PERSISTENT_401`
- `MANUAL_EVENT_CANDIDATE_PRODUCT_NAME_MISSING`
- `MANUAL_EVENT_CANDIDATE_AFFILIATE_URL_MISSING`
- `MANUAL_EVENT_CANDIDATE_AFFILIATE_URL_INVALID`
- `MANUAL_EVENT_CANDIDATE_IMAGE_URL_MISSING`
- `MANUAL_EVENT_CANDIDATE_IMAGE_URL_INVALID`
- `MANUAL_EVENT_CANDIDATE_BASELINE_BLOCKED`
- `MANUAL_EVENT_CANDIDATE_EVENT_RELEVANCE_TOO_LOW`
- `MANUAL_EVENT_CANDIDATE_POLICY_RISK`
- `MANUAL_EVENT_CANDIDATE_LOW_COST_MOTION_UNSUITABLE`
- `COMFYUI_WAN_I2V_PROVIDER_DISABLED`
- `COMFYUI_BASE_URL_MISSING`
- `COMFYUI_WAN_I2V_WORKFLOW_PATH_MISSING`
- `COMFYUI_WAN_I2V_WORKFLOW_NOT_FOUND`
- `COMFYUI_WAN_I2V_WORKFLOW_INVALID_JSON`
- `COMFYUI_WAN_I2V_PROVIDER_NOT_CONFIGURED`
- `COMFYUI_WAN_I2V_LIVE_EXECUTION_NOT_APPROVED`
- `REAL_MOTION_CLIP_REQUIRED`
- `MOTION_SCENE_COUNT_TOO_LOW`
- `HAND_INTERACTION_SCENE_MISSING`
- `UTENSIL_INTERACTION_SCENE_MISSING`
- `PRODUCT_ROTATE_SCENE_MISSING`
- `SLIDESHOW_LIKE_OUTPUT_BLOCKED`
- `ALL_SCENES_STATIC_BLOCKED`
- `IMAGE_SWAP_ONLY_VIDEO_BLOCKED`

The scaffold also reports `PUBLIC_UPLOAD_NOT_BLOCKED` when public/unlisted
upload policy is not explicitly blocked.

## Product Source Adapter

The adapter contract supports:

```text
ProductSource = "coupang" | "shopify" | "amazon_creators" | "medusa" | "spree" | "saleor" | "woocommerce"
```

`coupang` is a thin local mapper for existing candidate data. Shopify Storefront
API, Amazon Creators API, Amazon Product Advertising API, Medusa, Spree, Saleor,
and WooCommerce remain stub-only with no API calls, no secrets, and no raw URL
output.

## Safety

This scaffold does not:

- call `/api/uploads/youtube/execute`
- call `videos.insert`
- call external YouTube APIs
- upload or write to R2
- write to DB
- run migrations
- deploy
- enable public upload
- enable unlisted upload
- execute ComfyUI workflows
- call paid cloud video APIs
- install ComfyUI, Wan2.1, Wan2.2, LTX-Video, CogVideoX, HunyuanVideo,
  AnimateDiff, Stable Video Diffusion, ModelScope, or Diffusers
- download model weights
- generate mp4, mov, or webm artifacts

## Prior QA Constraints

The provider implementation must not repeat the false-positive failures tracked
from `pLBtNgrwLJA`, `mLytN-u2C5M`, `hRq1iap1C14`, and `G-r6rWsZwiU`: repeated
static product imagery, color-card scenes, abstract shape cards, unrealistic
hands, non-photorealistic kitchens, slideshow-like output, caption unsafe-area
failures, slow voice, missing real motion clips, or product identity drift.
