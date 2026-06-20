# Shorts Rendering Human Review False Positive

## Current Correction

The machine result for the prior auto scene-image Shorts run is no longer
accepted as final content-quality success.

- previous_video_id: `mLytN-u2C5M`
- latest_failed_video_id: `hRq1iap1C14`
- machine_result: `SUCCESS_AUTO_SCENE_IMAGE_SHORTS_PRIVATE_UPLOAD`
- human_review_result: `FAIL`
- failure_type:
  - `local_scene_card_generator_false_positive`
  - `product_image_repeated`
  - `background_color_only_changed`
  - `no_real_generated_scene_images`
  - `no_kitchen_context_scene`
  - `no_real_use_case_visual`
  - `true_scene_probe_false_positive`
  - `shape_card_scene_false_positive`
  - `no_human_hand_or_usage_action`

The local deterministic scene-card generator is a fallback visual-card renderer,
not a real scene-image generation provider. It may be used for previews, debug
artifacts, and tests, but it must not satisfy final private-upload readiness by
itself.

The local composited scene-image provider is also not enough by itself when its
output is still abstract cards, color blocks, or layout boxes. A use-case scene
must show kitchen context plus a human-use signal such as a hand picking up a
ladle/spatula/whisk, a utensil being used while cooking, a countertop use setup,
or a clear before/after organization comparison.

## Correct Gate

Final Shorts readiness requires real scene-image provider evidence:

- `real_scene_image_provider_configured=true`
- `generated_scene_image_count >= 8`
- `unique_scene_image_hash_count >= 8`
- `generated_scene_images_are_not_color_cards=true`
- `generated_scene_images_are_visually_distinct=true`
- `scene_image_color_palette_delta_pass=true`
- `scene_image_semantic_kind_unique=true`
- `product_image_reuse_ratio <= 0.35`
- `color_card_only_ratio = 0`
- `same_frame_ratio <= 0.25`
- `static_background_ratio <= 0.30`
- `dominant_background_change_count >= 7`
- `product_image_bbox_change_count >= 6`
- `caption_position_change_count >= 5`
- `visual_motion_score >= 90`
- `true_scene_change_pass=true`
- `use_case_human_context_present=true`
- `use_case_kitchen_context_present=true`
- `utensil_interaction_present=true`
- `human_use_signal_scene_count >= 2`
- `real_usage_visual_present=true`
- `shape_card_scene_detected=false`
- `shape_card_scene_count = 0`
- `abstract_scene_ratio <= 0.15`

If those signals are missing, the package must remain blocked with safe blocker
codes such as:

- `BLOCKED_REAL_SCENE_IMAGE_PROVIDER_NOT_CONFIGURED`
- `REAL_SCENE_IMAGE_PROVIDER_REQUIRED`
- `LOCAL_SCENE_CARD_GENERATOR_NOT_ENOUGH`
- `COLOR_CARD_ONLY_SCENE_BLOCKED`
- `REAL_SCENE_IMAGE_MISSING`
- `SCENE_IMAGE_HASH_DUPLICATE`
- `SCENE_IMAGE_SEMANTIC_DUPLICATE`
- `PRODUCT_IMAGE_REUSE_TOO_HIGH`
- `BACKGROUND_VARIATION_TOO_LOW`
- `SCENE_IMAGE_VISUAL_REALISM_TOO_LOW`
- `USE_CASE_SCENE_HAS_NO_HUMAN_CONTEXT`
- `USE_CASE_SCENE_TOO_ABSTRACT`
- `REAL_USAGE_VISUAL_MISSING`
- `KITCHEN_CONTEXT_MISSING`
- `SHAPE_CARD_SCENE_BLOCKED`

## Safety Boundary

Do not retry YouTube upload to compensate for this issue. A new private upload
is allowed only after a real scene-image provider produces visually distinct
scene images, the contact sheet proves the difference, and all content gates
pass with a fresh approval phrase.
