# v052 v051 Approval Alias Wrapper

## Scope

v052 adds a no-upload approval alias wrapper for the v051 three-channel public upload flow.

This PR only verifies that v051 approval aliases are accepted and that stale v049 approval phrases are rejected before any upload path can run.

## Supported v051 Phrases

- `CONFIRM_V051_PAID_PROMOTION_SETTINGS_CHECKED_FOR_ALL_CHANNELS`
- `APPROVE_V051_EXECUTE_THREE_CHANNEL_ONE_SHOT_PUBLIC_UPLOADS_WITH_COMMENTS`

The wrapper reads both phrases from `V051_APPROVAL_TEXT`.

## Rejected Phrases

The v051 wrapper rejects these stale v049 phrases:

- `CONFIRM_V049_PAID_PROMOTION_SETTINGS_CHECKED_FOR_ALL_CHANNELS`
- `APPROVE_V049_EXECUTE_THREE_CHANNEL_ONE_SHOT_PUBLIC_UPLOADS_WITH_COMMENTS`

If either v049 phrase is present, the wrapper returns:

```text
BLOCKED_V051_STALE_V049_APPROVAL_REJECTED
```

## Commands

```bash
npm run upload:v051:preflight
npm run upload:v051:execute
```

Both commands are no-upload readiness wrappers in v052. They use `V051_APPROVAL_TEXT`, reuse the existing v049 preflight path, and reuse the v050 injected noop adapters in `check_only` mode.

## Safety

v052 must not:

- call YouTube Execute
- call `videos.insert`
- create, update, or delete comments
- change visibility
- upload to R2
- write `product_assets`
- write DB rows
- print raw affiliate URLs
- print tokens, secrets, or Authorization headers

Expected success status:

```text
FINAL_STATUS=SUCCESS_V052_V051_APPROVAL_ALIAS_READY_NO_UPLOAD
V051_ALIAS_READY=true
SAFE_TO_UPLOAD=false
```

Next action after merge:

```text
PR merge 후 v051 승인 문구 2개를 새로 보내고 upload:v051:execute를 1회 실행한다.
```
