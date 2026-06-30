# v045 Restore V035 Renderer For Three Channels

v045 restores the proven v035 image-skill-driven Shorts review packet path for the three-channel workflow.

The intent is not to build a new renderer. The v045 wrapper prepares channel-specific runtime inputs, calls the exported v035 review packet generator, then copies the v035 artifacts into channel-specific v045 review folders.

## Source Of Truth

- `scripts/uploads/generate-v035-image-skill-scene-shorts-review-packet.ts`
- `generateV035ImageSkillSceneShortsReviewPacket`
- `V035_SCENE_ASSETS`
- v035 metadata hardening and review console builder

## Output Folders

```text
commerce-assets/review/v045/father_jobs/
commerce-assets/review/v045/neoman_moleulgeol/
commerce-assets/review/v045/lets_buy/
```

Each ready channel folder contains:

- `local-review-video.mp4`
- `review-console.html`
- `scene-manifest.json`
- `generated-scenes/`
- `generated-image-contact-sheet.jpg`
- `actual-frame-contact-sheet.jpg`
- `shorts-ui-overlay-contact-sheet.jpg`
- `asset-to-frame-proof-report.json`
- `real-image-semantic-report.json`
- `hook-script-preview.json`
- `comment-preview.json`
- `youtube-metadata-preview.html`
- `human-review-decision.json`
- `review-summary.json`

## Blocked State

The wrapper stops with `BLOCKED_V035_IMAGE_GENERATION_NOT_REPRODUCIBLE` if channel-specific v035-style scene assets are missing. It does not fall back to v037/v038/v039, v040 provider-missing success, or v041/v042 manual-drop primary mode.

## Safety

v045 reports all live side effects as false:

- `youtube_execute_called=false`
- `videos_insert_called=false`
- `new_upload_attempted=false`
- `comment_create_update_delete_called=false`
- `visibility_changed=false`
- `R2_upload=false`
- `product_assets_write=false`
- `DB_write=false`
- `SAFE_TO_UPLOAD=false`

Generated local review artifacts under `commerce-assets/**` must not be committed.
