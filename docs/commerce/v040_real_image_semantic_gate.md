# v040 Real Image Semantic Gate

## Purpose

v039 proved that scene assets could propagate into rendered frames, but owner review found the assets themselves were mosaic/checkerboard/noise placeholders. v040 adds a stricter gate: a review video can only be generated after the scene assets are real photo-like images with channel-specific lifestyle context.

## v039 Failure Record

- `human_review_status`: `FAIL_LOCAL_HUMAN_REVIEW`
- `safe_to_upload`: `false`
- `pr158_merge_allowed`: `false`
- blockers:
  - `GENERATED_SCENE_ASSETS_ARE_MOSAIC_PLACEHOLDERS`
  - `IMAGE_SKILL_PROVIDER_FALSE_POSITIVE`
  - `ASSET_TO_FRAME_PROOF_ONLY_PROVED_PLACEHOLDER_PROPAGATION`
  - `NO_REAL_LIFE_SCENE_VISIBLE`
  - `CHECKERBOARD_NOISE_ASSET_RENDERED`
  - `REAL_IMAGE_SEMANTIC_GATE_MISSING`
  - `PR158_MERGE_BLOCKED`

## Required Gate

`real_image_semantic_gate` requires:

- at least 6 generated scene assets per channel
- decodable images
- width >= 720
- height >= 1280
- file size > 50000 bytes
- no mosaic/checkerboard/noise/abstract color grid/solid-gradient placeholder pattern
- `real_photo_likeness_score >= 0.75`
- channel-specific real object/context evidence
- human-reviewable contact sheet

## Channel Object Requirements

| Channel | Required context |
| --- | --- |
| `father_jobs` | car interior, cup holder or console, organizer or storage object, messy-to-clean context |
| `neoman_moleulgeol` | laundry, drying rack, indoor room or rainy window, clothes/towels/socks |
| `lets_buy` | desk, cables, cable organizer or cable clips, before/after cable clutter context |

## No-Fallback Rule

If a real image provider cannot produce photo-like assets, the pipeline must stop with:

```text
FINAL_STATUS=BLOCKED_REAL_IMAGE_PROVIDER_NOT_AVAILABLE
```

Do not generate placeholder images, do not render a placeholder video, and do not report review success.

Forbidden fallbacks:

- solid rectangle
- gradient panel
- color bar
- checkerboard
- mosaic noise
- CSS placeholder
- canvas placeholder
- sample fixture image

## Artifacts

When blocked, v040 writes only local planning artifacts:

- `commerce-assets/review/v040/real-image-provider-status.json`
- `commerce-assets/review/v040/scene-prompt-package.json`
- `commerce-assets/review/v040/manual-image-drop-guide.md`
- `commerce-assets/review/v040/expected-image-paths.json`
- `commerce-assets/review/v040/real-image-semantic-gate-summary.json`
- `commerce-assets/review/v040/three-channel-routing-summary.html`

Per-channel review consoles are created to show semantic blockers, but `local-review-video.mp4` must not be produced until semantic pass.

## Safety

This gate does not upload, call `videos.insert`, create/update/delete comments, change YouTube visibility, write R2, write `product_assets`, write DB, or print raw affiliate URLs/tokens/secrets.

## Command

```bash
npm run review:v040
```
