# V076 Upload Result Store Scaffold

## Purpose

V076 defines the internal upload result store contract for UploadPackage-driven automation.

This version is scaffold-only:

- It builds a sanitized store item from runtime upload result evidence.
- It stores hash prefixes and booleans, not raw YouTube IDs or raw URLs.
- It exposes a sanitized report for readiness and review.
- It gives V075 a store-evidence gate so the comment writer remains blocked when upload result evidence is absent, mismatched, non-public, or incomplete.
- It does not call real YouTube APIs.
- It does not call `videos.insert`.
- It does not call `commentThreads.insert`.
- It does not write DB, R2, or `product_assets`.
- `SAFE_TO_UPLOAD=false`.

## Store Contract

The store item contains:

- `uploadResultId`
- `uploadPackageId`
- `queueItemId`
- `channelKey`
- `platform`
- `visibility`
- `uploadedAt`
- `youtubeVideoIdHashPrefix`
- `channelIdHashPrefix`
- `evidencePresent`
- `sanitizedStatus`
- `createdAt`
- `updatedAt`

`evidencePresent` records only booleans:

- upload result ID present
- queue item ID present
- uploaded time present
- visibility present
- YouTube video ID hash prefix present
- channel ID hash prefix present
- target channel verified
- duplicate guard passed
- public upload package ready

The contract does not store or report raw YouTube video IDs, full channel IDs, raw Coupang URLs, raw affiliate URLs, OAuth tokens, refresh tokens, secrets, Authorization headers, or HMAC signing material.

## Sanitized Status

- `stored`: all required evidence is present and visibility is `public`.
- `missing`: required evidence is absent.
- `blocked`: required evidence is present but the result is not public.

Non-public evidence must not unblock the comment writer.

## V075 Comment Writer Connection

`buildV076CommentWriterEvidenceGate` checks whether a stored result belongs to the selected upload package and channel.

The gate returns:

- upload result evidence presence
- video/channel hash prefix presence
- V075-compatible upload status and visibility fields
- target channel verification
- duplicate guard state
- public upload package readiness
- blocker if missing or mismatched
- `commentWriteAllowed=false`
- `safeToUpload=false`

This is only a scaffold connection. V075 still cannot perform real comment mutation, and V076 does not provide raw video IDs to reports.

## Safety

V076 reports all external mutation flags as false:

- `videos_insert_called=false`
- `comment_create_update_delete_called=false`
- `visibility_changed=false`
- `R2_upload=false`
- `DB_write=false`
- `product_assets_write=false`
- `fake_success=false`

The upload result store scaffold is local contract/readiness work only.

## Current State

- T006 scaffold is implemented behind sanitized helpers and tests.
- `SAFE_TO_UPLOAD=false`
- real upload execution remains blocked
- real comment mutation remains blocked
- next task: open and merge V076 PR before T007
