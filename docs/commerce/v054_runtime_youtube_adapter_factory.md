# v054 Runtime YouTube Adapter Factory

## Purpose

v054 resolves the v051 blocker `V051_MUTATION_ADAPTERS_NOT_INJECTED` by adding runtime factories for the YouTube upload adapter, comment adapter, token provider, channel account router, duplicate upload guard, and metadata gate.

This PR is still no-upload work. It does not execute YouTube, call `videos.insert`, create/update/delete comments, change visibility, upload to R2, write `product_assets`, write DB rows, deploy, print raw affiliate URLs, or print tokens/secrets.

## Proven Runtime Path

| Area | Evidence | Use in v054 |
| --- | --- | --- |
| v035 public upload evidence | `commerce-assets/review/candidate-3c4f2ee364ba5b07/v035/public-upload-result.json` | Confirms one public upload attempt, one `videos.insert`, one upload PUT, one comment create, no retry loop |
| v035 sanitized request | `commerce-assets/review/candidate-3c4f2ee364ba5b07/v035/public-upload-request-sanitized.json` | Confirms public visibility, one upload max, one comment max, raw affiliate URL excluded |
| Upload implementation base | `src/lib/uploads/youtube/youtubeUploadAdapter.ts` | Reuses the same resumable upload shape while adding public visibility and paid-promotion body support |
| Token contract | `src/lib/uploads/youtube/youtubeTokenFile.ts` | v054 keeps token file handling outside repo and never reports token values |
| v051 executor | `src/uploads/multi-channel/v051MutationEnabledExecutor.ts` | Receives injected runtime adapters only when `V051_EXECUTION_MODE=mutation_enabled` |

## Runtime Factories

`src/uploads/multi-channel/v054RuntimeYouTubeAdapterFactory.ts` provides:

- `buildV054RuntimeYouTubeAdapterReadiness`
- `createV054RuntimeYouTubeAdapters`
- `resolveV054RuntimeChannelAccountRoutes`

The runtime upload adapter:

- accepts only the v051 public upload contract
- reads the local reviewed MP4 path at execution time
- obtains an upload token through a safe token provider
- starts a resumable YouTube `videos.insert` session
- uploads video bytes once
- returns a video id only when the mocked or live response includes one

The runtime comment adapter:

- obtains an upload token through the same token provider path
- creates exactly one top-level comment for the uploaded video
- returns a comment id only when the mocked or live response includes one

## Channel Routing Guard

v054 keeps the three channels separated by upload account alias:

| Channel | Target handle | Upload account alias |
| --- | --- | --- |
| `father_jobs` | `@father-jobs` | `father_jobs_youtube_account` |
| `neoman_moleulgeol` | `@neoman-moleulgeol` | `neoman_moleulgeol_youtube_account` |
| `lets_buy` | `@lets-buy` | `lets_buy_youtube_account` |

The routing gate now checks resolved upload account aliases, not only configured target aliases. If all three channels resolve to one shared upload account, the gate blocks with `SINGLE_OAUTH_TOKEN_THREE_CHANNEL_RISK`.

## Execution Behavior

`upload:v051:execute` now injects v054 runtime adapters only when:

```powershell
$env:V051_EXECUTION_MODE="mutation_enabled"
```

Default behavior remains `check_only`, so the script does not upload unless mutation mode is explicitly set.

In mutation mode, v051 still requires:

- fresh v051 upload approval
- v051 paid-promotion confirmation
- v049 preflight ready
- v050 adapter readiness
- v054 runtime adapter factory readiness
- channel routing ready
- duplicate upload guard pass
- metadata gate pass

When a runtime adapter explicitly reports a YouTube mutation attempt, the v051 executor now reports the mutation flags from the adapter path. A completed three-channel runtime execution returns:

```text
FINAL_STATUS=SUCCESS_V051_THREE_CHANNEL_PUBLIC_UPLOADS_DONE
videos_insert_called=true
comment_create_update_delete_called=true
```

The v054 readiness command below remains read-only and still reports both mutation flags as `false`.

## Readiness Command

```bash
npm run upload:v054:check-runtime-adapters
```

Expected no-upload result:

```text
FINAL_STATUS=SUCCESS_V054_RUNTIME_YOUTUBE_ADAPTERS_READY_NO_UPLOAD
V054_RUNTIME_ADAPTERS_READY=true
CHANNEL_ROUTING_READY=true
SAFE_TO_UPLOAD=false
videos_insert_called=false
comment_create_update_delete_called=false
```

## Safety Boundary

v054 tests use mocked token providers and mocked fetch only. The readiness command does not call adapter upload/comment methods and does not call real YouTube APIs.

No raw affiliate URL, token, Authorization header, client secret, refresh token, or access token is written to readiness reports.

## Next Action

After PR merge, send fresh v051 approval phrases and run exactly once:

```powershell
$env:V051_EXECUTION_MODE="mutation_enabled"
npm run upload:v051:execute
```

Stop immediately after execution and verification.
