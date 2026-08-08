# Daily 69 Usage Evidence Capacity Gap

Date: 2026-08-09
Base: PR #239 `12859aa8769834f91b1d71e581ab845c8dd5408d`
Scope: local no-upload capacity only

## Safety state

- `SAFE_TO_UPLOAD=false`, `SAFE_TO_PUBLIC_UPLOAD=false`, `PUBLISH_READY=false`
- Google Sheets, Drive, R2, Supabase, Production DB, platform upload, render, and Production deploy writes: `0`
- Scout and Batch tasks: Disabled
- ControlRunner: absent
- Existing Worker: unchanged

## Original structural limitation

PR #239 supported only `vehicle_organization`, `desk_organization`, and `laundry_drying`. `src/lib/live-product-video/usageEvidence.ts` mapped each use case to one V049 channel and one reviewed V057 video. That mapping answered whether a use-case string existed, but did not load a capacity registry, validate scene packs, enforce source reuse, or allocate different scene sequences.

Classification, aliases, anchors, and the 15 daily keywords were separately hard-coded around those three use cases. Discovery stopped on eligible product count rather than checking whether 69 active plus 14 reserve products could each receive a policy-compliant evidence sequence.

## Review evidence audit

The approved local asset root contains:

- 1,856 files total
- 140 video files
- 602 image files
- 526 JSON review/report files scanned
- 76 files containing review-related fields
- 5 files containing `PASS_LOCAL_HUMAN_REVIEW`

Only the V049 report supplies the three exact human-reviewed source-video bindings used here:

- `father_jobs` → vehicle organization
- `lets_buy` → desk/cable organization
- `neoman_moleulgeol` → indoor laundry drying and space organization

All three rows have `PASS_LOCAL_HUMAN_REVIEW`, existing V057 media, and exact hashes recorded in the ignored local inventory. Frames derived from those sources are Tier A only after machine QA and Codex visual review.

Sanitized local images are Tier B. V029 is handled narrowly: its rendered video failed human review for motion jitter, while its separate image-asset validity report records eight real generated scene files, semantic checks, provenance, and pairwise pHash checks as passing. Those still remain `sourceHumanReviewStatus=not_available`, `humanOwnerReviewStatus=not_requested`, local-only, and `publishEligible=false`. No video human-pass claim is inferred.

The V023 free-stock manifest is excluded as `USAGE_ASSET_RIGHTS_UNCLEAR`; it is not part of capacity.

## Stored 50/69 reproduction

The preserved namespace `daily69-canary-20260809043214` reports:

| Counter | Value |
| --- | ---: |
| provider calls | 15 |
| raw | 150 |
| normalized | 150 |
| eligible after original evidence gate | 85 |
| active | 50 |
| reserve | 35 |
| active shortfall | 19 |

Replaying the selector against the stored 50 active and 35 reserve candidates accounts for every unselected candidate:

| Terminal reason | Count |
| --- | ---: |
| top-level category cap reached | 22 |
| same use case would be third consecutive item | 13 |
| product-family cap reached | 0 |
| unexplained | 0 |

The category-capped set consisted of 13 desk and 9 laundry candidates in the already-full `생활용품` category. This is a diversity-distribution and evidence-capacity problem; no category, family, affiliate, image, or exact-asset policy is relaxed.

## V2 recovery status

The local registry builder and allocator now provide:

- 7 supported use cases
- 30 reviewed packs
- 150 nominal capacity units
- 59 near-duplicate-filtered assets
- role-pool allocation of exactly three distinct scenes per product
- exact asset and pack reuse limit 5
- identical sequence consecutive limit 2
- same source-video daily limit 15

Static planning reaches 69 active plus 14 reserve under unchanged `maxCategoryRatio=0.35` and `maxProductFamilyRatio=0.10`. This is not live proof by itself. The ignored `usage-capacity-gap.json` from bounded Coupang discovery is the authority for the final Daily69 decision.

## Bounded live discovery result

The final allowed isolated namespace completed real Coupang discovery with the configured no-upload provider environment:

| Counter | Value |
| --- | ---: |
| provider calls | 21 / 30 |
| raw discoveries | 210 / 240 |
| active | 58 / 69 |
| reserve | 14 / 14 |
| distinct allocated product keys | 72 / 83 |
| unsupported candidates | 0 |
| asset-unavailable candidates | 0 |
| category-cap rejections | 294 |
| asset-capacity rejections | 312 |

All 7 use cases produced live candidates and the reserve target passed. Category, product-family, exact-asset, pack, sequence, batch, and source-video policies remained unchanged and reported no selected-row violation. However, the active target missed by 11, so the result is **Case C: structural source-pack capacity/distribution gap**, not Daily69 readiness. A second scout was intentionally not executed because the first allocation did not pass the full gate.

The earlier isolated namespace made zero external calls because the provider environment had not yet been loaded. It is retained only as local ignored diagnostic evidence. The two-namespace ceiling is exhausted; no further live retry was performed.
