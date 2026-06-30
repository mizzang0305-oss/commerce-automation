# v038 Real Three-Channel Image-Skill Review

v038 replaces the failed v037 placeholder review videos with local review packets that require generated scene assets to be used in each rendered video.

## v037 Failure Record

v037 is marked as `FAIL_LOCAL_HUMAN_REVIEW`.

Blocked reasons:

- `RGB_TEST_PATTERN_RENDERER_REGRESSION`
- `COLOR_BAR_PLACEHOLDER_VIDEO`
- `IMAGE_SKILL_ASSETS_NOT_USED_IN_RENDER`
- `THREE_CHANNEL_REVIEW_PACKET_FALSE_SUCCESS`
- `REVIEW_CONSOLE_SHOWS_PLACEHOLDER_VIDEO`
- `ALL_CHANNELS_RENDERED_TEST_PATTERN`
- `VISUAL_ARTIFACT_GATE_MISSING`

PR #156 must not be merged.

## v038 Scope

Channels:

- `father_jobs`
- `neoman_moleulgeol`
- `lets_buy`

Each channel packet includes:

- `local-review-video.mp4`
- `generated-scenes/`
- `actual-frame-contact-sheet.jpg`
- `shorts-ui-overlay-contact-sheet.jpg`
- `scene-manifest.json`
- `hook-script-preview.json`
- `comment-preview.json`
- `youtube-metadata-preview.html`
- `human-review-decision.json`
- `review-console.html`

## Visual Gate

The v038 gate fails if any of these are detected:

- RGB color bar palette
- placeholder video or fixture renderer
- rendered frame not using the generated scene asset
- actual frame contact sheet showing a test pattern

Required pass flags:

- `color_bar_pattern_detected=false`
- `rgb_test_pattern_detected=false`
- `placeholder_video_detected=false`
- `rendered_frame_uses_scene_asset=true`
- `scene_asset_pixels_present_in_video=true`
- `actual_frame_contact_sheet_not_color_bars=true`

## Safety

v038 is review-only.

- YouTube Execute is blocked.
- `videos.insert` is blocked.
- Public, private, and unlisted uploads are blocked.
- Comment create/update/delete is blocked.
- Visibility changes are blocked.
- R2 upload is blocked.
- `product_assets` and DB writes are blocked.
- `safe_to_upload=false`.

Only a later v039 task with a fresh owner approval phrase may separate an approved channel into a one-shot upload target.
