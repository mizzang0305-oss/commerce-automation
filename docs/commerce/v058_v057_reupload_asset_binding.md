# v058 V057 Reupload Asset Binding

v058 fixes the corrected reupload blocker:

`BLOCKED_V057_ASSETS_NOT_BOUND_TO_REUPLOAD_EXECUTOR`

The v051 mutation executor can now select the v057 corrected reupload asset profile:

```powershell
$env:V051_EXECUTION_MODE="mutation_enabled"
$env:V051_UPLOAD_ASSET_PROFILE="v057_corrected_reupload"
npm run upload:v051:execute
```

This document is code/test/docs readiness only. It does not approve or perform an upload.

## Asset Profile

`V051_UPLOAD_ASSET_PROFILE=v057_corrected_reupload` binds exactly these files:

| Channel | Required MP4 |
| --- | --- |
| `father_jobs` | `commerce-assets/review/v057/father_jobs/corrected-preview-v057.mp4` |
| `neoman_moleulgeol` | `commerce-assets/review/v057/neoman_moleulgeol/corrected-preview-v057.mp4` |
| `lets_buy` | `commerce-assets/review/v057/lets_buy/corrected-preview-v057.mp4` |

The profile also requires each channel's `first-frame-v057.jpg`.

## Hard Blocks

The v057 reupload binding reports a blocker before any upload adapter call when:

- `BLOCKED_REUPLOAD_ASSET_PROFILE_NOT_SELECTED`
- `BLOCKED_V057_ASSET_MISSING`
- `BLOCKED_V057_ASSET_PATH_MISMATCH`
- `BLOCKED_V057_FIRST_FRAME_MISSING`
- `BLOCKED_V048_ASSET_FALLBACK_ATTEMPTED`

The corrected reupload profile must not fall back to:

`commerce-assets/review/v048/<channel>/local-review-video.mp4`

## Safety

v058 does not:

- upload to YouTube
- call `videos.insert`
- create, update, or delete comments
- change visibility
- mutate existing videos
- write R2, `product_assets`, or DB records
- commit generated media under `commerce-assets`
- print raw affiliate URLs, tokens, or secrets

## Validation

Primary focused validation:

```powershell
npm run test -- tests/v058-v057-reupload-asset-binding.test.ts
```

The real corrected public reupload still requires a fresh owner approval after this PR is merged.
