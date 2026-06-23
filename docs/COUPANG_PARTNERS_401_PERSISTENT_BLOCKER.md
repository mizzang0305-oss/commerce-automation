# Coupang Partners 401 Persistent Blocker

This document closes the repository-side investigation for the persistent
Coupang Partners HTTP 401 blocker after the auth readiness and live request
builder alignment work.

## Current Decision

```text
FINAL_STATUS=BLOCKED_EVENT_AWARE_LIVE_COUPANG_SCOUT_IMPORT_RETRY_AFTER_ALIGNMENT
CURRENT_BLOCKER=COUPANG_PARTNERS_API_HTTP_401_PERSISTED_AFTER_ALIGNMENT
live_scout_retry_allowed_now=false
```

The latest approved live retry was intentionally one-shot:

```text
selected_event=Rainy season preparation
selected_keyword=빨래건조대
external_api_call_count=1
partners_api_status=401
retry_loop_after_external_call=false
candidate_selected_or_imported=false
baseline_candidate_excluded=true
```

## Resolved Internally

The following repository-side guard and alignment items are complete:

- provider enabled reaches live path
- customer/partner id reaches live path
- readiness and live builder use shared env reader
- baseline candidate exclusion guard passes
- retry loop blocked
- raw secrets masked

The no-call alignment bundle also verified that provider-disabled, missing-key,
missing-id, keyword, timestamp, and env drift blockers stop before a live call is
allowed.

## Remaining External Blocker

Coupang Partners server still returns HTTP 401 after alignment pass.

The remaining blocker is outside the repository implementation unless future
evidence proves otherwise. The current likely scope is account, key-pair,
partner/customer id ownership, API permission, IP/account policy, or runtime
environment hygiene.

## External Checks Required

Before any further live scout/import retry, verify all of these outside the
repository:

- API key active
- access/secret key pair match
- partner/customer id belongs to same account
- account/API permission enabled
- no whitespace/quote/newline in env values
- process restarted after env edit

## Retry Gate

Do not retry live scout/import until external verification is complete and fresh explicit approval is provided.

Any future retry must keep the one-shot boundary unless a later owner prompt
changes it:

```text
fresh_explicit_approval_required=true
external_credential_account_verification_required=true
max_partners_api_call_count=1
retry_loop_after_external_call=false
```

## Safety Lock

The persistent 401 state keeps downstream work blocked:

```text
Coupang Partners API recall: blocked
external scout retry loop: blocked
candidate insert/update: blocked
render/R2/DB/YouTube side effects: blocked
public/unlisted upload: blocked
```

Closure evidence must stay sanitized. It may record booleans, status codes,
blocker codes, branch names, commit ids, test results, and selected event or
keyword labels. It must not record raw credentials, raw ids, signing material,
raw request targets, affiliate targets, image targets, or local config values.
