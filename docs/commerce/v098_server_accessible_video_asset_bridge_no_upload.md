# V098 Server-Accessible Video Asset Bridge / No Upload

## Purpose

V098 keeps the private pilot execution path blocked from real upload while proving that a V073/V094 upload package can only build a YouTube upload request when it has a server-accessible prepared video asset reference.

## Root Cause

V097 proved the V095 context-backed `uploadPackageId`, `queueItemId`, and `channelKey` can resolve to the same upload package, but V094 still blocked with `BLOCKED_V081_VIDEO_ASSET_MISSING`.

The package video asset points to a local v057 MP4. A local path is valid owner-review evidence, but it is not a server-accessible upload input for a YouTube runtime adapter.

## Bridge Contract

`resolveV098PreparedVideoAssetBridge` accepts:

- a V073 upload package
- an optional `PreparedVideoAssetRef`

It returns sanitized booleans:

- `videoAssetEvidencePresent`
- `preparedAssetEvidencePresent`
- `preparedAssetServerAccessible`
- `preparedAssetUploadableUrlPresent`

It returns `BLOCKED_V081_VIDEO_ASSET_MISSING` unless the prepared asset evidence is:

- normalized as `PreparedVideoAssetRef`
- `server_accessible=true`
- backed by an HTTPS `prepared_video_asset_url` or HTTPS `signed_url`
- not expired
- linked without converting a local path into a fake HTTPS URL

Storage references are intentionally not resolved in V098. A `storage_key`-only
asset, including `provider=r2` or `provider=supabase_storage`, remains blocked
until a later server-only retrieval layer materializes an uploadable HTTPS URL.

## No-Upload Safety

V098 does not:

- call `videos.insert`
- call `commentThreads.insert`
- run V084 execute
- enable public or unlisted upload
- enable comment automation
- enable scheduler execution
- create V076 upload result evidence

Raw local paths, raw signed URLs, raw affiliate URLs, full channel IDs, tokens, secrets, Authorization headers, and HMAC values remain out of dry-run reports.

## Validation Focus

Tests verify:

- local-only MP4 evidence remains blocked
- injected server-accessible prepared asset evidence can build the private upload request
- invalid, missing, non-server-accessible, storage-key-only, non-HTTPS, or expired prepared asset refs remain blocked
- V097 dry-run reports sanitized evidence only
- V092 server-only resolver accepts the prepared ref without executing upload

## Next Action

Merge V098 only after clean validation. After merge, rerun V095/V096/V097 no-upload checks on main. A separate fresh owner approval is still required before any private pilot execution attempt.

`SAFE_TO_UPLOAD=false`
`SAFE_TO_PUBLIC_UPLOAD=false`
