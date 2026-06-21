# Low-Cost Motion Shorts Strategy

Date: 2026-06-21 KST

## Decision

The default MVP motion path pivots away from paid cloud image-to-video.

Reason: the first fal Kling 5 second paid smoke stopped at submit with
`FAL_SUBMIT_HTTP_502` before a request id. No clip was generated, and the
estimated cost profile is too high for default autopilot commerce-shorts
automation.

The new default is low-cost advanced still motion:

```text
CURRENT_DEFAULT_PROVIDER=advanced_still_motion
paid I2V is premium/manual only
PAID_I2V_AUTOPILOT_BLOCKED
LOW_COST_MOTION_RENDERER_NOT_EXECUTED
```

## Default Autopilot Route

Autopilot provider priority:

1. `rights_confirmed_source_video`
2. `advanced_still_motion`
3. `photorealistic_scene_still`
4. `comfyui_wan_i2v` when local runtime is available
5. `animated_still`
6. paid I2V only when premium/manual policy permits it
7. `slideshow` as blocked diagnostic fallback

Paid I2V is not the default autopilot provider. fal Kling and generic cloud
image-to-video remain available only as premium/manual options with explicit
budget, scene cap, and fresh approval gates.

## Cost Policy

Default policy:

```text
autopilotPaidI2VEnabled=false
maxPaidI2VScenesPerShort=0
maxPaidI2VCostPerShortUsd=0
premiumManualOnly=true
freshApprovalRequired=true
```

Paid provider blockers:

```text
PAID_I2V_AUTOPILOT_BLOCKED
PAID_I2V_MANUAL_PREMIUM_APPROVAL_REQUIRED
PAID_I2V_COST_CAP_REQUIRED
PAID_I2V_SCENE_CAP_EXCEEDED
```

## Low-Cost Renderer Plan

The low-cost path uses advanced still motion with FFmpeg/MoviePy-style
programmed moves. This PR adds the planning and policy scaffold only. It does
not render mp4/mov/webm artifacts.

Supported motion types:

- `product_push_in`
- `product_orbit_illusion`
- `product_cutout_slide`
- `parallax_countertop`
- `slow_zoom_pan`
- `before_after_split`
- `checklist_overlay_motion`
- `cta_product_hero_motion`

Default eight-scene plan:

1. `scene-01-hook`: push-in
2. `scene-02-problem`: pan over a messy drawer/problem still
3. `scene-03-product-intro`: product hero zoom
4. `scene-04-hand-pickup`: photorealistic scene still plus subtle motion
5. `scene-05-cooking-use`: photorealistic scene still plus steam/light motion
6. `scene-06-product-rotate`: orbit illusion or product cutout motion
7. `scene-07-checklist`: checklist overlay motion
8. `scene-08-cta`: product hero and CTA motion

Low-cost quality requires:

```text
paid_i2v_scene_count=0
low_cost_motion_scene_count >= 6
static_only_ratio <= 0.30
same_frame_ratio <= 0.35
caption_safe_area_pass=true
voiceover_audio_present=true
hook_visible_first_second=true
no_text_clipped=true
public_upload_blocked=true
```

Even when these pass, final upload remains blocked until a separate local
renderer execution produces reviewed local artifacts. The expected render-path
blocker is `LOW_COST_MOTION_RENDERER_NOT_EXECUTED`.

## Source Video Scaffold

If a product page or supplier provides real product video, it can become the
highest-quality low-cost source only after rights are confirmed.

Source video defaults:

```text
enabled=false
rights_confirmed_required=true
raw video download disabled
use_allowed=false unless explicitly confirmed
```

Blockers:

```text
SOURCE_VIDEO_PROVIDER_DISABLED
SOURCE_VIDEO_RIGHTS_NOT_CONFIRMED
SOURCE_VIDEO_RAW_DOWNLOAD_BLOCKED
```

## Safety

This pivot PR does not:

- call paid APIs
- call fal, Kling, Replicate, Luma, Runway, or Pika
- generate motion clips
- create mp4/mov/webm files
- call YouTube Execute or `videos.insert`
- upload/write to R2
- write `product_assets`
- write DB rows or run migrations
- enable public or unlisted upload
- commit `.env.local`, API keys, raw URLs, `commerce-assets`, or media artifacts
