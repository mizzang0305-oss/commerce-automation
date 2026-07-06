# V092 Server-Only YouTube Private Upload Executor Boundary

V092 injects the server-only YouTube private upload executor boundary for the controlled one-item private pilot path.

This is a no-upload review PR. It does not authorize private upload execution, public upload, unlisted upload, comment automation, scheduler execution, webhook execution, DB writes, R2 writes, or product asset writes.

## Scope

- Mode: server-only private executor boundary
- Allowed future visibility: `private`
- Future max items: `1`
- CLI validation: no-upload placeholder only
- Server wiring: actual YouTube executor factory behind `import "server-only"`
- V076 evidence/store/report: completed only after complete adapter success evidence

## Design

The boundary is split into two modules:

- `src/uploads/youtube/v092PrivateUploadExecutorBoundary.ts`
  - shared types
  - no-upload placeholder executor
  - blocked result helper
  - sanitized resolver-blocker result support
  - safe for CLI/runtime validation
- `src/uploads/youtube/v092ServerOnlyYouTubePrivateUploadExecutor.ts`
  - imports `server-only`
  - creates `ServerYouTubeUploadAdapter`
  - obtains the upload token through the existing server upload token provider
  - requires an upload request resolver before any adapter call
- `src/uploads/youtube/v094ServerOnlyUploadPackageRequestResolver.ts`
  - imports `server-only`
  - resolves the already-bound V073/V085 upload package evidence into a V092 private upload request
  - fails closed on invalid `buildYouTubeUploadRequest` output
  - verifies runtime target-channel hash evidence against bound package evidence
  - never prints raw URLs, full channel IDs, token values, Authorization headers, or signatures

`src/uploads/youtube/v084PrivateUploadExecutionInvocationRuntime.ts` uses only the no-upload placeholder. `src/uploads/youtube/v084PrivateUploadExecutionInvocationServer.ts` is the only V084 path that injects the server-only executor.

V094 wires the server-only V084 path to a default upload package request resolver. The CLI/runtime path remains on the no-upload placeholder and is still safe for focused validation.

## Completion Evidence

The executor can return completed upload evidence only when all of these are true:

- `videosInsertCalled=true`
- adapter success is true
- sanitized YouTube video evidence is present
- sanitized channel evidence is present
- upload timestamp is present

If any evidence is missing, the result remains blocked with no completed V076 store/report.

## Safety

During V092 validation:

- real `videos.insert` is not called
- `commentThreads.insert` is not called
- public upload is blocked
- unlisted upload is blocked
- comment automation is blocked
- scheduler execution is blocked
- fake success remains blocked
- raw affiliate URLs, raw Coupang URLs, full video IDs, full channel IDs, credentials, headers, and signatures are not printed

`SAFE_TO_UPLOAD=false` and `SAFE_TO_PUBLIC_UPLOAD=false` remain unchanged.

## Next Step After Merge

After merge, the next step is a fresh owner-approved private pilot execution gate on main. The V092 PR itself is not an execution approval.
