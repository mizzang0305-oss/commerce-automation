# V072 Public Autopilot Target Spec

Status: no-upload architecture spec

`SAFE_TO_UPLOAD=false`

## Mission

Build `COUPANG_AUTOPILOT_PUBLIC_UPLOAD_COMPLETE` as a guarded public upload system.

Target flow:

```text
Product source
-> UploadPackage
-> Coupang Deeplink API affiliate URL resolution
-> metadata, description, comment, and disclosure preview
-> target YouTube channel verification
-> duplicate and quota gates
-> one approved public upload
-> top-level comment write
-> Upload result store
-> dashboard and scheduler control
```

This document does not approve upload execution. It defines the destination architecture for later code tasks.

## Core Unit: UploadPackage

`UploadPackage` is the only unit that can reach a public upload executor.

Required fields:

- `upload_package_id`
- `channel_key`
- `product_source_provenance`
- `raw_coupang_url_ref`
- `raw_coupang_url_hash`
- `selected_affiliate_url_ref`
- `selected_affiliate_url_hash`
- `video_asset_path`
- `first_frame_asset_path`
- `metadata_payload`
- `description_payload`
- `comment_payload`
- `disclosure_payload`
- `target_youtube_channel_key`
- `target_youtube_channel_id_hash`
- `duplicate_guard_signature`
- `approval_gate_state`
- `readiness_status`

Raw URLs, tokens, Authorization values, HMAC signatures, and full channel IDs must never appear in logs, reports, dashboard payloads, PR text, or stored public artifacts.

## Product Source Provenance

Product source provenance is mandatory.

The default product path is:

```text
ProductQueueItem or GeneratedContent
-> retained raw_coupang_url inside server-only package source
-> UploadPackage product_source_provenance
```

Allowed provenance examples:

- product queue item selected by the automation
- generated content record with source product binding
- review package product-source manifest promoted by code
- upstream import record that retains the raw Coupang product URL

The system must block video-only packages. A video file without product provenance cannot be uploaded.

## Deeplink Generation Default

The production default is automatic affiliate URL generation:

```text
raw_coupang_url
-> Coupang Deeplink API
-> selected_affiliate_url
-> comment and description payloads
```

The manual affiliate URL emergency override is allowed only for emergency recovery and test fixtures.

The manual raw Coupang URL emergency override is allowed only for emergency recovery and test fixtures.

Emergency override usage must be explicit, audited, and excluded from the normal autopilot flow.

## YouTube Public Upload Gate

The YouTube public upload gate must fail closed unless all prerequisites pass:

- fresh owner approval is present in the current session
- target channel identity is verified
- upload adapter is ready
- OAuth token belongs to the intended target channel
- duplicate guard has no known risk
- quota guard is ready
- metadata hardening passes
- visibility is exactly `public`
- no retry happens after an ambiguous external mutation result

The public executor must stay disabled by default.

## Comment writer gate

The comment writer gate runs only after a successful upload result for the same `UploadPackage`.

Requirements:

- one top-level comment per uploaded video
- comment contains the selected affiliate URL
- comment contains Coupang Partners disclosure
- no comment if upload failed
- no comment if affiliate URL resolution failed
- no duplicate comment
- no raw affiliate URL in logs or reports

## Advanced settings gate

Advanced settings gate must construct and validate the exact upload settings before any public mutation:

```json
{
  "privacyStatus": "public",
  "selfDeclaredMadeForKids": false,
  "containsSyntheticMedia": true,
  "paidProductPlacementDetails": {
    "hasPaidProductPlacement": true
  },
  "license": "youtube",
  "embeddable": true,
  "publicStatsViewable": true,
  "defaultLanguage": "ko",
  "defaultAudioLanguage": "ko"
}
```

Any missing or conflicting advanced setting blocks upload.

## Scheduler gate

Scheduler gate is responsible for future autopilot control.

Required policy:

- feature flag default off
- daily public upload limit
- per-channel upload slots
- quota guard before execution
- duplicate guard before execution
- retry queue for non-mutating failures only
- hold state for manual review
- no automatic upload without current fresh approval until the project explicitly enables autopilot

## Dashboard control gate

Dashboard control gate must expose only sanitized state:

- package readiness
- product source status
- Deeplink readiness
- video asset status
- first-frame status
- target channel readiness with masked IDs only
- duplicate guard state
- approval blocker state
- upload result history
- autopilot enable/disable control
- daily limit control
- protected public upload switch

The dashboard must not expose secrets, raw URLs, Authorization values, HMAC signatures, OAuth tokens, refresh tokens, or full channel IDs.

## Upload Result Store

Upload result store records sanitized execution results only.

Fields:

- `upload_package_id`
- `youtube_video_id`
- `youtube_video_url_hash` or sanitized URL evidence
- `channel_key`
- `channel_id_hash`
- `visibility`
- `comment_status`
- `comment_id`
- `affiliate_url_hash`
- `raw_coupang_url_hash`
- `duplicate_guard_signature`
- `uploaded_at`
- `final_status`

No secrets, raw Coupang URLs, raw affiliate URLs, or full channel IDs are stored.

## Fail-Closed Blockers

The system must report one of these blockers before any mutation if a dependency is missing:

- `BLOCKED_UPLOAD_PACKAGE_PRODUCT_SOURCE_MISSING`
- `BLOCKED_DEEPLINK_AFFILIATE_URL_NOT_READY`
- `BLOCKED_VIDEO_ASSET_NOT_READY`
- `BLOCKED_FIRST_FRAME_NOT_READY`
- `BLOCKED_DISCLOSURE_MISSING`
- `BLOCKED_TARGET_CHANNEL_NOT_VERIFIED`
- `BLOCKED_DUPLICATE_UPLOAD_RISK`
- `BLOCKED_YOUTUBE_OAUTH_NOT_READY`
- `BLOCKED_YOUTUBE_QUOTA_NOT_READY`
- `BLOCKED_PUBLIC_UPLOAD_APPROVAL_MISSING`

## No-Upload Safety State

V072 is a target specification only.

Forbidden in this task:

- YouTube upload execution
- `videos.insert`
- comment create, update, or delete
- visibility changes
- R2 writes
- DB writes
- `product_assets` writes
- generated media commits
- secret or raw URL output

`SAFE_TO_UPLOAD=false` until the later guarded public upload task receives fresh approval in the current session.
