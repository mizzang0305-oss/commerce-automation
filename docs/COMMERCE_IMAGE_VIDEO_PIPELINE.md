# Commerce Image And Video Planning Pipeline

This document defines the next planning layer for the Coupang affiliate shorts MVP.

## Principles

The current layer is plan-only, copy-only, and approval-gated. It creates planning text and JSON that an operator can review or copy. It does not generate images, render videos, upload files, write database records, call external APIs, scrape the live web, deploy production, or trigger payments/messages.

Every combined plan response must keep:

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
    "queue_created": false
  },
  "approval_required": true
}
```

## Current Flow

1. Product information.
2. Product information cleanup.
3. Image prompt planning.
4. Image asset plan review.
5. 15-second shorts `VideoPlan`.
6. Shot list, narration, subtitle lines, CTA, and affiliate disclosure reminder.
7. Copy-only operator review.

## Image Asset Types

- `main_product`: centered product-focused asset.
- `benefit_scene`: realistic usage scene and problem-solution context.
- `hook_thumbnail`: vertical 9:16 mobile hook image plan.
- `comparison_card`: before/after or old-way/new-way comparison card without fake numerical claims.

## VideoPlan Structure

The VideoPlan is deterministic and template-based:

- `duration_sec`: fixed at `15`.
- `format`: fixed at `shorts_9_16`.
- `shot_list`: 4-6 shots covering exactly 0-15 seconds.
- `required_image_assets`: references the four image asset types.
- `narration_script`: copy-only narration text.
- `subtitle_lines`: time-bounded subtitle text.
- `cta`: manual CTA text that points operators back to product detail verification.
- `affiliate_disclosure_reminder`: required Coupang Partners disclosure reminder.

Default structure:

```text
0-2s    hook_thumbnail   hook
2-5s    benefit_scene    usage situation
5-8s    main_product     product focus
8-11s   comparison_card  conservative comparison
11-14s  benefit_scene    purchase reason
14-15s  main_product     CTA and disclosure reminder
```

## Safety

The plan must not:

- Pretend the operator personally used the product.
- Promise treatment, efficacy, guaranteed safety, or guaranteed results.
- Claim best price, perfect results, or absolute superiority.
- Recreate customer reviews as if they are real.
- Fabricate discounts, numbers, shipping promises, or brand logos.
- Change the product appearance or function beyond source product information.

## Local And Sync Folder Direction

Local folder structure for future approval-gated asset work:

```text
/commerce-assets
  /input
    /products
    /references
  /output
    /generated
    /selected
    /video-packages
```

Optional Google Drive sync-folder structure for operators:

```text
G:/My Drive/commerce-assets/products/
G:/My Drive/commerce-assets/references/
G:/My Drive/commerce-assets/generated/
G:/My Drive/commerce-assets/video-packages/
```

This is a folder convention only. Google Drive API and OAuth are not implemented.

`GET /api/candidates/[id]/local-image-package` turns the image prompt plan and video plan into a copy-only local image generation package. It includes suggested filenames, manifest JSON, prompt markdown, manual steps, and QA checklist text for operator review. It remains generated-on-read and keeps `local_file_written=false` and `google_drive_api_called=false`.

`POST /api/candidates/[id]/image-qa-import-plan` turns manually pasted filename/path manifest text into an `ImageQaImportPlan`. It reports per-asset QA status, missing required asset types, selected image asset JSON, and `ready_for_slideshow_plan`. It validates text shape only and keeps `local_file_read=false`, `local_file_written=false`, `db_written=false`, `google_drive_api_called=false`, `r2_uploaded=false`, `worker_job_created=false`, and `queue_created=false`.

`POST /api/candidates/[id]/slideshow-package-plan` turns selected image asset JSON into a copy-only `SlideshowPackagePlan`. It maps selected images into a 15-second `shorts_9_16` timeline, image sequence, overlay text, narration, subtitle lines, CTA, disclosure reminder, BGM/SFX direction, FFmpeg command preview, MoviePy script preview, and manual render checklist. The command outputs are preview text only and keep `ffmpeg_executed=false`, `moviepy_executed=false`, `video_generated=false`, `local_file_read=false`, `local_file_written=false`, `db_written=false`, `r2_uploaded=false`, `upload_package_created=false`, `worker_job_created=false`, and `queue_created=false`.

`POST /api/candidates/[id]/local-slideshow-render-package` turns a slideshow package plan into an approval-gated `LocalSlideshowRenderPackage`. It requires the exact confirmation phrase `PREPARE_LOCAL_SLIDESHOW_RENDER_PACKAGE` and returns copy-only PowerShell steps, local FFmpeg/MoviePy preview text, input checklist text, and output path suggestions. Confirmation prepares text only; it keeps `execution_enabled=false`, `ffmpeg_executed=false`, `moviepy_executed=false`, `local_file_read=false`, `local_file_written=false`, `video_generated=false`, `upload_package_created=false`, `uploaded=false`, `db_written=false`, `worker_job_created=false`, and `queue_created=false`.

`POST /api/candidates/[id]/execute-local-slideshow-render` is the separate approval-gated local execution step. It requires the exact confirmation phrase `APPROVE_LOCAL_SLIDESHOW_RENDER_EXECUTION`, validates allowlisted local image paths, runs local FFmpeg or MoviePy fallback, and writes a local MP4 plus manifest/report under `commerce-assets/output/video-packages/{candidate_id}/`. This is the only layer here allowed to set `local_file_read=true`, `local_file_written=true`, and `video_generated=true`. It must still keep `external_api_called=false`, `db_written=false`, `uploaded=false`, `r2_uploaded=false`, `upload_package_created=false`, `worker_job_created=false`, and `queue_created=false`.

`POST /api/candidates/[id]/generated-video-qa-import-plan` turns manually pasted generated video manifest text into a `GeneratedVideoQaImportPlan`. It reports video QA status, safety flags, manual checklist items, QA markdown, and `ready_for_manual_upload_package`. It validates text shape only and keeps `local_file_read=false`, `local_file_written=false`, `db_written=false`, `r2_uploaded=false`, `ffmpeg_executed=false`, `moviepy_executed=false`, `video_generated=false`, `upload_package_created=false`, `worker_job_created=false`, and `queue_created=false`.

## KPI Direction

Future KPI candidates:

- Product information to image-plan creation rate.
- Image plan to QA pass rate.
- QA-passed image to video package creation rate.
- Shorts production time.
- Cost per video.
- CTR.
- Coupang click rate.
- Coupang conversion rate.
- Product category performance.
- Image style performance.
- Hook text performance.

This PR does not collect KPI data or write KPI records.

## External References

- ViMax: reference only for planning structure. No dependency or API call.
- Context.dev-style intelligence loops: reference only. No live scraping.
- Nano Banana or Gemini prompt libraries: prompt reference only. No image API call.

## Explicitly Deferred

- Image generation API.
- Image-to-video API.
- Image/video model API execution.
- R2 upload of generated local videos.
- Generated video QA file import or metadata probing.
- Worker job creation.
- Queue creation.
- Upload package creation.
- Google Drive API/OAuth.
- Image QA file import or upload.
- YouTube/TikTok/Threads upload.
- Public upload enablement.
- Production deploy or production smoke.
