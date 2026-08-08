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
npm run queue-video:preflight
npm run queue-video:configure-pilot -- --fresh
.\scripts\queue-scheduler\install-no-upload-pilot.ps1 -WorktreeRoot $PWD -WhatIf
```

The git default is disabled. A fresh pilot creates an ignored `data/queue-scheduler-v1/pilots/pilot-<timestamp>/` namespace and changes only the ignored `active-pilot.json` pointer. Historical queue evidence is never rewritten. Disable the active pilot with `npm run queue-video:configure-pilot -- --disable`.

## Reliability repair

- Runtime readiness is checked after stale-lease recovery and disk guard, but before `claimDue()`. A failed check records only configured booleans and returns `RUNTIME_PREFLIGHT_BLOCKED` with zero queue mutation.
- Eligible products beyond the nine active logical slots are retained in an ignored durable reserve pool. Product-specific hard failures can atomically replace the product while preserving the slot ID and full candidate history.
- Scheduler attempts, media repair cycles, and product candidate attempts are separate counters. A slot is limited to the primary product plus two reserve candidates.
- PCM WAV pauses over 700 ms are deterministically compressed before faster-whisper and WhisperX. Any audio change invalidates prior time-based output and forces fresh ASR/alignment/caption generation. The 0.82 ASR threshold and 900 ms hard-silence blocker are unchanged.
- Wrapper exit codes are `0` for success/no-op, `2` for partial, `3` for runtime preflight block, and `4` for failed batch.
