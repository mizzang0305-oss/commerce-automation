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

Required disclosure text example:

```text
이 콘텐츠는 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.
```

## APIs

- `GET /api/uploads/youtube/readiness`
- `GET /api/uploads/youtube/token-readiness`
- `POST /api/uploads/youtube/prepare`
- `POST /api/uploads/youtube/execute`

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
