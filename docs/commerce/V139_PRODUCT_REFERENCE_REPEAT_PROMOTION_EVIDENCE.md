# V139 product-reference-repeat promotion evidence

## Decision

The missing non-food `product_reference_repeat` evidence is now present. A V112 vehicle product supplies one identity-locked owner PASS, and a same-category controlled mixture supplies the paired owner BLOCK.

## Added owner evidence

| Decision | Sample | Evidence |
| --- | --- | --- |
| PASS | `vehicle-v112-single-source-repeat-pass` | Five timeline scenes reuse the exact V112 rear-seat organizer hero. The source summary records `CURRENT_REAR_SEAT_MULTIFUNCTION_ORGANIZER`, `productReferenceLocked=true`, no preview blockers, and no upload execution. |
| BLOCK | `vehicle-controlled-four-source-identity-drift-block` | The vehicle-only control mixes the V112 rear-seat organizer with three V046 center-console organizer sources. Category stays correct, but exact product identity fails and four exact sources exceed the repeat profile maximum of three. |

The BLOCK is a local research control. It is not a product candidate and cannot be rendered or uploaded.

## Calibration result

- total corpus: 11 samples across vehicle, cable management, and food
- category owner labels: PASS and BLOCK present in every category
- combined owner decision: 11/11 correct
- unsafe false pass: 0
- false block: 0
- `real_usage_storyboard`: promotion evidence ready
- `product_reference_repeat`: 5 samples, 3 categories, owner PASS 2, owner BLOCK 3, format PASS 3, format BLOCK 2
- `product_reference_repeat`: owner decision 5/5 and format-profile agreement 5/5
- all format profiles promotion evidence ready: true

Final V139 status: `PASS_FORMAT_AWARE_VISUAL_CALIBRATION_PROMOTION_EVIDENCE_READY`.

## Integration boundary

V139 only closes the local evidence gap. It does not integrate the format-aware gate into Worker execution and does not authorize commit, push, PR, deploy, TTS, final render, upload, comment, or visibility changes.

- `integration_review_ready=true`
- `safe_to_integrate=false`
- `SAFE_TO_UPLOAD=false`
- `SAFE_TO_PUBLIC_UPLOAD=false`

Any Worker integration requires a separate code/PR approval and fresh verification.

## Reproduction

```powershell
python python-worker/scripts/research_v138_format_aware_visual_calibration.py `
  --manifest commerce-assets/research/v138/format-aware-manifest.json `
  --manifest commerce-assets/research/v139/product-repeat-supplement.json `
  --owner-review commerce-assets/research/v138/owner-review-v138.json `
  --owner-review commerce-assets/research/v139/owner-review-v139.json `
  --asset-root C:\Users\LOVE\MyProjects\commerce-automation\commerce-assets `
  --output commerce-assets/research/v139/format-aware-report-v139.json
```
