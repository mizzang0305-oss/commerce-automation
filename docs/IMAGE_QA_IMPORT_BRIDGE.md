# Image QA Import Bridge

This document defines the plan-only bridge after the local image generation package. It helps an operator paste manually generated image filenames or path text into an import manifest, review QA status, and prepare selected image asset JSON for a later slideshow package plan.

## Principles

- Plan-only.
- Copy-only.
- Approval-gated.
- Generated on read.
- No local file read.
- No local file write.
- No upload.
- No DB write.
- No Google Drive API or OAuth call.

Every response keeps:

```json
{
  "side_effects": {
    "external_api_called": false,
    "scraped_live_web": false,
    "image_generated": false,
    "video_generated": false,
    "uploaded": false,
    "db_written": false,
    "file_uploaded": false,
    "local_file_read": false,
    "local_file_written": false,
    "google_drive_api_called": false,
    "r2_uploaded": false,
    "payment_triggered": false,
    "message_sent": false,
    "deployment_triggered": false,
    "worker_job_created": false,
    "queue_created": false
  },
  "approval_required": true
}
```

## API

```text
POST /api/candidates/[id]/image-qa-import-plan
```

The route reads the candidate, builds the existing local image generation package in memory, validates optional manifest text, and returns an `ImageQaImportPlan`. It does not persist the plan and does not inspect whether any path exists on disk or in Google Drive.

## Import Manifest

Example:

```json
{
  "candidate_id": "cand_001",
  "assets": [
    {
      "asset_type": "main_product",
      "provided_filename": "cand_001_main_product_v001.png",
      "provided_path": "commerce-assets/output/generated/cand_001/cand_001_main_product_v001.png",
      "qa_status": "passed"
    }
  ]
}
```

Validation checks text shape only:

- `candidate_id` is required.
- `assets` must be an array.
- `asset_type` must be one of `main_product`, `benefit_scene`, `hook_thumbnail`, or `comparison_card`.
- `provided_filename` is required.
- `provided_path` is required.
- `qa_status` must be one of `pending_review`, `passed`, `needs_fix`, `rejected`, or `selected`.
- Missing required asset types are reported as warnings.
- Duplicate asset types are allowed but reported as warnings for manual review.

## QA Statuses

- `pending_review`: pasted or expected asset still needs visual review.
- `passed`: operator reviewed the image and approved it for planning.
- `needs_fix`: image can be revised but should not be selected.
- `rejected`: image must not be used.
- `selected`: operator chose the asset for future slideshow planning.

## Selected Image Asset Plan

The bridge returns `selected_image_asset_plan` with selected/passed assets, missing required asset types, and the next step.

`ready_for_slideshow_plan=true` requires:

- `main_product` is `passed` or `selected`.
- `hook_thumbnail` is `passed` or `selected`.
- At least three assets are `passed` or `selected`.
- No selected asset is simultaneously treated as rejected.

This readiness flag only prepares the next plan-only step. It does not create a slideshow package, render plan, worker job, upload package, R2 object, or queue row.

## UI

`/image-prompts` includes an Image QA Import Bridge section:

- import manifest textarea;
- preview button;
- copy import manifest JSON;
- copy selected image asset JSON;
- copy QA markdown;
- copy next-step JSON;
- copy-only download-labeled controls for plan JSON and QA markdown.

The controls do not browse local files, read files, upload files, save selected assets, write DB rows, call Google Drive, call R2, run FFmpeg/MoviePy, or post to any platform.

## Next Steps

Future PRs must stay separate and approval-gated:

- selected image to FFmpeg/MoviePy slideshow package plan;
- approval-gated local slideshow generation;
- generated image file import/upload;
- R2 image asset upload;
- any image-to-video or platform upload work.
