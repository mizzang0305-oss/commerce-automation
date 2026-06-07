# Local Slideshow Render Bridge

This document defines the approval-gated, copy-only bridge between the selected-image slideshow package plan and any separately approved local render work.

## Principles

- Copy-only.
- Approval-gated.
- Generated on read.
- No local file read.
- No local file write.
- No FFmpeg execution.
- No MoviePy execution.
- No video generation.
- No R2 upload.
- No DB write.
- No worker job.
- No queue creation.
- No upload package creation.
- No production deploy.

Every response keeps:

```json
{
  "execution_enabled": false,
  "side_effects": {
    "external_api_called": false,
    "deployment_triggered": false,
    "image_generated": false,
    "video_generated": false,
    "uploaded": false,
    "db_written": false,
    "local_file_read": false,
    "local_file_written": false,
    "ffmpeg_executed": false,
    "moviepy_executed": false,
    "upload_package_created": false,
    "worker_job_created": false,
    "queue_created": false
  },
  "approval_required": true
}
```

## Confirmation Gate

The bridge requires this exact phrase before returning the local render package preview:

```text
PREPARE_LOCAL_SLIDESHOW_RENDER_PACKAGE
```

The confirmation only unlocks text packaging. It does not enable command execution and does not create files.

## API

```text
POST /api/candidates/[id]/local-slideshow-render-package
```

Body:

```json
{
  "confirmation": "PREPARE_LOCAL_SLIDESHOW_RENDER_PACKAGE",
  "slideshow_package_plan": {}
}
```

The route reads the candidate, validates the provided slideshow package plan shape, checks the exact confirmation phrase, and returns a `LocalSlideshowRenderPackage`.

It does not persist the package, inspect whether paths exist, read image files, run render tooling, create video files, upload objects, create upload packages, create queue rows, or create worker jobs.

## Returned Package

The package includes:

- candidate id;
- copied slideshow package plan;
- local FFmpeg command preview text;
- local MoviePy script preview text;
- copy-only PowerShell step text;
- input asset checklist text;
- output path suggestions;
- manual execution checklist text;
- explicit false side effects.

The FFmpeg and MoviePy fields are previews only. Operators must treat them as text until a separate execution approval exists outside this PR.

## UI

`/image-prompts` includes a Local Slideshow Render Package section:

- confirmation phrase input;
- preview button;
- copy PowerShell steps;
- copy local FFmpeg command preview;
- copy local MoviePy script preview;
- download-labeled copy control for package JSON;
- visible false side-effect badges.

The controls do not browse local files, read files, write files, run render tooling, upload files, save selected videos, write DB rows, call R2, create upload packages, create worker jobs, create queue rows, or post to any platform.

## Deferred Work

Future work must stay separate and approval-gated:

- actual local render execution;
- local video file creation;
- generated video metadata probing;
- R2 generated video upload;
- channel upload package creation from selected generated video;
- manual upload result tracking from generated video packages;
- YouTube/TikTok/Threads upload.
