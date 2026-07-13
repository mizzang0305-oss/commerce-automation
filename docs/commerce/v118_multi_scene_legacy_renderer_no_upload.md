# V118 Multi-scene Legacy Renderer

## Decision

Keep the legacy Python Worker renderer and make its existing `render_plan` contract truthful. A plan with multiple distinct shot images must render those images as a timed sequence instead of silently repeating only the first image.

## Behavior

- The non-plan and single-image paths retain the existing `-vf` renderer.
- Render plans download each distinct image URL once.
- Repeated URLs reuse the downloaded local file.
- Two or more distinct images use an FFmpeg `filter_complex` concat sequence.
- Shot image count must match the shot duration count.
- Hook and later caption timings continue to follow the render-plan durations.
- Upload package metadata records only sanitized `image_sequence_used` and `unique_image_count` values.

## Safety

- Local renderer and test work only.
- No YouTube upload or comment mutation.
- No scheduler, n8n, DB, R2, or product-assets write.
- No production deployment.
- `SAFE_TO_UPLOAD=false`.
- `SAFE_TO_PUBLIC_UPLOAD=false`.

## Rollback

Revert the V118 Python Worker and test changes. The original single-image renderer remains a separate code path and requires no data rollback.
