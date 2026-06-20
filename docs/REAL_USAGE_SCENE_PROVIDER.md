# Real Usage Scene Provider Contract

## Purpose

Final Coupang Shorts uploads must use credible real usage visuals. A scene that
only contains abstract cards, vector blocks, colored backgrounds, or unrealistic
hands is not enough for private upload readiness.

## Provider Grades

- `draft_card`: deterministic local cards for preview and tests only.
- `draft_composited`: local composited scenes for debug previews only.
- `realistic_generated`: generated kitchen scenes that pass realism checks.
- `photorealistic_generated`: preferred final provider mode for upload-ready
  usage scenes.

Only `realistic_generated` and `photorealistic_generated` can satisfy final
private-upload readiness. `local_composited_scene_image_provider` and local
card generators are blocked for final upload.

## Required Final Evidence

- `provider_mode=photorealistic_generated` or `provider_mode=realistic_generated`
- `image_generation_provider=codex_photorealistic_scene_image_provider` or a reviewed realistic provider
- `photorealistic_scene_provider_configured=true`
- `photorealistic_score >= 80`
- `photorealistic_scene_count >= 5`
- `vector_or_shape_scene_count = 0`
- `abstract_scene_count = 0`
- `unrealistic_hand_detected=false`
- `product_identity_consistency_score >= 70`
- `generated_scene_image_count >= 8`
- `real_usage_visual_present=true`
- `use_case_human_context_present=true`
- `use_case_kitchen_context_present=true`
- `utensil_interaction_present=true`
- `human_use_signal_scene_count >= 2`
- `shape_card_scene_detected=false`

## Blockers

- `LOCAL_COMPOSITED_PROVIDER_NOT_ENOUGH`
- `PHOTOREALISTIC_SCENE_PROVIDER_REQUIRED`
- `PHOTOREALISTIC_SCORE_TOO_LOW`
- `VECTOR_OR_SHAPE_SCENE_BLOCKED`
- `UNREALISTIC_HAND_SCENE_BLOCKED`
- `NON_PHOTOREALISTIC_USAGE_SCENE_BLOCKED`
- `PRODUCT_IDENTITY_INCONSISTENT`
- `USE_CASE_SCENE_HAS_NO_HUMAN_CONTEXT`
- `USE_CASE_SCENE_TOO_ABSTRACT`
- `REAL_USAGE_VISUAL_MISSING`
- `KITCHEN_CONTEXT_MISSING`
- `SHAPE_CARD_SCENE_BLOCKED`

## Human Review False Positive

The previous private video `G-r6rWsZwiU` failed human review even though the
machine result was reported as `SUCCESS_REAL_USAGE_SCENE_SHORTS_PRIVATE_UPLOAD`.
The failure mode was a local composited provider false positive: scenes looked
like abstract cards rather than photorealistic kitchen usage. That output must
not be used as a benchmark for future upload success.

## Safety

This contract does not enable public upload. YouTube upload remains private,
approval-gated, and limited to one `videos.insert` call per fresh approval.
Generated `commerce-assets/**` files are local artifacts and must not be
committed.
