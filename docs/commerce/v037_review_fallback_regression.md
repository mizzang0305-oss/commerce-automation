# v037 Review Fallback Regression

## Decision

P0 regression is confirmed: v037 review packets can expose fallback/test-pattern-like render outputs as normal human review items. Fallback renderer outputs must be classified as `GENERATION_FAILED`, not `PENDING_HUMAN_REVIEW`.

## Root Cause

- The v037 review console renders `local-review-video.mp4` directly for human review.
- The v037 scene manifest records `provider=local_v037_scene_asset_renderer`.
- The same manifest marks generated scene assets as `placeholder_image=false` and `scene_asset_quality_pass=true`.
- Actual sampled scene PNGs are low-information placeholder frames, not commerce creatives with product image, offer text, price/spec, and CTA.

## Required Blocker Behavior

Fallback/test-pattern assets are not valid review items. The review gate must fail closed when any of these are true:

- fallback, placeholder, debug, test-pattern, or `local_v037_scene_asset_renderer` renderer is used
- colorbar or test-pattern signature is present
- image probe shows a solid or low-information placeholder frame
- product/source image is missing
- offer text is missing
- required price/spec field is missing
- required source asset path is missing

## Failure Card

Failed items must render a failure card instead of image/video preview media. The card must include:

- item id
- product/source name
- failure reason
- missing asset path
- renderer name
- template id
- next action

## Safety

- `safe_to_upload` remains `false`.
- Upload execution is not allowed.
- External publish is not allowed.
- Production deploy is not allowed.
- Fallback/test-pattern output is never accepted as a normal commerce creative.

## Current v037 Scope

Affected local review packets:

- `commerce-assets/review/v037/neoman_moleulgeol/review-console.html`
- `commerce-assets/review/v037/lets_buy/review-console.html`
- `commerce-assets/review/v037/father_jobs/review-console.html`

The blocker is implemented as a pure local classifier and does not execute uploads, deploys, external API calls, or production writes.
