# Local Slideshow Render Execution

This document defines the first approved local-only execution step after the copy-only slideshow render package.

## Approval Gate

The execution API requires this exact phrase:

```text
APPROVE_LOCAL_SLIDESHOW_RENDER_EXECUTION
```

Without that phrase the route returns a safe validation error and does not read files, write files, run FFmpeg, run MoviePy, upload artifacts, write database rows, create queue rows, or create worker jobs.

## API

```text
POST /api/candidates/[id]/execute-local-slideshow-render
```

Request:

```json
{
  "confirmation": "APPROVE_LOCAL_SLIDESHOW_RENDER_EXECUTION",
  "render_package": {},
  "engine_preference": "auto"
}
```

`engine_preference` can be `auto`, `ffmpeg`, or `moviepy`.

## Local-Only Side Effects

The only side effects allowed in this step are local operator-machine side effects:

```json
{
  "local_file_read": true,
  "local_file_written": true,
  "video_generated": true,
  "ffmpeg_executed": true,
  "moviepy_executed": false
}
```

The route must continue to report these flags as false:

```json
{
  "external_api_called": false,
  "db_written": false,
  "file_uploaded": false,
  "uploaded": false,
  "r2_uploaded": false,
  "upload_package_created": false,
  "worker_job_created": false,
  "queue_created": false,
  "deployment_triggered": false,
  "payment_triggered": false,
  "message_sent": false
}
```

## Path Rules

Input image paths must be inside one of these allowlisted folders:

```text
commerce-assets/output/generated/{candidate_id}/
commerce-assets/output/selected/{candidate_id}/
G:/My Drive/commerce-assets/generated/{candidate_id}/
G:/My Drive/commerce-assets/selected/{candidate_id}/
tests/fixtures/local-slideshow-render/
```

Output files are written locally under:

```text
commerce-assets/output/video-packages/{candidate_id}/
```

Expected outputs:

```text
{candidate_id}_shorts_v001.mp4
{candidate_id}_shorts_v001.manifest.json
{candidate_id}_shorts_v001.render-report.json
```

Generated outputs must not be committed.

## Engine Order

`auto` tries FFmpeg first and then MoviePy fallback. If neither engine can produce a non-empty MP4, the route must return a blocked result. Fake success is not allowed.

FFmpeg execution uses `execFile` with bounded arguments and no shell interpolation. MoviePy fallback uses the local `python-worker/.venv/Scripts/python.exe` interpreter only when selected or needed.

## UI

`/image-prompts` includes a Local Slideshow Render Execution section:

- exact approval phrase input;
- render engine preference selector;
- execution button;
- output path preview;
- log preview;
- copy render report JSON;
- copy output manifest input JSON.

The section is local-only. It does not expose R2 upload, DB import, queue creation, worker job creation, production deploy, or platform posting controls.

## Smoke Procedure

Use fixture or operator-approved local images only.

1. Prepare at least three local images under an allowlisted input folder.
2. Build or copy a `LocalSlideshowRenderPackage`.
3. Call `POST /api/candidates/[id]/execute-local-slideshow-render` with the exact confirmation phrase.
4. Confirm the result reports:
   - `execution_succeeded=true`
   - `video_generated=true`
   - `local_file_read=true`
   - `local_file_written=true`
   - one of `ffmpeg_executed=true` or `moviepy_executed=true`
   - `uploaded=false`
   - `db_written=false`
   - `queue_created=false`
   - `worker_job_created=false`
5. Confirm the MP4, manifest, and render report exist locally.
6. Delete smoke outputs or leave them untracked. Do not commit generated media.

## Deferred Work

- Generated video QA/import from the local MP4.
- R2 upload of selected generated video.
- Manual channel upload package creation from selected generated video.
- Manual upload result tracking.
- YouTube/TikTok/Threads upload.
