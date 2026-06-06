# Generated Video QA Import Bridge

This document defines the plan-only bridge after a manually rendered video exists outside the WebApp. It helps an operator paste generated video manifest text, review QA status, and prepare manual upload package readiness notes.

## Principles

- Plan-only.
- Copy-only.
- Approval-gated.
- Generated on read.
- No local file read.
- No local file write.
- No video metadata probe.
- No FFmpeg execution.
- No MoviePy execution.
- No R2 upload.
- No DB write.
- No worker job.
- No queue creation.
- No upload package creation.

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
    "worker_job_created": false,
    "queue_created": false
  },
  "approval_required": true
}
```

## API

```text
POST /api/candidates/[id]/generated-video-qa-import-plan
```

The route reads the candidate, validates optional generated video manifest text, and returns a `GeneratedVideoQaImportPlan`. It does not persist the plan, inspect whether paths exist, read video metadata, run render tooling, upload objects, create upload packages, create queue rows, or create worker jobs.

## Generated Video Manifest

Example:

```json
{
  "candidate_id": "cand_001",
  "videos": [
    {
      "provided_filename": "cand_001_short_v001.mp4",
      "provided_path": "commerce-assets/output/video-packages/cand_001/cand_001_short_v001.mp4",
      "source": "local_path",
      "duration_sec": 15,
      "format": "shorts_9_16",
      "qa_status": "passed",
      "qa_notes": ["Reviewed in local video player"]
    }
  ]
}
```

Validation checks text shape only:

- `candidate_id` is required.
- `videos` must be an array.
- `provided_filename` is required.
- `provided_path` is required.
- `source` must be `local_path`, `google_drive_sync_path`, or `manual_manifest`.
- `duration_sec` may be a number or `null`.
- `format` must be `shorts_9_16` or `unknown`.
- `qa_status` must be `pending_review`, `passed`, `needs_fix`, `rejected`, or `selected_for_manual_upload`.
- `qa_notes` must be an array of text when present.

The bridge never checks whether `provided_path` exists. A `null` duration is allowed, but it keeps `ready_for_manual_upload_package=false` until an operator confirms the runtime manually.

## Readiness

`ready_for_manual_upload_package=true` requires:

- at least one video with `qa_status=passed` or `qa_status=selected_for_manual_upload`;
- every accepted video has `format=shorts_9_16`;
- every accepted video has `duration_sec` between 10 and 60 seconds.

Rejected and `needs_fix` videos are excluded from readiness. Pending videos remain visible for manual QA but do not unlock the next step.

This readiness flag only prepares a future manual upload package step. It does not create a channel upload package, upload to R2, change queue state, run Python Worker, or post to any platform.

## UI

`/image-prompts` includes a Generated Video QA Import Bridge section:

- generated video manifest textarea;
- preview button;
- copy video import manifest JSON;
- copy video QA markdown;
- copy video next-step JSON;
- download-labeled copy controls for plan JSON and QA markdown.

The controls do not browse local files, read files, write files, probe video metadata, run FFmpeg/MoviePy, upload files, save selected videos, write DB rows, call R2, create upload packages, create worker jobs, create queue rows, or post to any platform.

## Deferred Work

Future work must stay separate and approval-gated:

- local video generation execution;
- generated video metadata probing;
- R2 generated video upload;
- channel upload package creation from selected generated video;
- manual upload result tracking from generated video packages;
- YouTube/TikTok/Threads upload.
