# Platform Upload Core

This layer prepares platform upload settings, provider readiness, and copy-only upload job plans for YouTube, TikTok, and Threads.

It does not execute uploads.

## Scope

Included:

- `PlatformUploadProvider` type: `youtube`, `tiktok`, `threads`.
- `PlatformUploadSettings` defaults.
- `PlatformUploadReadiness` model with blocked reasons.
- `PlatformUploadJobPlan` model.
- `GET /api/uploads/platform-readiness`.
- `POST /api/candidates/[id]/platform-upload-plan`.
- `/uploads` readiness page.
- YouTube private/unlisted adapter scaffold and local token metadata readiness. See `docs/YOUTUBE_UPLOAD_ADAPTER.md` and `docs/YOUTUBE_LOCAL_TOKEN_PROVIDER.md`.

Not included:

- Live YouTube `videos.insert` execution.
- TikTok Direct Post.
- Threads publish.
- OAuth token exchange.
- Token storage.
- Public upload.
- Upload job execution.
- DB writes.

## Default Safety Settings

```text
youtube_upload_enabled=false
tiktok_upload_enabled=false
threads_upload_enabled=false
public_upload_enabled=false
manual_upload_only=true
approval_required=true
default_visibility=private
```

The default readiness response blocks every provider until provider configuration, token readiness, scopes, quota, account, policy, upload-enabled, and manual-only gates are satisfied by a future explicitly approved PR.

The YouTube adapter adds provider-specific readiness, local token metadata readiness, request preparation, and exact confirmation gates for `private` and `unlisted` visibility only. Public visibility remains blocked, OAuth token values are never accepted from the UI, and live smoke remains `NOT RUN` unless the separate smoke phrase and readiness evidence are present.

## APIs

### `GET /api/uploads/platform-readiness`

Returns safe settings, readiness cards, blocked reasons, and false side effects.

It must not print or return tokens, refresh tokens, provider secrets, raw Authorization headers, Supabase service role keys, R2 keys, or any OAuth payloads.

### `POST /api/candidates/[id]/platform-upload-plan`

Creates a generated-on-read upload job plan for manual review.

Required inputs:

- `video_path_or_url`
- `disclosure_text`
- candidate `product_name`
- candidate `selected_affiliate_url`
- `provider_targets`

Allowed visibility:

- `private`
- `unlisted`

Public visibility remains out of scope.

The response keeps all side effects false:

```json
{
  "uploaded": false,
  "platform_api_called": false,
  "token_exchanged": false,
  "token_stored": false,
  "db_written": false,
  "queue_created": false,
  "worker_job_created": false,
  "upload_package_created": false
}
```

## Operator UI

`/uploads` is read-only. It shows provider readiness, blocked reasons, and default safety settings.

It must not contain a live upload button, worker execution button, deploy button, DB write action, token entry form, or provider OAuth flow.

## Future PRs

Recommended split:

1. YouTube adapter behind `APPROVE_YOUTUBE_PRIVATE_UPLOAD`.
2. Server-only token provider execution mechanism.
3. TikTok and Threads readiness adapters.
4. Private/unlisted live upload smoke only after explicit operator approval and provider readiness evidence.
