# ComfyUI Wan I2V Provider

This document describes the disabled-by-default ComfyUI Wan image-to-video
adapter for motion-first commerce shorts.

## Current State

```text
provider=comfyui_wan_i2v
default_enabled=false
default_configured=false
current_expected_blocker=COMFYUI_WAN_I2V_PROVIDER_DISABLED
live_execution_ready=false
```

The adapter adds readiness parsing, workflow-template validation, scene-brief
mapping, a mockable ComfyUI client interface, and safe `MotionClipResult`
conversion. It does not install ComfyUI, download Wan weights, run a GPU job, or
create a real video clip in this PR.

## Environment Placeholders

`.env.example` documents only disabled local placeholders:

```text
COMFYUI_WAN_I2V_ENABLED=false
COMFYUI_BASE_URL=http://127.0.0.1:8188
COMFYUI_WAN_I2V_WORKFLOW_PATH=./config/comfyui/wan-i2v.workflow.example.json
COMFYUI_WAN_I2V_TIMEOUT_MS=600000
COMFYUI_WAN_I2V_POLL_INTERVAL_MS=2000
COMFYUI_WAN_I2V_OUTPUT_DIR=commerce-assets/generated-motion
```

Do not commit `.env.local`. Do not print raw env values, tokens,
Authorization headers, client secrets, affiliate URLs, image URLs, or generated
asset URLs.

## Readiness

`resolveComfyUiWanI2VReadiness()` returns configured booleans and safe summary
metadata only. `configured=true` requires:

- `COMFYUI_WAN_I2V_ENABLED=true`
- `COMFYUI_BASE_URL` present
- `COMFYUI_WAN_I2V_WORKFLOW_PATH` present
- workflow template file exists
- workflow template JSON is valid and contains the required placeholders

Blockers:

- `COMFYUI_WAN_I2V_PROVIDER_DISABLED`
- `COMFYUI_BASE_URL_MISSING`
- `COMFYUI_WAN_I2V_WORKFLOW_PATH_MISSING`
- `COMFYUI_WAN_I2V_WORKFLOW_NOT_FOUND`
- `COMFYUI_WAN_I2V_WORKFLOW_INVALID_JSON`
- `COMFYUI_WAN_I2V_PROVIDER_NOT_CONFIGURED`
- `COMFYUI_WAN_I2V_LIVE_EXECUTION_NOT_APPROVED`

The safe summary may include booleans, timing numbers, and basenames. It must
not include the raw ComfyUI URL, full local paths, secrets, or raw API responses.

## Workflow Template

The example template at
`config/comfyui/wan-i2v.workflow.example.json` is a placeholder. It contains no
real model path and no local absolute path. It requires these placeholders:

```text
{{PROMPT}}
{{NEGATIVE_PROMPT}}
{{SOURCE_IMAGE_PATH}}
{{OUTPUT_PREFIX}}
{{SEED}}
{{DURATION_SECONDS}}
{{WIDTH}}
{{HEIGHT}}
```

Actual ComfyUI node classes, model names, and local paths belong in a separate
local smoke branch after explicit approval.

## Scene Mapping

`mapMotionSceneBriefToComfyUiWorkflowInput()` turns a motion scene brief into a
vertical 1080x1920 image-to-video workflow input.

Prompt guardrails:

- photorealistic vertical 9:16
- real kitchen countertop
- hands or cropped arm when interacting with the product
- stainless utensil or product-specific wording
- natural lighting
- usage example, not testimonial or fake review

Scene-specific additions:

- `hand_pickup`: realistic hand taking a utensil from the set
- `cooking_use`: hand stirring soup with a utensil
- `product_rotate`: utensil set slowly rotating with subtle orbit camera motion

Default negatives include cartoon, vector illustration, abstract shapes,
geometric placeholder, distorted fingers, fake logo, fake review, text artifacts,
and watermark.

## Client Wrapper

`ComfyUIClient` is the adapter boundary:

```ts
export interface ComfyUIClient {
  submitWorkflow(input: ComfyUIWorkflowInput): Promise<ComfyUIPromptResult>;
  waitForResult(promptId: string, options: ComfyUIPollOptions): Promise<ComfyUIHistoryResult>;
  resolveOutput(result: ComfyUIHistoryResult): Promise<ComfyUIOutputRef>;
}
```

Tests use mock clients only. The HTTP wrapper is scaffolded for the ComfyUI
`/prompt` and `/history/{prompt_id}` shape, with no raw response logging. ComfyUI
also documents `/ws` as the real-time server endpoint; that is not used by this
PR.

References:

- [ComfyUI server routes](https://docs.comfy.org/development/comfyui-server/comms_routes)
- [ComfyUI prompt history](https://docs.comfy.org/api-reference/cloud/job/get-history-for-specific-prompt)

## Execution Gate

Even when readiness is configured, `generate()` returns:

```text
COMFYUI_WAN_I2V_LIVE_EXECUTION_NOT_APPROVED
```

unless a future caller explicitly opts into a separately reviewed local smoke
path. The future local-only approval phrase is:

```text
APPROVE_COMFYUI_WAN_I2V_LOCAL_SMOKE_ONLY
```

That future smoke must still remain local-only and must not call YouTube, R2, DB
writes, migrations, production deploys, public uploads, or unlisted uploads.

## Motion Quality Contract

A successful mocked ComfyUI clip must provide:

- `providerMode=image_to_video_generated`
- `realMotion=true`
- positive `durationSeconds`
- `mimeType` starting with `video/`
- `safeClipRef` or `localPath`

Quality gate requirements remain:

- at least four motion scenes
- at least two real motion scenes
- at least two hand interaction scenes
- at least two utensil interaction scenes
- product rotate scene present
- slideshow-like output blocked
- public upload blocked

## Validation

Focused adapter coverage:

```powershell
npm run test -- tests/comfyui-wan-i2v-provider.test.ts
```

Full PR validation must also run the upload, disclosure, lint, build, Python
worker, and diff checks listed in `docs/08_TEST_AND_QA_CHECKLIST.md`.
