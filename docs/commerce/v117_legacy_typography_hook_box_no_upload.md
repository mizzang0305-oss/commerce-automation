# V117 Legacy Typography and Hook Box Preview

## Decision

Keep the existing renderer as the production default. Do not connect the video-use shadow renderer to the Worker from this change.

The owner review found no material visual benefit that justifies a renderer migration. The useful visual elements are retained as a small typography-only improvement:

- Malgun Gothic Bold for the first hook;
- a two-line maximum for the hook;
- the existing black 78% upper-safe-area box;
- the existing yellow top and bottom accent rails;
- the existing compact lower-safe-area captions for later scenes.

## Runtime Behavior

The first timed cue is treated as the hook. It uses the existing commerce style and remains visible only for that cue's duration. Later cues continue to use the existing lower caption box.

The render package records only sanitized style identifiers:

```text
render_layout_version=v4-legacy-commerce-typography
typography_style=legacy_commerce_hook_box_v1
hook_box_style=bold_upper_high_contrast
```

## Safety

- No YouTube upload or comment mutation.
- No scheduler or n8n execution.
- No DB, R2, or product asset write.
- No production deployment.
- No raw URL, token, secret, Authorization header, or HMAC output.
- `SAFE_TO_UPLOAD=false`.
- `SAFE_TO_PUBLIC_UPLOAD=false`.

## Rollback

Revert the focused Python Worker change. The video-use Draft PR remains separate and is not required by this typography preset.
