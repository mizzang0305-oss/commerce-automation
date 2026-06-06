# Selected Image Slideshow Package Plan

This document defines the plan-only step after the Image QA import bridge. It turns a `SelectedImageAssetPlan` into a 15-second slideshow package plan that an operator can review and copy.

## Principles

- Plan-only.
- Copy-only.
- Approval-gated.
- Generated on read.
- No local file read.
- No local file write.
- No FFmpeg execution.
- No MoviePy execution.
- No video generation.
- No upload.
- No DB write.
- No worker job.
- No queue creation.

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
    "ffmpeg_executed": false,
    "moviepy_executed": false,
    "upload_package_created": false,
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
POST /api/candidates/[id]/slideshow-package-plan
```

The request may include a `selected_image_asset_plan` from the Image QA import bridge. The route reads the candidate and returns a `SlideshowPackagePlan`. It does not persist the plan, inspect local paths, execute render commands, or upload anything.

## Readiness

`ready_for_slideshow_plan=true` requires the selected image asset plan to already be ready:

- `main_product` is passed or selected.
- `hook_thumbnail` is passed or selected.
- At least three assets are passed or selected.
- Missing or rejected assets are resolved manually.

If readiness is false, the response still returns a blocked plan with missing requirements and manual-review next steps.

## 15-Second Timeline

The default `shorts_9_16` plan maps selected images into a fixed 15-second sequence:

```text
0-2s    hook_thumbnail   hook
2-5s    benefit_scene    usage situation
5-8s    main_product     product focus
8-11s   comparison_card  conservative comparison
11-14s  benefit_scene    purchase reason
14-15s  main_product     CTA and disclosure reminder
```

The plan includes:

- image sequence references;
- overlay text;
- narration;
- subtitle lines;
- CTA;
- Coupang Partners disclosure reminder;
- BGM/SFX direction;
- manual render checklist.

## Command Previews

The FFmpeg and MoviePy outputs are preview strings only.

They must not be executed by the WebApp. Operators may copy the preview into a separately approved local rendering environment after manual review.

This PR does not add:

- `child_process`;
- `exec`, `spawn`, or `execa`;
- Python process execution;
- file existence checks;
- local file writes;
- video output creation.

## UI

`/image-prompts` includes a Selected Image Slideshow Package Plan section:

- preview slideshow package plan;
- copy slideshow package JSON;
- copy timeline markdown;
- copy FFmpeg command preview;
- copy MoviePy script preview;
- copy manual render checklist;
- download-labeled copy controls for JSON and markdown.

The controls are copy-only and do not create upload packages, R2 objects, worker jobs, queue rows, or platform posts.

## Deferred Work

Future work must stay separate and approval-gated:

- local slideshow generation;
- generated video QA/import bridge;
- R2 video upload;
- channel upload package creation from generated video;
- YouTube/TikTok/Threads upload.
