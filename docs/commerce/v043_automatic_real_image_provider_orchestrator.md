# v043 Automatic Real Image Provider Orchestrator

v043 adds an automatic real-image provider orchestration layer before the v041/v042 manual image paths.

## Provider Priority

1. `codex_image_skill`
2. `openai_images`
3. `local_comfyui`
4. `local_sd_webui`
5. `manual_pack_fallback`

`manual_pack_fallback` is not treated as an automatic provider. It points the operator back to v042:

```bash
npm run review:v041:from-pack
```

## Safety Boundary

This workflow does not call YouTube Execute, `videos.insert`, upload, create/update/delete comments, change visibility, upload to R2, write `product_assets`, write DB, deploy, or print raw affiliate URLs/tokens/secrets.

`SAFE_TO_UPLOAD` remains `false`.

## Provider Check

Run:

```bash
npm run image-provider:check
```

If no provider is configured, the expected status is:

```text
FINAL_STATUS=BLOCKED_REAL_IMAGE_PROVIDER_NOT_CONFIGURED
```

The check writes local-only setup/fallback artifacts:

- `commerce-assets/review/v043/real-image-provider-setup-guide.md`
- `commerce-assets/review/v043/provider-status.json`
- `commerce-assets/review/v043/scene-prompt-package.json`
- `commerce-assets/review/v043/fallback-to-v042-image-pack-guide.md`

## Review Packet Generation

Run:

```bash
npm run review:v043
```

If a real provider is available, v043 generates 18 images across the three channel folders, validates them through the real image semantic gate, then creates local review packets under:

- `commerce-assets/review/v043/father_jobs/`
- `commerce-assets/review/v043/neoman_moleulgeol/`
- `commerce-assets/review/v043/lets_buy/`

Default human review decision remains:

```json
{
  "version": "v043",
  "human_review_status": "PENDING_HUMAN_REVIEW",
  "metadata_review_status": "PENDING_METADATA_REVIEW",
  "safe_to_upload": false,
  "requires_fresh_upload_approval": true
}
```

## Fallback

If no automatic provider is configured, use v042:

```bash
npm run review:v041:from-pack
```

This keeps owner-supplied real images as the fallback path without pretending that generated images exist.
