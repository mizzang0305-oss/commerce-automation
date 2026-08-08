# Queue Scheduler No-Upload V1

This stacked pilot connects PR #237's proven live Coupang product-to-video path to a durable local JSON queue and two dedicated Windows Scheduled Tasks.

## Boundaries

- Local durable queue only: `data/queue-scheduler-v1/` (gitignored).
- Live Coupang reads are allowed. Supabase, Google Sheets, R2, Drive, Production Worker, and platform upload writes are absent.
- `SAFE_TO_UPLOAD=false`, `SAFE_TO_PUBLIC_UPLOAD=false`, and `PLATFORM_UPLOAD=0` are immutable.
- Success means `video_ready_autoqa` after queue/product binding, final MP4 existence, H.264/AAC 1080x1920 ffprobe, and machine QA. Scheduled Codex visual review is recorded honestly as `not_executed` unless a separately configured adapter runs.

## Tasks

- `Minz-Commerce-Scout-NoUpload-V1`: daily at 00:05 KST.
- `Minz-Commerce-VideoBatch-NoUpload-V1`: hourly at 01:00 through 23:00 KST.
- Both use `MultipleInstances=IgnoreNew` and `StartWhenAvailable=true`; existing tasks are never overwritten.

## Commands

```powershell
npm run queue-video:scout
npm run queue-video:run-next
npm run queue-video:status
.\scripts\queue-scheduler\install-no-upload-pilot.ps1 -WorktreeRoot $PWD -WhatIf
```

The git default is disabled. Local pilot activation is stored only in ignored `data/queue-scheduler-v1/settings.json`. Set `isPaused=true` for an operator pause without deleting tasks.
