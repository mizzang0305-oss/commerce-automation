# v050 YouTube Adapter Injection

v050 wires a no-upload adapter injection readiness layer for the v049 three-channel executor.

## Scope

- Locate the proven v035 upload/comment evidence.
- Reuse the existing YouTube upload adapter contract as the upload adapter source.
- Add explicit comment adapter, token provider, duplicate guard, metadata gate, and channel account routing readiness checks.
- Generate sanitized readiness artifacts under `commerce-assets/review/v050`.

## Proven Adapter Discovery

| Item | Source | Status |
| --- | --- | --- |
| Upload adapter | `src/lib/uploads/youtube/youtubeUploadAdapter.ts` | found |
| v035 public upload evidence | `commerce-assets/review/candidate-3c4f2ee364ba5b07/v035/public-upload-result.json` | found |
| Comment create evidence | `commerce-assets/review/candidate-3c4f2ee364ba5b07/v035/public-upload-result.json` | found |
| Token provider contract | `src/lib/uploads/youtube/youtubeTokenProviderContract.ts` | found |
| Metadata hardening gate | `src/lib/uploads/youtube/youtubeMetadataHardening.ts` | found |
| Post-upload verification | `src/lib/uploads/youtube/youtubeUploadResultVerification.ts` | found |

The existing `ServerYouTubeUploadAdapter` is private-upload oriented and can perform `videos.insert` only through its guarded execution path. v050 does not execute it. v050 only verifies that the v049 executor can receive explicit adapter dependencies in `check_only` mode.

## Channel Account Routing

v050 adds a channel-account readiness gate that requires:

- one configured target channel handle per channel key
- one distinct upload account alias per channel
- resolved upload account alias matching the configured target alias
- a single-OAuth shared alias risk check

This prevents a future execution path from silently using one account alias for all three channel uploads. v051 should add a final read-only YouTube account verification immediately before any live execution.

## Safety

v050 keeps these false:

- `youtube_execute_called`
- `videos_insert_called`
- `comment_create_update_delete_called`
- `upload_attempted`
- `visibility_changed`
- `R2_upload`
- `product_assets_write`
- `DB_write`
- `raw_urls_printed`
- `secrets_printed`

## Commands

```bash
npm run upload:v050:check-adapters
npm run test -- tests/v050-youtube-adapter-injection.test.ts
```

Actual upload remains blocked until a separate v051 fresh approval.
