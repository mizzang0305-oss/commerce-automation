# Guarded two-channel YouTube public publisher V1

This publisher is a stateless `run-once` process. An existing host or scheduler may invoke it repeatedly; each invocation claims at most one `ready` job and exits. It does not modify the Daily69 `SAFE_TO_UPLOAD=false` contract or enable TikTok/Threads publishing.

## Required external runtime configuration

Set these only in the existing secure host configuration, never in the repository:

- `YOUTUBE_PUBLIC_PUBLISHER_ENABLED=true`
- `YOUTUBE_PUBLIC_PUBLISHER_STATE_PATH=<absolute path outside this repository>`
- `YOUTUBE_PUBLIC_PUBLISHER_NEOMAN_TOKEN_FILE=<neoman external token file>`
- `YOUTUBE_PUBLIC_PUBLISHER_FATHER_TOKEN_FILE=<father external token file>`
- `YOUTUBE_CLIENT_ID=<existing OAuth client id>`
- `YOUTUBE_CLIENT_SECRET=<existing OAuth client secret>`

Optional bounded limits may lower, but never raise, the approved V1 hard caps:

- `YOUTUBE_PUBLIC_PUBLISHER_MAX_DAILY_UPLOADS_TOTAL=3`
- `YOUTUBE_PUBLIC_PUBLISHER_MAX_DAILY_UPLOADS_PER_CHANNEL=2`
- `YOUTUBE_PUBLIC_PUBLISHER_MAX_AUTO_RETRY=1`

The state file and every channel token path must be absolute and outside the repository. The state file stores the publish jobs and idempotent upload ledger. The two verified canaries are imported once into that ledger without an upload call.

## Host command

```powershell
npm run youtube:public-publisher:run-once
```

The process prints only a sanitized result: state, job id, safe error code, `videos_insert_calls`, and imported-canary count. It never prints OAuth tokens, client credentials, or authorization headers.

## Guard order

`ready` claim → local video hash → QA/product/affiliate/metadata/disclosure checks → dedicated channel token → exact `channels.list(mine=true)` ID/title match → `videos.insert` → API readback → ledger persistence.

Any deterministic guard failure, channel mismatch, duplicate identity, upload result ambiguity, or second retryable failure transitions the job to `manual_review`. A retry is allowed only for a proven pre-insert transient failure.
