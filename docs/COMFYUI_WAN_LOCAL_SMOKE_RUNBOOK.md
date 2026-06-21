# ComfyUI Wan Local Smoke Runbook

This runbook describes the future local-only smoke after setup readiness is
true. It is not a public, unlisted, R2, or database execution path.

## Preflight

Run:

```powershell
npm run comfyui:config-check
npm run comfyui:smoke:dry-run
```

Proceed to a real local smoke only when:

- `provider_configured=true`
- a separate local smoke approval is present
- ComfyUI is already running on the user's machine
- the Wan I2V workflow was exported and reviewed by the user

## Smoke Scenes

The dry-run scene contract is:

- `scene-04-hand-pickup`: hand picks up the product on a real kitchen counter.
- `scene-05-cooking-use`: product is used during simple cooking preparation.
- `scene-06-product-rotate`: product rotates with a subtle camera move.

Each scene must stay photorealistic, vertical 9:16, and commerce-safe. Negative
rules must block cartoon, vector, abstract, fake logo, fake review text,
distorted fingers, and watermark output.

## Local Smoke Success Criteria

- `smoke_only=true`
- `final_upload_allowed=false`
- `clip_count >= 1`
- generated clip is readable by `ffprobe`
- frame difference is detected
- hand interaction scene is present
- cooking-use or utensil interaction scene is present
- product-rotate scene is present
- generated artifacts remain under ignored `commerce-assets/` folders

The next stage is human review of local smoke evidence, not upload.

## Safety

- No YouTube Execute.
- No videos.insert.
- No R2 upload/write.
- No DB write.
- No migration.
- No production deploy.
- No public upload.
- No unlisted upload.
- No upload package creation.
- No queue or worker job creation.
