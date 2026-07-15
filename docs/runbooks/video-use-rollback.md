# video-use Rollback Runbook

## Immediate Rollback

```text
VIDEO_RENDERER=legacy
VIDEO_USE_ENABLED=false
```

Restart only the non-production render worker that owns these variables. Do not change upload, OAuth, DB, or storage configuration.

## Queue Recovery

1. Stop accepting new video-use render attempts.
2. Identify jobs by renderer and manifest version.
3. Requeue only jobs that never entered a publish queue.
4. Preserve video-use artifacts for diagnosis; do not treat them as successful uploads.
5. Run the legacy renderer with the original idempotency key and source hash.

## Code Rollback

Revert the migration commit or PR. No destructive DB rollback is required because this change adds no migration and writes no production state.

## Verification

- Legacy focused tests pass.
- `VIDEO_RENDERER=legacy` is reported.
- `VIDEO_USE_ENABLED=false` is reported.
- No video-use worker remains active.
- No shadow result is marked publish-ready.
