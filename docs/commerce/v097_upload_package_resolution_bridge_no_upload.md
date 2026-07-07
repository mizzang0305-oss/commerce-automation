# V097 Upload Package Resolution Bridge No-Upload Review

## Intent

V097 adds a no-upload diagnostic bridge for the private pilot path after V096 made V084 load the canonical V095 execution context by default.

The previous private pilot attempt had V084 context evidence, including `queueItemId` and `uploadPackageId`, but V081/V092/V094 could not resolve the corresponding upload package object. V097 distinguishes whether the failure is caused by package id, queue item id, channel key, profile, or upload request builder evidence.

## Scope

- Adds `upload:v097:package-resolution-dry-run`.
- Loads V095 context without accepting or storing an upload approval phrase.
- Builds the V084 request from context-backed values.
- Converts the request into the V081 adapter request shape.
- Calls V094 package resolution diagnostics.
- Does not call the YouTube upload adapter.

## Sanitized Diagnostics

The V097 report may include:

- `contextFound`
- `contextLoaded`
- `contextPathSafe`
- `v084UploadPackageIdPresent`
- `v084QueueItemIdPresent`
- `v081UploadPackageIdPresent`
- `v081QueueItemIdPresent`
- `resolverPackageFound`
- `resolverUploadRequestBuilt`
- `resolverBlocker`
- `packageCount`
- `packageIdMatch`
- `queueItemIdMatch`
- `channelKeyMatch`
- `uploadAssetProfileLabel`
- `cwdLabel`

It must not include raw local paths, raw affiliate URLs, raw Coupang URLs, full YouTube video IDs, full channel IDs, tokens, secrets, Authorization headers, approval phrases, or HMAC signatures.

## Safety

V097 is not an upload execution PR.

- `npm run upload:v084:private-pilot:execute --silent` is not used during V097 validation.
- `videos.insert` remains `0`.
- `commentThreads.insert` remains `false`.
- Public upload remains blocked.
- Unlisted upload remains blocked.
- Comment automation remains blocked.
- Scheduler execution remains blocked.
- V076 evidence/store/report is not created in dry-run mode.
- `SAFE_TO_UPLOAD=false`.
- `SAFE_TO_PUBLIC_UPLOAD=false`.

## Next Action

After V097 is merged, run V095 preflight, V096 execute-context dry-run, and V097 package-resolution dry-run on `main`. A private pilot retry requires a separate fresh owner approval after those no-upload checks pass.
