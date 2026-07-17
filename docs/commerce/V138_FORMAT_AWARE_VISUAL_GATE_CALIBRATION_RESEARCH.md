# V138 format-aware visual gate calibration

## Decision

`real_usage_storyboard` and `product_reference_repeat` must use different pixel contracts. Neither pixel diversity nor scene-category labels can replace selected-product, script, and manifest-purpose binding.

## V137 correction

V047 vehicle and cable files have laundry-oriented filenames, but SHA comparison proves that their pixels are byte-identical to the category-correct V046 vehicle and cable scenes. Their owner BLOCK is caused by selected-product/script/manifest contamination, not wrong-category pixels. V137 was corrected before V138 calibration.

## Balanced owner corpus

The V138 local research corpus contains owner-authorized PASS/BLOCK decisions for every target category:

| Category | PASS | BLOCK evidence |
| --- | --- | --- |
| vehicle | V046 real-usage scene pack | V047 binding failure; controlled repeat storyboard |
| cable management | V046 real-usage scene pack | V047 binding failure; controlled non-identity repeat |
| food | V116 approved product-reference repeat | controlled repeat-as-storyboard; controlled wrong-category repeat |

Controlled negatives are research-only permutations and are never product or upload candidates.

## Format contracts

### `real_usage_storyboard`

- minimum 5 scenes
- minimum 3 perceptual clusters at central-edge similarity 0.88
- maximum largest-cluster ratio 0.5
- scene category and full script-product-manifest binding required separately

### `product_reference_repeat`

- minimum 5 timeline scenes
- 1 to 3 exact identity-locked image sources
- no minimum perceptual-diversity requirement
- exact product identity, scene category, and full script-product-manifest binding required

## Promotion rule

A format profile needs at least four samples, two categories, two owner PASS, two owner BLOCK, two format-contract PASS, two format-contract BLOCK, and perfect local component agreement. A rule may be measured with less evidence, but it remains provisional and cannot be integrated.

## Safety

This research does not authorize commit, push, PR, deploy, upload, comment, or visibility changes. `SAFE_TO_UPLOAD=false`; `SAFE_TO_PUBLIC_UPLOAD=false`.

## Observed result

- owner corpus: 9 samples across vehicle, cable management, and food
- every category has owner PASS and BLOCK
- combined component decision: 9/9 correct, unsafe false pass 0, false block 0
- `real_usage_storyboard`: 6 samples, 3 categories, profile contract 6/6, owner decision 6/6, promotion-ready for a separate integration review
- `product_reference_repeat`: 3 samples, 2 categories, profile contract 3/3, owner decision 3/3, but only one real owner PASS; promotion remains blocked
- full local calibration runtime: 4282.64ms for 9 samples

Final V138 status: `BLOCKED_PRODUCT_REFERENCE_REPEAT_PROMOTION_INSUFFICIENT_OWNER_PASS_DIVERSITY`. The next evidence needed is one additional identity-locked owner PASS from a non-food category and a matching owner BLOCK, not another threshold search over the same food sample.
