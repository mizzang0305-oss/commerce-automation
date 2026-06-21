# fal Kling I2V Provider Adapter

Date: 2026-06-21 KST

Scope: adapter, readiness, request mapping, and mock-client tests only.

This PR does not call fal, Kling, Replicate, Luma, Runway, Pika, YouTube, R2,
or any production database. It does not generate, download, upload, or commit
mp4/mov/webm artifacts.

## Provider State

Provider name:

```text
fal_kling_i2v
```

Default state:

```text
enabled=false
configured=false
runnable=false
current blocker=FAL_KLING_I2V_PROVIDER_DISABLED
```

Readiness inputs:

```text
FAL_KLING_I2V_ENABLED=true
FAL_API_KEY present
FAL_KLING_I2V_MODEL_ID present
FAL_KLING_I2V_COST_APPROVED=true
```

Readiness blockers:

```text
FAL_KLING_I2V_PROVIDER_DISABLED
FAL_API_KEY_MISSING
FAL_KLING_I2V_MODEL_ID_MISSING
FAL_KLING_I2V_COST_APPROVAL_REQUIRED
FAL_KLING_I2V_PROVIDER_NOT_CONFIGURED
FAL_KLING_I2V_LIVE_EXECUTION_NOT_APPROVED
FAL_KLING_I2V_PAID_API_CALL_BLOCKED
```

When enabled, API key, model id, and cost approval are all present, the adapter
can be selected by the router. Live execution still remains blocked unless a
future smoke prompt supplies separate approval.

Future paid local smoke approval phrase:

```text
APPROVE_FAL_KLING_I2V_PAID_LOCAL_SMOKE_ONLY
```

That phrase is documentation only in this PR. It is not consumed here.

## Safe Summary Rules

Readiness and provider summaries expose only booleans and non-sensitive
basenames. They must not include:

- API key values
- Authorization headers
- raw source image URLs
- raw generated media URLs
- signed URLs
- full provider response payloads

## Request Mapping

`MotionSceneBrief` maps to a fal Kling request scaffold with:

- `sceneId`
- `kind`
- `modelId`
- `productName`
- `caption`
- `prompt`
- `negativePrompt`
- `durationSeconds`
- `aspectRatio=9:16`
- `sourceImageSafeRef`
- `outputPrefix`
- `seed`
- `requiredSignals`

The adapter uses safe image references only. Source image upload/download is not
implemented in this PR.

Scene prompts are optimized for:

- photorealistic vertical 9:16 commerce shorts
- real kitchen countertop context
- stainless steel kitchen utensil product consistency
- natural hand/cropped-arm motion when needed
- no face, no testimonial, no fake review, no generated text dependency

## Client Contract

The adapter defines a client boundary:

```ts
interface FalKlingI2VClient {
  submitImageToVideo(input: FalKlingI2VRequest): Promise<FalKlingSubmitResult>;
  getStatus(requestId: string): Promise<FalKlingStatusResult>;
  getResult(requestId: string): Promise<FalKlingResult>;
}
```

This PR includes only a mock client for tests. A live client must be added in a
separate PR after API budget and paid-smoke approval.

## Router Priority

Motion provider priority is:

```text
fal_kling_i2v
cloud_image_to_video
comfyui_wan_i2v
animated_still
slideshow
```

`slideshow` remains blocked for final upload in motion-first shorts.

## Safety

This PR keeps the following false:

- paid API call
- fal/Kling network call
- motion clip generation
- YouTube Execute
- videos.insert
- R2 upload/write
- product_assets write
- DB write
- migration
- production deploy
- public/unlisted upload
- media artifact commit
