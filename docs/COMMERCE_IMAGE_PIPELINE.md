# Commerce Image Pipeline

This document defines the commerce image planning path for the Coupang affiliate shorts MVP.

## Scope

The current implementation is plan-only and copy-only:

1. Product information
2. Image prompt planning
3. Image asset plan review
4. Image QA
5. Selected image based shorts rendering
6. Manual upload package
7. Performance data assetization

Only steps 1-3 are introduced by the image prompt planning layer. The follow-on image and video planning layer adds a deterministic 15-second `VideoPlan` preview, but still does not generate images, generate videos, create worker jobs, create queue rows, create render plans, upload files, call Google Drive, or call external image/video APIs.

The local image generation bridge adds a package/manifest layer for approved manual image work. It suggests filenames, local output folders, Google Drive sync folders, prompt markdown, and QA checklist text only. It does not write files, call Google Drive APIs, generate images, generate videos, upload files, write database rows, create queue rows, or create worker jobs.

## Image Asset Types

- `main_product`: clean commerce product image for blog, SNS card, and upload package contexts.
- `benefit_scene`: realistic usage scene with problem-solution framing.
- `hook_thumbnail`: 9:16 mobile thumbnail prompt with conservative hook guidance.
- `comparison_card`: before/after split card prompt without fake numerical claims.

Every image plan response includes:

```json
{
  "side_effects": {
    "image_generated": false,
    "video_generated": false,
    "uploaded": false,
    "worker_job_created": false,
    "queue_created": false
  }
}
```

## Safety Rules

Image prompts must not:

- Claim the operator personally used the product.
- Promise treatment, efficacy, safety, or guaranteed outcomes.
- Use absolute claims such as perfect, best, or guaranteed.
- Create fake brand logos.
- Change the product appearance or function beyond the source product.
- Recreate customer reviews as if they are real.
- Add exaggerated discount, price, or numerical claims.

High-risk categories are not blocked at the planning stage. They add `risk_flags` and stricter `safety_notes`.

## Local Skill Pack Direction

Future local-only skill pack structure:

```text
/commerce-image-system
  /skills
    /coupang-main-image
    /coupang-detail-image
    /shorts-thumbnail
    /blog-hero-image
    /comparison-card
  /input
    /products
    /references
  /output
    /generated
    /selected
    /video-packages
  /templates
    image-prompt-template.md
    shorts-script-template.md
    qa-checklist-template.md
  /scripts
    build-image-plan.py
    generate-local-prompt.py
    package-video-assets.py
```

Google Drive API, image APIs, image-to-video, SNS upload automation, and public upload remain separate approval-gated PRs.

See `docs/COMMERCE_IMAGE_VIDEO_PIPELINE.md` for the 15-second storyboard, shot list, narration, subtitle, CTA, and disclosure reminder planning layer.

See `docs/LOCAL_IMAGE_GENERATION_BRIDGE.md` for the copy-only local package, manifest, filename, sync-folder, manual step, and QA checklist conventions.
