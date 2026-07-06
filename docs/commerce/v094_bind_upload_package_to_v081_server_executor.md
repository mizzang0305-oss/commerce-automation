# V094 Bind Upload Package To V081 Server Executor

V094 bridges the already-bound V085/V084 upload package evidence into the V081/V092 server-only private pilot executor path.

This is a no-upload review PR. It does not authorize private upload execution, public upload, unlisted upload, comment automation, scheduler execution, webhook execution, DB writes, R2 writes, or product asset writes.

## Problem

After V093, the no-upload evidence chain could reach:

- V088 resolver: `bound`
- V087 binder: `ready_for_fresh_approval`
- V085 binder: `ready_for_fresh_approval`
- V084 plan: `ready_for_private_execution`

The single approved execute attempt still stopped before YouTube upload because V081 received no resolved upload package request from the V092 server-only executor path.

## Design

V094 adds `src/uploads/youtube/v094ServerOnlyUploadPackageRequestResolver.ts`.

The resolver:

- is guarded with `import "server-only"`
- loads V073 upload packages through the existing generator by default
- can be overridden in tests with a fake package loader
- matches `queueItemId`, `uploadPackageId`, and `channelKey`
- builds a V092 private upload request with `visibility=private` only through `buildYouTubeUploadRequest`
- keeps `execution_intent=private_execute`
- resolves target channel evidence from server-side env
- cross-checks runtime target-channel hash evidence against the V073/V085 package target-channel hash prefix
- fails closed if the request builder rejects disclosure, affiliate URL, asset, visibility, metadata, or shorts quality evidence
- returns `null` when package evidence is missing or mismatched

`src/uploads/youtube/v084PrivateUploadExecutionInvocationServer.ts` injects this resolver into the V092 server-only executor by default. Test overrides remain available.

The CLI/runtime path still uses `createV092NoUploadPrivateExecutorPlaceholder()` and does not import the server-only resolver or real upload adapter.

## Review Fixes

The V094 resolver must not create a fallback `YouTubeUploadRequest` when `buildYouTubeUploadRequest` returns `ok=false`.
Builder failures are mapped to sanitized V081 blockers and stop before adapter upload.

The resolver also must not trust the runtime target channel id by itself. It requires:

- package target-channel evidence exists
- package target-channel evidence has valid format status
- package target-channel hash prefix exists
- runtime target-channel id validates locally
- runtime target-channel hash prefix matches the package hash prefix

If target-channel evidence is missing or mismatched, the resolver returns a sanitized target-channel blocker without printing the full channel id.

## Safety

During V094 validation:

- `npm run upload:v084:private-pilot:execute --silent` is not run
- real `videos.insert` is not called
- `commentThreads.insert` is not called
- public upload is blocked
- unlisted upload is blocked
- comment automation is blocked
- scheduler execution is blocked
- fake success remains blocked
- raw affiliate URLs, raw Coupang URLs, full video IDs, full channel IDs, token values, secrets, Authorization headers, and HMAC signatures are not printed

`SAFE_TO_UPLOAD=false` and `SAFE_TO_PUBLIC_UPLOAD=false` remain unchanged.

## Evidence Rules

Completed V076 evidence/store/report can be created only after a future real adapter result includes:

- `videosInsertCalled=true`
- `youtubeVideoId`
- `channelId`
- `uploadedAt`

Blocked, no-op, or incomplete adapter results cannot create completed store evidence.

## Rollback

Revert the V094 commit. That restores the previous V092 behavior where the server-only executor requires an explicitly injected resolver and otherwise blocks before adapter upload with missing upload package evidence.

## Next Step After Merge

After merge, rerun no-upload focused validation on main. A separate fresh owner approval is still required before retrying exactly one private pilot execution.
