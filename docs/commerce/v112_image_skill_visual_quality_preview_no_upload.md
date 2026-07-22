# V112 Image-Skill Visual Quality Preview (No Upload)

## Purpose

V112 corrects the existing `father_jobs` visual product mismatch while keeping the preview duration, affiliate/disclosure binding, channel routing, and upload status unchanged.

The authoritative Coupang product reference is:

```text
CURRENT_REAR_SEAT_MULTIFUNCTION_ORGANIZER
```

The product is the wide black multifunction organizer mounted behind the front seat. It includes two side cup holders, a center hidden mirror/slot, a silver-trim tissue opening, and lower hooks. The earlier front center-console divider organizer was a product mismatch and is explicitly outside this preview scope.

## Visual Changes

- Use six portrait image-skill scenes for the complete timeline.
- Generate six product-preserving scenes from the authoritative Coupang product reference.
- Start with a clean product hero instead of a low-quality clutter image.
- Reduce the hook overlay and limit it to the first scene.
- Reuse the original v057 audio only as a visual-preview timing reference.
- Require a separate product-copy/audio review before any replacement upload because the original audio was written for the mismatched front-console product.
- Use subtle zoom motion only.
- Keep all text outside generated images and apply Korean overlays during FFmpeg rendering.

## Outputs

Generated locally under:

```text
commerce-assets/review/v112/father_jobs/
```

- `preview-v112.mp4`
- `first-frame-v112.jpg`
- `hook-overlay-preview-v112.jpg`
- `contact-sheet-v112.jpg`
- `v112-preview-summary.json`
- `generated-scenes/*.png`

Generated media remains protected and must not be committed.

## Run

```powershell
npm run review:v112
```

## Safety

- No YouTube upload or visibility change.
- No `videos.insert` or comment mutation.
- No scheduler, n8n, R2, DB, Supabase, or product-assets write.
- No raw URL, full video/channel ID, token, secret, Auth, or HMAC output.
- `SAFE_TO_UPLOAD=false`.
- `SAFE_TO_PUBLIC_UPLOAD=false`.
- `BLOCKED_V112_AUDIO_COPY_REVIEW_REQUIRED` remains active for any replacement upload.

Owner review is required before any replacement private upload is considered.
