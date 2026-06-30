# v039 Asset-to-Frame Proof Gate

v039 records v038 as a local human-review failure and adds an asset-to-frame proof gate before any future upload request can be considered.

## v038 Failure Record

v038 is `FAIL_LOCAL_HUMAN_REVIEW`.

Merge is blocked for PR #157.

Failure reasons:

- `BLANK_SOLID_PLACEHOLDER_FRAME`
- `SCENE_ASSET_NOT_VISIBLE_IN_VIDEO`
- `RENDERED_FRAME_DOES_NOT_CONTAIN_IMAGE_PIXELS`
- `ASSET_TO_FRAME_PROOF_MISSING`
- `TEST_PATTERN_GATE_FALSE_NEGATIVE`
- `REVIEW_CONSOLE_SHOWS_SOLID_RECTANGLES`
- `PR157_MERGE_BLOCKED`

## Proof Requirements

The v039 proof gate checks:

- scene asset files exist
- scene assets decode successfully
- scene asset dimensions are at least 720x1280
- scene asset file size is greater than 50000 bytes
- rendered local review video exists
- rendered video duration is at least 18 seconds
- frames are extracted from the rendered mp4
- average frame visual entropy is above the threshold
- solid, blank, dark-placeholder, and rectangle-placeholder frame ratios stay under thresholds
- each scene asset has at least one matching extracted video frame
- contact sheets are not blank or solid-rectangle placeholders

## Local Artifacts

Generated under `commerce-assets/review/v039/`:

- `asset-to-frame-proof-summary.json`
- `three-channel-routing-summary.html`
- per-channel `review-console.html`
- per-channel `local-review-video.mp4`
- per-channel `generated-scenes/`
- per-channel `extracted-frames/`
- per-channel `asset-to-frame-proof-report.json`
- per-channel `actual-frame-contact-sheet.jpg`
- per-channel `shorts-ui-overlay-contact-sheet.jpg`
- per-channel `human-review-decision.json`

## Safety

This is local owner-review work only.

- `safe_to_upload=false`
- YouTube Execute is blocked
- `videos.insert` is blocked
- public/private/unlisted upload is blocked
- comments are not created, updated, or deleted
- visibility is not changed
- R2, `product_assets`, DB, and production deploy writes are blocked
- `commerce-assets` artifacts remain uncommitted
