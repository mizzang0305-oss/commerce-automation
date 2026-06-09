# YouTube Upload Adapter

This adapter is an approval-gated server-only path for YouTube private or unlisted upload smoke.

It does not enable public upload. It does not run live upload smoke by default. It does not store OAuth tokens in the repository or expose token values to the client.

## Scope

- Provider: YouTube only.
- Visibility: `private` or `unlisted` only.
- Exact confirmation phrase: `APPROVE_YOUTUBE_PRIVATE_UPLOAD`.
- Live smoke phrase: `RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE`.
- Default behavior: blocked by readiness.
- Upload method: YouTube Data API resumable `videos.insert` from a local `.mp4` file.

## Required Readiness

The readiness APIs return boolean/status fields only:

- provider configured
- token ready
- scopes ready
- quota ready
- account ready
- policy ready
- upload enabled
- can upload
- blocked reasons

The APIs must not return raw client IDs, client secrets, access tokens, refresh tokens, Authorization headers, or provider response bodies.

The upload request builder rejects garbled Korean affiliate disclosure text
before prepare or execute can proceed. A valid YouTube upload request must keep
the disclosure readable in UTF-8 and include `쿠팡파트너스` and `수수료`. Strings that
look like replacement-question-mark mojibake, for example `? ????`, are blocked
with `disclosure_text_garbled`.

## Request Requirements

YouTube upload request preparation requires:

- `candidate_id`
- `video_path_or_url`
- `title`
- `description` or `caption`
- `disclosure_text`
- `selected_affiliate_url`
- `visibility` as `private` or `unlisted`

`public` visibility is rejected. The final description must include the affiliate disclosure text and affiliate URL.

For the local private smoke, use `candidate-video-smoke-001`. That id is the
existing dev smoke candidate created by `/api/dev/seed` with
`mode="candidate-video-smoke"`. The YouTube adapter does not create candidates
or write queue/job/upload-package rows; it only requires the upload payload to
remain linked to a candidate id.

Required disclosure text example:

```text
이 콘텐츠는 제휴마케팅 활동을 포함하며, 링크를 통한 구매가 발생하면 작성자에게 수수료가 지급될 수 있습니다.
```

## APIs

- `GET /api/uploads/youtube/readiness`
- `GET /api/uploads/youtube/token-readiness`
- `POST /api/uploads/youtube/prepare`
- `POST /api/uploads/youtube/execute`

The operator-facing path is `/uploads`. The dashboard builds the UTF-8 JSON payload in the browser, runs prepare only
from a button click, keeps execute disabled until prepare succeeds plus both exact approval phrases are entered, and
shows a manual Studio verification card. Do not use direct PowerShell/curl prepare or execute calls for the normal
private smoke loop.

`token-readiness` checks local token file metadata only. It reports file placement, file existence, token readiness, and scope readiness without returning token values.

`prepare` validates and returns request JSON only. It does not call YouTube.

`execute` requires:

- exact confirmation phrase
- readiness `can_upload=true`
- private or unlisted visibility
- required disclosure and affiliate URL

Without readiness and explicit approval, it returns `BLOCKED_BY_CONFIRMATION` or `BLOCKED_BY_YOUTUBE_READINESS`.

## Local Token Provider

Local token provider readiness is documented in [YOUTUBE_LOCAL_TOKEN_PROVIDER.md](YOUTUBE_LOCAL_TOKEN_PROVIDER.md).
The local OAuth helper for creating an operator-owned token file is documented in
[YOUTUBE_LOCAL_OAUTH_TOKEN_HELPER.md](YOUTUBE_LOCAL_OAUTH_TOKEN_HELPER.md).

The local token provider:

- requires the token file path to be outside this repository
- supports `YOUTUBE_LOCAL_TOKEN_FILE_PATH` first, then `YOUTUBE_TOKEN_FILE` as a fallback
- checks token file existence and metadata only
- never returns token values
- never logs token JSON
- does not run OAuth exchange
- provides server-only token material only to the approved upload adapter

## Refresh Before Upload

The server-only upload adapter refreshes the access token before creating the
YouTube resumable upload session when a `refresh_token` exists in the local token
file. This is intentionally preferred even if an `access_token` is also present,
because the stored access token may be expired or revoked.

Refresh behavior:

- Refresh uses `grant_type=refresh_token` with server-only client credentials.
- The refreshed access token is used for the resumable session request.
- The token file is updated atomically when it is outside the repository.
- If token file update fails, the adapter returns a safe warning and uses the
  refreshed token only for the current request.
- If refresh fails, the adapter returns `youtube_token_refresh_failed`,
  `reauth_required=true`, `succeeded=false`, and does not create a resumable
  upload session.
- The adapter must not fall back to a stale access token after refresh failure.

The adapter must never print access tokens, refresh tokens, client secrets,
Authorization headers, or raw Google token responses.

## Live Smoke

Live upload smoke is not run by default.

Required conditions before any live smoke:

- `RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE`
- `APPROVE_YOUTUBE_PRIVATE_UPLOAD`
- `readiness.can_upload=true`
- `token_ready=true`
- `quota_ready=true`
- visibility is `private` or `unlisted`
- `video_path_or_url` exists
- `video_path_or_url` is a local `.mp4` file
- `disclosure_text` exists
- `selected_affiliate_url` exists

If any condition is missing, report:

```text
live_upload_smoke: NOT RUN
blocked_reason: BLOCKED_BY_YOUTUBE_READINESS or BLOCKED_BY_MISSING_SMOKE_APPROVAL
```

If a previous live smoke reached YouTube but returned HTTP 401, first refresh or
re-authorize the local token. A new live smoke still requires the exact smoke
approval phrase and exact upload confirmation.

The first private smoke completed successfully for the documented smoke
candidate `candidate-video-smoke-001`. Result tracking after that smoke is a
manual verification bridge only: it records private Studio visibility, title,
Korean disclosure, and public-upload-blocked checks without calling
`/api/uploads/youtube/execute` again, without calling YouTube again, and without
writing DB/R2/queue/job/upload-package state.

## Safety Boundaries

- Public upload is blocked.
- OAuth token exchange remains local-only and approval-gated by `APPROVE_YOUTUBE_LOCAL_OAUTH_TOKEN_GENERATION`.
- OAuth token storage is not implemented in the repository.
- Access tokens and refresh tokens must never be shown in UI or logs.
- Raw Authorization headers must never be shown.
- Fake success is forbidden.
- Queue rows, worker jobs, R2 uploads, upload package rows, and platform upload result writes are not created by this adapter.
- TikTok and Threads are out of scope.

## videos.insert Boundary

The adapter performs YouTube Data API `videos.insert` only through a server-only resumable upload path after readiness, smoke approval, and exact confirmation pass. Success requires a returned YouTube video id. Missing video id, missing local mp4, missing token readiness, public visibility, or failed provider responses must return `succeeded=false`.

See [YOUTUBE_PRIVATE_UPLOAD_SMOKE.md](YOUTUBE_PRIVATE_UPLOAD_SMOKE.md) for the smoke checklist.
