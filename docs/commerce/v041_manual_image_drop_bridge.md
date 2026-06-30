# v041 Manual Image Drop Bridge

## Purpose

v040 correctly blocks fake image providers and placeholder/mosaic/checkerboard image success. v041 adds a manual image drop bridge so real image files supplied by the owner or an external image-generation workflow can be validated locally before any review video is built.

This is still a no-upload workflow.

## Manual Drop Folders

```text
commerce-assets/manual-drop/v041/father_jobs/
commerce-assets/manual-drop/v041/neoman_moleulgeol/
commerce-assets/manual-drop/v041/lets_buy/
```

Each folder must contain six expected image files plus:

```text
manual-image-semantic-evidence.json
```

The evidence file is required because dimensions alone cannot prove real-life photo semantics.

## Expected Images

### father_jobs

```text
01-car-messy-cup-holder.png
02-car-console-clutter.png
03-organizer-product-reveal.png
04-driver-organizing-items.png
05-clean-car-console-after.png
06-car-dashboard-cta.png
```

### neoman_moleulgeol

```text
01-rain-window-laundry-problem.png
02-wet-laundry-slow-dry.png
03-small-room-laundry-mess.png
04-drying-rack-solution-reveal.png
05-laundry-use-case-human-hands.png
06-organized-indoor-drying-result.png
```

### lets_buy

```text
01-messy-desk-cables.png
02-cable-clutter-closeup.png
03-cable-organizer-reveal.png
04-organized-desk-after.png
05-before-after-cable-setup.png
06-clean-desk-cta.png
```

## Image Requirements

- 9:16 vertical
- photorealistic
- clean commerce ad style
- no text inside image
- no watermark
- no logo
- no UI
- no scary mood
- no abstract overlay
- no mosaic/checkerboard/noise
- min width 720
- min height 1280
- file size greater than 50000 bytes

## Statuses

No images dropped:

```text
FINAL_STATUS=WAITING_FOR_MANUAL_IMAGE_DROP
V041_BRIDGE_READY=true
V041_REVIEW_PACKETS_READY=false
SAFE_TO_UPLOAD=false
```

Images dropped but quality or semantic evidence fails:

```text
FINAL_STATUS=BLOCKED_MANUAL_IMAGE_DROP_QUALITY_FAIL
```

Images and semantic evidence pass, and a media runner is configured:

```text
FINAL_STATUS=SUCCESS_V041_MANUAL_IMAGE_DROP_REVIEW_PACKETS_READY
SAFE_TO_UPLOAD=false
```

## Generated Planning Artifacts

```text
commerce-assets/review/v041/manual-image-drop-guide.md
commerce-assets/review/v041/manual-image-prompt-package.json
commerce-assets/review/v041/expected-image-paths.json
commerce-assets/review/v041/manual-drop-status.json
```

When validation and media build pass, per-channel review packets are generated under:

```text
commerce-assets/review/v041/<channel_key>/
```

## Safety

v041 does not call YouTube Execute, `videos.insert`, upload, create/update/delete comments, change visibility, upload to R2, write `product_assets`, write DB, deploy, or print raw affiliate URLs/tokens/secrets.

## Command

```bash
npm run review:v041
```
