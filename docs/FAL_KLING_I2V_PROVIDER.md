# fal Kling I2V Provider Adapter

Date: 2026-06-21 KST

Scope: adapter, readiness, request mapping, and mock-client tests only.

This PR does not call fal, Kling, Replicate, Luma, Runway, Pika, YouTube, R2,
or any production database. It does not generate, download, upload, or commit
mp4/mov/webm artifacts.

## 2026-06-21 Paid Smoke Failure Record

The first approved one-scene paid smoke attempted exactly one submit for:

```text
scene_id=scene-06-product-rotate
scene_kind=product_rotate
duration_seconds=5
aspect_ratio=9:16
provider=fal_kling_i2v
```

Sanitized result:

```text
blocker=FAL_SUBMIT_HTTP_502
submit_success=false
request_id_present=false
polling_attempted=false
result_fetch_attempted=false
retry_loop_attempted=false
second_submit_attempted=false
generated_clip_count=0
```

No clip, manifest, R2 upload, DB write, YouTube Execute, `videos.insert`,
public upload, or unlisted upload occurred. Because no request id was returned,
the only valid state is blocked. Do not poll, fetch results, or retry from that
state.

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

Future retry after the recorded 502 requires a fresh approval phrase:

```text
APPROVE_FAL_KLING_ONE_SCENE_PAID_SMOKE_RETRY_AFTER_502
```

That retry phrase is documentation only in this PR. It does not trigger a
network call here.

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

## No-Cost Payload Audit

Before any future paid submit, run the no-cost payload audit. It validates only
shape and booleans:

- `prompt` is present
- `image_url` is present, but never echoed
- `duration` is one of `5` or `10`
- paid smoke duration is exactly `5`
- `aspect_ratio` is one of `16:9`, `9:16`, or `1:1`
- paid smoke aspect ratio is exactly `9:16`
- `negative_prompt` is present
- `cfg_scale` is a valid number when supplied
- `sourceImageSafeRef` is present
- external image accessibility has been checked by the operator
- model id presence is true
- API key presence is true
- cost approval is true
- scene id is `scene-06-product-rotate`
- scene count is one

Audit output must mask raw image URLs, raw source image URLs, raw model ids, API
keys, Authorization headers, full request bodies, and full provider responses.

The fal Kling I2V schema checked for this adapter is:

```text
prompt: required string
image_url: required string
duration: "5" or "10"
aspect_ratio: "16:9" or "9:16" or "1:1"
negative_prompt: optional/recommended string
cfg_scale: optional number
```

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

## Submit Failure Guard

When submit returns HTTP 5xx without a request id, the guard must produce a
sanitized blocker and stop:

```text
if submit_http_status >= 500 and request_id missing:
  blocker = FAL_SUBMIT_HTTP_<status>
  polling_attempted = false
  result_fetch_attempted = false
  retry_loop_attempted = false
  generated_clip_count = 0
  safe_to_retry = false
  requires_fresh_approval = true
```

For the observed case, the blocker is:

```text
FAL_SUBMIT_HTTP_502
```

The next paid retry is not allowed until all of these are true:

- payload audit passed
- provider configured
- cost approved
- fresh paid retry approval present
- previous submit had no request id
- manual fal dashboard billing/credit check completed

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
