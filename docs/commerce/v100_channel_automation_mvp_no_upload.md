# V100 Channel Automation MVP No Upload

## Intent

V100 pivots the project from private upload blocker chasing to channel-by-channel generation operations.

This is a no-upload MVP. It manages queue selection, channel-scoped next-batch payloads, dashboard visibility, and manual-upload readiness.

## Channels

- `father_jobs`
- `neoman_moleulgeol`
- `lets_buy`

## Safety Status

- `SAFE_TO_UPLOAD=false`
- `SAFE_TO_PUBLIC_UPLOAD=false`
- `youtube_upload_enabled=false`
- `approval_required=true`
- `max_daily_uploads=0`
- Public, unlisted, private, comment, and scheduler execution remain blocked.

## Channel Settings

Each channel uses `ChannelAutomationSettings`:

- `channelKey`
- `displayName`
- `enabled`
- `daily_target_count`
- `batch_size`
- `interval_hours`
- `run_mode=generate_only`
- `youtube_upload_enabled=false`
- `approval_required=true`
- `max_daily_uploads=0`
- `category_include`
- `category_exclude`
- `updated_at`

## Next Batch Behavior

`/api/run/next-batch` keeps the existing worker-job path when no `channelKey` is provided.

When `channelKey` is provided, V100 uses the channel path:

1. Select due items for that channel only.
2. Require `queue_status=scheduled`.
3. Require `scheduled_at <= now`.
4. Exclude `hold`, `skipped`, `error`, and `manual_review`.
5. Sort by `queue_rank ASC`.
6. Limit to channel `batch_size`.
7. Mark selected items `processing`.
8. Send a sanitized n8n payload with `channel_key`, settings, and selected item evidence.
9. On webhook failure, roll selected items back to `scheduled`.
10. If the webhook succeeds but the channel run log cannot be written, roll selected items back to `scheduled` and return a blocked safe response instead of fake success.

The V100 path does not create worker jobs and does not call any YouTube upload or comment mutation.

## P1 Review Fixes

V100 persists channel identity as snake_case database evidence:

- `product_queue.channel_key`
- `automation_runs.channel_key`

The Supabase repository maps `channel_key` to the TypeScript `channelKey` field on read, and serializes `channelKey` back to `channel_key` on writes. It does not upsert unknown camelCase `channelKey` fields into Supabase.

Queue filtering is channel-scoped across mock, local JSON, and Supabase repositories. Supabase applies `eq("channel_key", channelKey)` before returning queue rows; local JSON now filters by `channelKey` like the in-memory repository.

Legacy product queue rows that do not have channel evidence default to `father_jobs` for backward compatibility. Automation run rows keep `channelKey` optional because historical run rows may not have channel evidence.

The schema change is included as a migration file only:

- `supabase/migrations/010_channel_automation_channel_keys.sql`

No production migration apply is part of this no-upload PR.

## Dashboard

The dashboard shows three channel cards with:

- today generated count
- processing count
- ready for manual upload count
- error count
- next due preview
- `Autopilot Scheduler: Scaffold Only`
- `SAFE_TO_UPLOAD=false`

Upload/comment controls are not enabled.

## Queue And Runs

The queue view supports a `channelKey` filter.

Run logs include `channelKey` for `channel_next_batch` runs and continue to show sanitized messages only.

## Redaction

Reports and UI must not expose:

- webhook URL
- webhook secret
- raw affiliate URL
- raw Coupang URL
- full video ID
- full channel ID
- token, secret, Authorization, or HMAC

## Next Action

Owner review PR. If accepted, operate channel generation through `ready_for_manual_upload` only.
