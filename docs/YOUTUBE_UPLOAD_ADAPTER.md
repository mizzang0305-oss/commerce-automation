# YouTube Upload Adapter

This adapter is an approval-gated server-only path for YouTube private or unlisted upload smoke.

It does not enable public upload. It does not run live upload smoke by default. It does not store OAuth tokens in the repository or expose token values to the client.

## Scope

- Provider: YouTube only.
- Visibility: `private` or `unlisted` only.
- Exact confirmation phrase: `APPROVE_YOUTUBE_PRIVATE_UPLOAD`.
- Live smoke phrase: `RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE`.
- Default behavior: blocked by readiness.
- Upload method: YouTube Data API resumable `videos.insert` from a server-accessible prepared video asset reference.
- Local `.mp4` paths are localhost diagnostics only and do not satisfy domain/serverless readiness.

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
the disclosure readable in UTF-8 and include three Korean disclosure axes:
`쿠팡파트너스`, `활동의 일환`, and `수수료`/`제공받을 수 있습니다`. Strings that look
like replacement-question-mark mojibake, for example `? ????`, are blocked with
`disclosure_text_garbled`.

## Request Requirements

YouTube upload request preparation requires:

- `candidate_id`
- `prepared_video_asset`
- `title`
- `description` or `caption`
- `disclosure_text`
- `selected_affiliate_url`
- `visibility` as `private` or `unlisted`

`public` visibility is rejected. The final description must include the affiliate disclosure text and affiliate URL.

`video_path_or_url` is deprecated for domain readiness. It may remain in a
localhost diagnostic payload, but a Windows path such as `C:\...\video.mp4`, a
relative local `.mp4` path, or a serverless `/var/task/...` path must not be
treated as upload-ready. Domain readiness requires a `PreparedVideoAssetRef`
with `server_accessible=true`, `mime_type=video/mp4`, and a resolvable
`signed_url`, `prepared_video_asset_url`, or storage reference. See
[UPLOAD_ASSET_PROVIDER_CONTRACT.md](UPLOAD_ASSET_PROVIDER_CONTRACT.md).

For the local private smoke, use `candidate-video-smoke-001`. That id is the
existing dev smoke candidate created by `/api/dev/seed` with
`mode="candidate-video-smoke"`. The YouTube adapter does not create candidates
or write queue/job/upload-package rows; it only requires the upload payload to
remain linked to a candidate id.

Required disclosure text example:

```text
※ 이 콘텐츠는 쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.
```

## APIs

- `GET /api/uploads/youtube/readiness`
- `GET /api/uploads/youtube/token-readiness`
- `POST /api/uploads/youtube/prepare`
- `POST /api/uploads/youtube/execute-readiness`
- `POST /api/uploads/youtube/execute`
- `POST /api/uploads/youtube/product-package/prepare`
- `POST /api/uploads/assets/prepare-video-asset`
- `POST /api/uploads/youtube/real-product-pilot/video-asset/prepare`

The operator-facing path is `/uploads`. The dashboard builds the UTF-8 JSON payload in the browser, runs prepare only
from a button click, keeps execute disabled until prepare succeeds plus both exact approval phrases are entered, and
shows a manual Studio verification card. Do not use direct PowerShell/curl prepare or execute calls for the normal
private smoke loop.

The `/uploads` page also renders a Korean readiness dashboard for operators. It maps each safe boolean/status gate to
Korean labels, current blocker summaries, and fix hints:

- YouTube provider configuration
- local token file path and token readiness
- `youtube.upload` scope readiness
- quota, account, and policy readiness
- `YOUTUBE_UPLOAD_ENABLED`
- manual-only and exact-approval requirements
- public upload blocked state

These labels are diagnostics only. They must not expose token values, client secrets, raw Authorization headers, webhook
URLs, or direct execution commands.

## Prepared Video Asset Prepare

`POST /api/uploads/assets/prepare-video-asset` validates an operator-provided
domain video asset reference before it is used by the product package flow. It
supports:

- `signed_url` with a future `expires_at`
- `prepared_video_asset_url`
- storage-backed `storage_key` for future R2/Supabase Storage adapters

It blocks Windows `C:\...` paths, serverless `/var/task/...` paths, relative
`.mp4` paths, missing `server_accessible=true`, missing/zero `size_bytes`,
invalid MIME types, and expired signed URLs. It returns safe blocker names and
masked display strings only. Signed URL query strings must render as
`?[redacted]`.

This endpoint is prepare-only. It must keep `external_api_called=false`,
`r2_uploaded=false`, `db_written=false`, `queue_created=false`, and
`worker_job_created=false`. It does not call `/api/uploads/youtube/execute`,
Google OAuth token endpoints, YouTube `videos.insert`, R2 write APIs, or
Supabase write APIs.

## Product Video Private Package Prepare

`POST /api/uploads/youtube/product-package/prepare` builds a copy-only package
for a real product video after the private smoke path is proven. It validates:

- `candidate_id`
- `product_name`
- `selected_affiliate_url`
- `video_path_or_url`
- `prepared_video_asset`
- `title`
- `description`
- `disclosure_text`
- `visibility=private|unlisted`

`public` visibility is rejected. The disclosure must include readable
`쿠팡파트너스`, `활동의 일환`, and `수수료`/`제공받을 수 있습니다` text and must not
look garbled.

The product package endpoint distinguishes localhost diagnostics from domain
readiness. A local path only returns a blocked package state. A package is
domain-ready only when it includes a server-accessible prepared video asset
reference.

This endpoint is prepare-only. It must return
`external_api_called=false`, `youtube_upload_executed=false`, `uploaded=false`,
`db_written=false`, `r2_uploaded=false`, `queue_created=false`,
`worker_job_created=false`, and `upload_package_created=false`.

The `/uploads` product package section may copy package JSON for manual review,
but it must not call `/api/uploads/youtube/execute` in this PR.

## One-product Real Product Video Asset Entrypoint

`POST /api/uploads/youtube/real-product-pilot/video-asset/prepare` adds the
approval-gated bridge between a candidate-only real product and the
server-accessible `video/mp4` asset required by real product auto pilot.

It validates one candidate id at a time, blocks smoke/test candidates, requires
affiliate and image readiness, and can call the approval-gated local-only video
generator for `generate_local_only`. The generated mp4 remains local evidence:
`local_only=true`, `domain_ready=false`, no raw source URL in the response, and
no R2/DB/upload side effects. `register_server_asset` validates the prepared
asset reference and persists one candidate-linked `product_assets` row only after
the schema capability precheck passes.

Candidate-only persistence requires
`supabase/migrations/009_candidate_linked_product_assets.sql`: `product_queue_id`
must be nullable and `product_candidate_id` must exist. If this schema is not
ready, the endpoint returns `PRODUCT_ASSETS_SCHEMA_REQUIRES_QUEUE_ID` before any
R2/S3 upload is attempted. It must never write `product_queue_id=""`. If storage
upload succeeds but the DB write fails, the response must include
`product_asset_orphan_object_possible` and keep `product_assets_written=false`.

The endpoint and `/uploads` UI must keep all YouTube execution, public upload,
queue/job creation, upload-package persistence, and raw URL or secret display
disabled outside the exact server asset registration path.

## Readiness Gate Resolver

The dashboard uses a dedicated readiness gate resolver so operators can see what is blocked, why it is blocked, and which
safe configuration source to inspect. It is still read-only diagnostics. It does not run token exchange, does not call
`/api/uploads/youtube/execute`, does not call YouTube, and does not write DB/R2/queue/job/upload-package state.

Resolver gates:

- `quota_ready`: YouTube 할당량 준비. Source: `YOUTUBE_QUOTA_READY`.
- `account_ready`: YouTube 계정/채널 준비. Source: `YOUTUBE_ACCOUNT_READY`.
- `policy_ready`: 업로드 정책 준비. Source: `YOUTUBE_POLICY_READY` plus `PUBLIC_UPLOAD_ENABLED=false`.
- `youtube_upload_enabled`: YouTube 업로드 기능 플래그. Source: `YOUTUBE_UPLOAD_ENABLED`.
- `public_upload_blocked`: public visibility and public upload remain blocked. Source: `PUBLIC_UPLOAD_ENABLED=false`.
- `manual_upload_only`: manual verification remains enabled.
- `approval_required`: exact approval phrases remain required.
- `token_ready`: token provider metadata only. Source names: `YOUTUBE_TOKEN_FILE`, `YOUTUBE_LOCAL_TOKEN_FILE_PATH`, and token readiness metadata.
- domain token provider readiness: `YOUTUBE_TOKEN_PROVIDER` plus safe readiness booleans such as `YOUTUBE_TOKEN_READY` and `YOUTUBE_SCOPES_READY`; local token files remain localhost diagnostics.
- `scopes_ready`: `youtube.upload` scope metadata only.
- `candidate_ready`, `video_file_ready`, `disclosure_ready`, and `prepare_ready`: dashboard form/manual checks.
- `execute_ready`: aggregate server readiness. Execute remains blocked until `readiness.can_upload=true` plus prepare and approval phrases pass.

The UI may show env names such as `YOUTUBE_CLIENT_SECRET`, but it must never show env values, token JSON, access tokens,
refresh tokens, client secret values, or Authorization headers.

`token-readiness` checks local token file metadata only. It reports file placement, file existence, token readiness, and scope readiness without returning token values.

`prepare` validates and returns request JSON only. It does not call YouTube.

`execute-readiness` is a side-effect-free dry-run for the stricter execute
contract. It combines `readiness.can_upload`, the exact upload confirmation,
and the live smoke approval phrase into a single `can_execute` boolean. It must
return non-empty `blocked_reasons` when blocked, for example
`upload_confirmation_missing` or `live_smoke_approval_missing`, and it must keep all upload side effects false.
The `/uploads` dashboard uses this endpoint to keep the execute button disabled
when server execute gates are stricter than the top-level readiness card.

The dashboard sends the same approval contract to both `execute-readiness` and
`execute`:

```json
{
  "smoke_approval": "RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE",
  "confirmation": "APPROVE_YOUTUBE_PRIVATE_UPLOAD"
}
```

If `execute-readiness` returns `can_execute=true`, the subsequent Execute
request must preserve those same fields. A later `live_smoke_approval_missing`
response means the dashboard/server contract is misaligned, not that an upload
succeeded.

`execute` requires:

- exact confirmation phrase
- readiness `can_upload=true`
- execute readiness `can_execute=true`
- private or unlisted visibility
- required disclosure and affiliate URL

Without readiness and explicit approval, it returns `BLOCKED_BY_CONFIRMATION` or
`BLOCKED_BY_YOUTUBE_READINESS` with a safe top-level `safe_error` and non-empty
`blocked_reasons`.

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
- remains localhost diagnostic metadata only for domain readiness

## Refresh Before Upload

PR #80 changes the domain upload contract so the server-only adapter no longer
treats a local token file as the production/domain token source. Local token
files remain useful for localhost diagnostics, but deployed-domain readiness
requires a server-only token provider contract.

Current contract behavior:

- `YOUTUBE_TOKEN_PROVIDER` must point to a server-accessible provider contract.
- readiness returns booleans, blockers, and safe messages only.
- token/client secret/raw Authorization values are never returned to the client.
- if no server token implementation is available, execute returns
  `server_token_provider_contract_only` instead of falling back to a local token
  file.

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
- `prepared_video_asset` exists
- `prepared_video_asset.server_accessible=true`
- `prepared_video_asset.mime_type=video/mp4`
- `disclosure_text` exists
- `selected_affiliate_url` exists

If any condition is missing, report:

```text
live_upload_smoke: NOT RUN
blocked_reason: BLOCKED_BY_YOUTUBE_READINESS or BLOCKED_BY_MISSING_SMOKE_APPROVAL
```

If a previous live smoke reached YouTube but returned HTTP 401, first refresh or
re-authorize the server token provider outside the client. A new live smoke
still requires the exact smoke approval phrase and exact upload confirmation.

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

The adapter performs YouTube Data API `videos.insert` only through a server-only resumable upload path after readiness, smoke approval, and exact confirmation pass. Success requires a returned YouTube video id. Missing video id, missing server-accessible asset reference, missing token readiness, public visibility, or failed provider responses must return `succeeded=false`.

See [YOUTUBE_PRIVATE_UPLOAD_SMOKE.md](YOUTUBE_PRIVATE_UPLOAD_SMOKE.md) for the smoke checklist.
