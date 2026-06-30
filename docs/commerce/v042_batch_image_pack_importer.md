# v042 Batch Image Pack Importer

v042 keeps the v041 manual image drop safety model, but removes the need to place 18 files one by one.

## Goal

Import one owner-supplied image pack into the deterministic v041 manual-drop paths, validate every image locally, and stop before any upload or external mutation.

## Input Modes

Place one of these under `commerce-assets/manual-drop/v042-inbox/`:

- ZIP: `v041-image-pack.zip`
- Raw folder: `raw/*.png`, `raw/*.jpg`, `raw/*.jpeg`, or `raw/*.webp`
- Optional manifest: `image-pack-manifest.json`

If `image-pack-manifest.json` exists, it has priority over filename keyword mapping and order fallback.

```json
{
  "version": "v041",
  "items": [
    {
      "source_file": "car_messy_01.png",
      "channel_key": "father_jobs",
      "scene_key": "01-car-messy-cup-holder"
    }
  ]
}
```

## Mapping Priority

1. Manifest mapping.
2. Filename keyword mapping.
3. Natural-sort order mapping.

Order fallback is intentionally marked as `ORDER_BASED_REQUIRES_OWNER_REVIEW`.

## Output Paths

The importer copies the mapped files into:

- `commerce-assets/manual-drop/v041/father_jobs/`
- `commerce-assets/manual-drop/v041/neoman_moleulgeol/`
- `commerce-assets/manual-drop/v041/lets_buy/`

It writes local preview artifacts under:

- `commerce-assets/review/v042/image-pack-import-report.json`
- `commerce-assets/review/v042/image-pack-mapping-preview.html`
- `commerce-assets/review/v042/imported-image-contact-sheet.jpg`
- `commerce-assets/review/v042/image-pack-quality-report.json`

These artifacts are local-only and must not be committed.

## Validation

The importer blocks unless all conditions are true:

- `required_image_count=18`
- `imported_image_count=18`
- `all_required_images_present=true`
- `all_images_decode_success=true`
- `all_images_portrait=true`
- `all_images_min_width=true`
- `all_images_min_height=true`
- `all_images_file_size_gt_50000=true`
- `mosaic_pattern_detected=false`
- `checkerboard_pattern_detected=false`
- `noise_texture_detected=false`
- `placeholder_detected=false`

## Commands

```powershell
cd "C:\Users\LOVE\MyProjects\commerce-automation"
npm run review:v041:from-pack
```

## Safety

v042 does not call YouTube Execute, `videos.insert`, upload, create/update/delete comments, change visibility, upload to R2, write `product_assets`, write DB, deploy, or print raw affiliate URLs/tokens/secrets.
