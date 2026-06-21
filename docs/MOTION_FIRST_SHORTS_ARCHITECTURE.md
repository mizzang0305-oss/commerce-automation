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
CURRENT_EXPECTED_BLOCKER=MOTION_PROVIDER_NOT_CONFIGURED
```

## Provider Router

Priority:

1. `comfyui_wan_i2v`
2. `ltx_video`
3. `animated_still`
4. `slideshow`

Rules:

- Prefer ComfyUI Wan I2V when configured.
- Fall back to LTX-Video when ComfyUI is not configured.
- Fall back to animated still only as a non-final preview path.
- Block slideshow for motion-first final upload.
- Return `MOTION_PROVIDER_NOT_CONFIGURED` when no provider is configured.

The provider contract uses:

```text
MotionProviderMode = "real_motion_generated" | "image_to_video_generated" | "animated_still_generated" | "slideshow_generated"
MotionProviderName = "comfyui_wan_i2v" | "ltx_video" | "animated_still" | "slideshow"
```

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
- install ComfyUI, Wan2.1, Wan2.2, LTX-Video, CogVideoX, HunyuanVideo,
  AnimateDiff, Stable Video Diffusion, ModelScope, or Diffusers
- download model weights

## Prior QA Constraints

The provider implementation must not repeat the false-positive failures tracked
from `pLBtNgrwLJA`, `mLytN-u2C5M`, `hRq1iap1C14`, and `G-r6rWsZwiU`: repeated
static product imagery, color-card scenes, abstract shape cards, unrealistic
hands, non-photorealistic kitchens, slideshow-like output, caption unsafe-area
failures, slow voice, missing real motion clips, or product identity drift.
