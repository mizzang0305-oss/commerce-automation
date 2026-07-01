# v053 Mutation-Enabled V051 Executor

Status: ready for review, no upload executed.

## Purpose

v053 removes the fixed `CHECK_ONLY_NO_UPLOAD` limitation from the v051 execution path by adding explicit execution modes:

- `check_only`
- `dry_run`
- `mutation_enabled`

The default remains `check_only`.

## Safety Boundary

This PR does not upload, call YouTube Execute, call `videos.insert`, create/update/delete comments, change visibility, upload to R2, write `product_assets`, write DB rows, deploy, or print raw affiliate URLs/tokens/secrets.

All v053 tests use mock adapters only.

## Execution Modes

| Mode | Behavior |
| --- | --- |
| `check_only` | Builds readiness/preflight reports only. No adapter call. |
| `dry_run` | Builds readiness/preflight reports only. No adapter call. |
| `mutation_enabled` | Allows the injected upload/comment adapters to be called only after all safety gates pass. |

Runtime default:

```bash
npm run upload:v051:execute
```

Explicit mutation mode:

```bash
V051_EXECUTION_MODE=mutation_enabled npm run upload:v051:execute
```

## Required Gates

`mutation_enabled` requires all of the following:

- `APPROVE_V051_EXECUTE_THREE_CHANNEL_ONE_SHOT_PUBLIC_UPLOADS_WITH_COMMENTS`
- `CONFIRM_V051_PAID_PROMOTION_SETTINGS_CHECKED_FOR_ALL_CHANNELS`
- v049 three-channel preflight pass
- v050 adapter readiness pass
- channel routing ready
- duplicate upload guard pass
- Korean metadata hardening gate pass
- injected upload adapter
- injected comment adapter

If any gate fails, the executor stops before upload/comment adapter calls.

## Adapter Contract

Upload adapter:

```ts
uploadAdapter.uploadPublicShorts({
  channelKey,
  videoPath,
  title,
  description,
  madeForKids: false,
  containsPaidPromotion: true,
  visibility: "public"
})
```

Comment adapter:

```ts
commentAdapter.createTopLevelComment({
  channelKey,
  videoId,
  commentTextWithAffiliateUrl
})
```

The raw affiliate value may be sent to the comment adapter request. It must not be written to reports, logs, PR text, or Minz-OS.

## Stop Rules

- `STOP_ON_FIRST_EXTERNAL_CALL_AMBIGUITY=true`
- `PARTIAL_UPLOAD_ALLOWED=false`
- `videos_insert_total_count <= 3`
- `comment_create_total_count <= 3`

Ambiguous upload result:

```text
AMBIGUOUS_UPLOAD_RESULT_AFTER_EXTERNAL_CALL
```

Ambiguous comment result:

```text
AMBIGUOUS_COMMENT_RESULT_AFTER_EXTERNAL_CALL
```

## Expected Review Result

```text
FINAL_STATUS=SUCCESS_V053_MUTATION_ENABLED_V051_EXECUTOR_READY_NO_UPLOAD
V051_MUTATION_EXECUTOR_READY=true
SAFE_TO_UPLOAD=false
```

Next action after merge:

```text
새 v051 승인 문구 2개와 V051_EXECUTION_MODE=mutation_enabled로 3채널 public upload를 1회 실행한다.
```
