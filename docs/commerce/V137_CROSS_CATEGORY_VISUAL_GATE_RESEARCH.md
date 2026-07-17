# V137 Cross-category visual gate research

## Purpose

Validate the V135 pixel-diversity gate against owner-labeled scenes outside the laundry category without TTS, final rendering, upload, or production mutation.

## Corpus contract

- At least two non-laundry categories are required.
- Every sample must have verified owner-decision evidence.
- Every scene carries an owner category label.
- Both owner `pass` and `block` labels are required.
- Raw file paths are excluded from the result report.

The local V137 holdout contains:

- vehicle: V047 owner-blocked channel contamination
- cable management: V047 owner-blocked channel contamination
- food: V116 explicitly approved and completed product video

## Validation layers

1. `scene_category_binding`: fail closed when a scene's owner category label does not match the target product category.
2. `script_product_manifest_binding`: verify selected product, script, and manifest purpose agree even when pixels are category-correct.
3. `format_profile_selection`: select a diversity profile appropriate for a real-usage storyboard or a product-reference format.
4. `pixel_diversity_gate`: apply the V135 dHash cluster thresholds only after the first three checks.

The research intentionally reports the pixel gate and semantic guard separately. A visually diverse but wrong-category storyboard must not pass merely because its frames differ, and an approved two-image product format must not be treated as unsafe solely because it repeats images.

## Local command

```powershell
python python-worker/scripts/research_v137_cross_category_visual_validation.py `
  --manifest commerce-assets/research/v137/cross-category-manifest.json `
  --asset-root <PRIMARY_CHECKOUT>\commerce-assets `
  --output commerce-assets/research/v137/cross-category-report.json
```

## Decision rule

- A universal pixel gate is ready only with zero unsafe false passes and zero false blocks.
- The semantic guard is ready for the safety position when it produces zero unsafe false passes.
- Category-balanced calibration remains incomplete until every evaluated category has both owner-pass and owner-block samples.

This document does not authorize upload, comments, visibility changes, commit, push, PR, merge, or deploy.

## Observed result

The owner-evidence assertions resolved for 21 scenes across vehicle, cable management, and food.

| Gate | Accuracy | Unsafe false pass | False block |
| --- | ---: | ---: | ---: |
| V135 pixel diversity | 0.0000 | 2 | 1 |
| semantic category binding | 0.3333 | 2 | 0 |
| pixel AND semantic | 0.0000 | 2 | 1 |

The V135 pixel thresholds are therefore blocked as a universal cross-category gate. A post-review SHA comparison corrected an earlier filename-derived label error: V047 vehicle and cable files contain the same category-correct pixels as V046, despite laundry-oriented filenames and manifest/script contamination. Category binding alone therefore does not remove either unsafe pass. The guard must separately verify scene category, selected product, script, and manifest-purpose binding. The approved food sample still shows that a single universal diversity threshold would falsely block legitimate low-image-count formats.

The next efficient calibration unit is category-balanced and format-aware: add an owner-pass and owner-block sample for each target category, calibrate separate `real_usage_storyboard` and `product_reference_repeat` profiles, and require explicit script-product-manifest binding. Until that corpus exists, do not promote either the pixel thresholds or category-only guard to a universal production rule.
