# Hourly Autopilot Runner

This local runner lets `commerce-automation` read its own review state and decide the next safe action without copying Codex results through another chat.

## Commands

```powershell
npm run autopilot:status
npm run autopilot:decision
npm run autopilot:hourly
```

Runtime state is local-only and ignored by git:

```text
commerce-assets/autopilot/state.json
commerce-assets/autopilot/last-run-report.md
commerce-assets/autopilot/events.jsonl
commerce-assets/autopilot/locks/hourly.lock
```

## Safety Model

The runner may create local review state and reports. It must stop at owner review when `review-console.html` or `PENDING_HUMAN_REVIEW` is present.

It does not perform public or unlisted uploads. Private upload remains blocked unless all of these are true:

```text
human_review_status=PASS_LOCAL_HUMAN_REVIEW
private_upload_allowed=true
approval_phrase=APPROVE_AUTOPILOT_PRIVATE_UPLOAD_ON_OWNER_PASS
allowed_visibility=private
max_uploads_per_run=1
duplicate_upload_risk=false
videos_insert_count_this_run=0
```

The approval file is also local-only and must not be committed:

```text
commerce-assets/autopilot/owner-upload-approval.json
```

Example shape:

```json
{
  "approval_phrase": "APPROVE_AUTOPILOT_PRIVATE_UPLOAD_ON_OWNER_PASS",
  "allowed_visibility": "private",
  "max_uploads_per_run": 1,
  "max_uploads_per_day": 1,
  "expires_at": "2026-06-30T23:59:59+09:00"
}
```

## Hourly Lock

The lock file prevents duplicate runs:

```text
commerce-assets/autopilot/locks/hourly.lock
```

Rules:

- A lock newer than 90 minutes blocks a new run.
- A lock older than 90 minutes is treated as stale and replaced.
- The lock is removed when the hourly run exits normally.
- Unexpected failures are recorded in `events.jsonl`.

## Windows Task Scheduler

Review the script first:

```text
scripts/autopilot/run-hourly-autopilot.ps1
```

Register an hourly task:

```powershell
schtasks /Create /SC HOURLY /TN "CommerceAutomationHourlyAutopilot" /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\LOVE\MyProjects\commerce-automation\scripts\autopilot\run-hourly-autopilot.ps1" /ST 09:00
```

Operational notes:

- The PC must be on.
- Local `.env.local` must be present when review packet generation needs it.
- The repo-outside MeloTTS wrapper must be ready before voice generation can pass.
- Do not commit `commerce-assets/**`, `.env.local`, voice/model files, MP4/audio/image artifacts, or approval files.
- Public and unlisted uploads stay blocked.
