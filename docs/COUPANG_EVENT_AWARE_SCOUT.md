# Coupang Event-Aware Scout And Manual Fallback

This document defines the event-aware product-source path for low-cost motion
shorts after the live Coupang Partners scout remained blocked by HTTP 401.

## Current Event Lock

The MVP event lock is:

```text
selected_event=Rainy season preparation
selected_event_type=weather
selected_event_date_or_range=2026-06-15 ~ 2026-07-20
selected_keyword=빨래건조대
baseline_candidate_id=candidate-490aa6d25e8ea89d
```

The baseline candidate must stay excluded from every next-product selection.

## Live API Final Lock

The repository-side auth guard, readiness/live-builder alignment, no-call
alignment, baseline exclusion, retry-loop guard, and raw-value masking are
complete.

After external account/key verification, the final approved one-shot live scout
still returned:

```text
COUPANG_PARTNERS_API_HTTP_401_PERSISTED_AFTER_EXTERNAL_VERIFICATION
external_api_call_count=1
retry_loop_after_external_call=false
candidate_selected_or_imported=false
```

For the MVP path, live Coupang Partners scout retry is locked. The next product
must come through the manual event-aware candidate fallback unless a future
provider-supported auth fix is separately approved.

## Manual Event Candidate Fallback

The fallback source is:

```text
source=manual_event_candidate
```

The operator supplies:

- product name
- category
- Coupang Partners affiliate URL
- product image URL

The validator then checks:

- persistent HTTP 401 blocker is the current reason for fallback
- product name is present
- affiliate URL is present and uses `https://link.coupang.com`
- product image URL is present and HTTP(S)
- candidate is not the baseline candidate
- candidate is relevant to the selected event and keyword
- policy-risk keywords/categories are absent
- low-cost motion v1.1 suitability score passes

Only when all checks pass does the fallback mark:

```text
ready_for_low_cost_motion_v1_1_render=true
```

## Safe Reporting

Safe summaries may include:

- source
- event id, name, and type
- selected keyword
- product name/category presence booleans
- affiliate URL presence boolean
- product image presence boolean
- baseline exclusion boolean
- event relevance score
- motion suitability score
- policy-risk boolean
- low-cost motion suitability boolean
- render readiness boolean

Safe summaries must not include raw affiliate URLs, raw image URLs, access keys,
secret keys, partner/customer ids, Authorization headers, HMAC signatures, raw
request URLs, or local `.env.local` values.

## Side-Effect Boundary

This fallback PR does not execute candidate import. It only adds source,
tests, and docs for the safe validation path.

The fallback side effects remain:

```text
partners_api_called=false
external_scout_called=false
candidate_insert_update=false
render_attempted=false
mp4_created=false
R2_upload_write=false
product_assets_write=false
DB_write=false
YouTube_Execute=false
videos.insert=false
public_upload=false
unlisted_upload=false
```

The next approved phase may use the fallback to prepare exactly one manually
provided rainy-season drying-rack candidate for low-cost motion v1.1 render
prep.
