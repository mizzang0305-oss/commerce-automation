# Local Image Generation Bridge

This document defines the approval-gated bridge between commerce image prompt plans and future manually generated image assets.

## Scope

The bridge creates a copy-only local image generation package for a product candidate. It does not generate images, write files, call external APIs, call Google Drive, create database rows, create queue rows, create worker jobs, create upload packages, or upload anything.

The package exists to help an operator copy:

- candidate metadata;
- four image asset prompt plans;
- suggested filenames;
- local output folder suggestions;
- Google Drive sync-folder suggestions;
- manifest JSON;
- prompt markdown;
- manual generation steps;
- QA checklist;
- future import instructions.

## API

```text
GET /api/candidates/[id]/local-image-package
```

The route reads a product candidate and builds the package in memory. It is generated-on-read and does not cache or persist the result.

Missing candidates return a safe `404 CANDIDATE_NOT_FOUND` response.

## Asset Types

- `main_product`
- `benefit_scene`
- `hook_thumbnail`
- `comparison_card`

Suggested filenames use this pattern:

```text
{candidate_id}_{asset_type}_v001.png
```

Example:

```text
candidate-local-image-001_main_product_v001.png
```

## Path Suggestions

Local path suggestion:

```text
commerce-assets/output/generated/{candidate_id}/
```

Google Drive sync-folder suggestion:

```text
G:/My Drive/commerce-assets/generated/{candidate_id}/
```

This is a folder convention only. Google Drive API, OAuth, upload, and file sync execution are not implemented in the WebApp.

## Side Effects

Every package response must keep:

```json
{
  "side_effects": {
    "scraped_live_web": false,
    "external_api_called": false,
    "image_generated": false,
    "video_generated": false,
    "uploaded": false,
    "db_written": false,
    "file_uploaded": false,
    "payment_triggered": false,
    "message_sent": false,
    "deployment_triggered": false,
    "worker_job_created": false,
    "queue_created": false,
    "local_file_written": false,
    "google_drive_api_called": false
  },
  "approval_required": true
}
```

## Manual Steps

1. Copy one prompt from `/image-prompts`.
2. Use an approved local image generation tool outside this app.
3. Save the manually generated image with the suggested filename.
4. Store it in the suggested local folder or a user-managed sync folder.
5. Run manual QA against the checklist.
6. Wait for a separate image QA/import PR before bringing generated files into `commerce-automation`.

That follow-on bridge is documented in [IMAGE_QA_IMPORT_BRIDGE.md](IMAGE_QA_IMPORT_BRIDGE.md). It accepts manifest text and creates a QA/import plan only; it still does not read files, write files, write DB rows, call Google Drive, upload to R2, create worker jobs, or create queue rows.

## QA Checklist

- Product identity and category remain consistent.
- No fake review, guaranteed effect, best-price, or fabricated discount claim.
- No fake logo, unauthorized brand mark, or unrelated object.
- Image is readable on mobile and leaves room for Korean overlay text when needed.
- Generated files are not imported until a separate image QA/import workflow is approved.

## Explicitly Deferred

- Image generation API.
- OpenAI/Gemini/Nano Banana/image model key handling.
- Google Drive API or OAuth.
- DB persistence for generated images.
- Image artifact import.
- Image-to-video generation.
- FFmpeg/MoviePy execution from this bridge.
- Worker job creation.
- Queue creation.
- Upload package creation.
- YouTube/TikTok/Threads upload.
- Public upload.
- Production deploy or smoke.
