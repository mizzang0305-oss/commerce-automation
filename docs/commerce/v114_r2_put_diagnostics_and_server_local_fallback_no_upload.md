# V114 R2 PUT Diagnostics And Server-Local Fallback

## Intent

V114 improves the failed R2 preparation boundary without performing an R2 PUT or a YouTube upload during PR validation.

It provides two related controls:

1. R2 PUT failures retain only the HTTP status and an allowlisted safe error code.
2. The canonical v057 `father_jobs` MP4 can be read directly by the server-only YouTube adapter when R2 is not used.

## R2 diagnostics

The uploader preserves:

- `request_attempted`
- `http_status`
- `safe_error_code`

The safe code is either an allowlisted S3-compatible error code or a status-class fallback. The response message, response body, request URL, Authorization header, access key, secret key, signature, request id, and host id are not retained in reports.

The existing PUT request shape is intentionally unchanged. V114 diagnoses permission, target, signature, throttling, server, and network failures without retrying.

## Server-local fallback

The fallback accepts only this canonical file:

```text
commerce-assets/review/v057/father_jobs/corrected-preview-v057.mp4
```

The report and prepared asset do not contain that absolute path. They contain an opaque storage key, byte size, and SHA-256 evidence.

The server-local reader:

- is available only through a server-only module;
- accepts only the exact opaque V114 storage key;
- rereads the canonical file immediately before adapter delegation;
- requires byte size and SHA-256 evidence to match;
- rejects arbitrary paths, traversal keys, missing files, empty files, and changed files;
- does not write R2, DB, product assets, or local metadata.

The generic `local_dev` provider remains blocked. Only `server_local_file` with an injected server reader can reach the adapter byte-loading step.

## Approval boundary

The local execution command exists but was not run during V114 validation:

```text
npm run upload:v114:local-private-pilot:execute --silent
```

It requires both fresh values in the same execution process:

```text
APPROVE_V114_SERVER_LOCAL_ASSET_PREPARE_ONCE
APPROVE_YOUTUBE_PRIVATE_UPLOAD_PILOT_1_ITEM_NO_COMMENT
```

The first approval authorizes one canonical local-file read for the private pilot. The second authorizes exactly one private YouTube upload with no comment. Neither approval enables public, unlisted, comment, scheduler, n8n, DB, R2, or product-assets mutation.

## Validation safety

- Real R2 PUT calls: `0`
- Real YouTube `videos.insert` calls: `0`
- `commentThreads.insert` calls: `0`
- Public/unlisted upload: blocked
- Scheduler/comment automation: blocked
- Fake success: false
- Raw URLs, file paths, IDs, credentials, Authorization, and signatures: not printed
- `SAFE_TO_UPLOAD=false`
- `SAFE_TO_PUBLIC_UPLOAD=false`

## Rollback

Revert the V114 commit. The existing HTTPS/R2 prepared-asset path remains the default when the V114 local command is not used.
