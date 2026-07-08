# V104 Event Candidate To Queue No-Upload

## Purpose

V104 materializes the V103 selected event candidate into the local/mock queue so the standalone V102 first-video settings preflight can see an eligible first candidate.

This is not an upload feature. It does not call YouTube, n8n, Supabase, R2, product assets, or storage.

## Scope

- Source: V103 `selectedFirstCandidate`
- Default mode: `dry_run`
- Optional local mode: `local_write`
- Blocked mode: `supabase_write`
- Target queue status: `manual_review`
- Target manual review status: `not_ready`

The selected candidate remains blocked from upload readiness until separate upload package, disclosure, affiliate, and prepared asset evidence exist.

## Modes

| Mode | Behavior |
| --- | --- |
| `dry_run` | Builds the queue item in memory only and runs V102 against the planned fixture. |
| `local_write` | Writes the materialized item to local/mock `data/queue.json` only. |
| `supabase_write` | Always blocks with `BLOCKED_SUPABASE_WRITE_NOT_APPROVED_NO_UPLOAD`. |

## Safety

V104 reports these safety flags as disabled:

- `videosInsertCalled=false`
- `commentThreadsInsertCalled=false`
- `n8nWebhookCalled=false`
- `schedulerExecutionCalled=false`
- `DB_write=false`
- `Supabase_write=false`
- `SAFE_TO_UPLOAD=false`
- `SAFE_TO_PUBLIC_UPLOAD=false`

Reports contain sanitized booleans, labels, and hash prefixes only. They must not print raw affiliate URLs, raw Coupang URLs, raw video IDs, raw channel IDs, tokens, secrets, Authorization headers, or HMAC signatures.

## Expected Result

After `local_write`, standalone V102 should move past:

```text
BLOCKED_NO_FIRST_VIDEO_CANDIDATE_NO_UPLOAD
```

The expected next blocker is:

```text
BLOCKED_FIRST_VIDEO_SETTINGS_NOT_READY_NO_UPLOAD
```

or another package/asset readiness blocker. That is normal until the upload package and prepared asset pipeline is explicitly approved.

## Commands

Dry-run:

```powershell
npm run automation:v104:event-candidate-to-queue --silent
```

Local/mock write:

```powershell
$env:V104_MODE="local_write"
npm run automation:v104:event-candidate-to-queue --silent
Remove-Item Env:V104_MODE
```

Standalone V102 confirmation:

```powershell
npm run upload:v102:first-video-settings-dry-run --silent
```

## Next Action

`V105_QUEUE_TO_GENERATE_ONLY_NEXT_BATCH_NO_UPLOAD`

V105 may connect the materialized queue candidate to a generate-only next-batch flow, but upload/comment/scheduler execution remains blocked until separate owner approval.
