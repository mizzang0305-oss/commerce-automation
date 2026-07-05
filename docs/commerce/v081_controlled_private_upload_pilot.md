# V081 Controlled YouTube Private Upload Pilot

## Purpose

V081 adds a controlled one-item YouTube private upload pilot contract.

This is not public upload enablement.

This is not comment automation.

This is not scheduler repeated execution.

This is not a daily batch uploader.

The only allowed execution shape is one private upload item after an exact owner approval phrase and all readiness gates pass through an injected adapter.

## Approval Phrase

The required phrase is:

```text
APPROVE_YOUTUBE_PRIVATE_UPLOAD_PILOT_1_ITEM_NO_COMMENT
```

If the phrase is missing, stale, or different, V081 returns a blocked response and does not call the adapter.

## Request Contract

`V081PrivateUploadPilotRequest` carries:

- `queueItemId`
- `uploadPackageId`
- `channelKey`
- `visibility`
- `approvalPhrase`
- `commentAutomationAllowed=false`
- `schedulerExecutionAllowed=false`
- `maxItems=1`
- `targetChannelId`
- sanitized video asset evidence
- readiness booleans

Raw Coupang URLs and selected affiliate URLs may exist inside execution context, but reports must not print them.

## Result Contract

`V081PrivateUploadPilotResult` carries:

- `status=blocked | private_upload_ready | private_upload_completed`
- `mode=controlled_private_upload_pilot`
- `visibility=private`
- `safeToPublicUpload=false`
- `SAFE_TO_UPLOAD=false`
- `commentAutomationAllowed=false`
- `schedulerExecutionAllowed=false`
- `maxItems=1`
- `approvalAccepted`
- `videosInsertCalled`
- `commentThreadsInsertCalled=false`
- blockers
- upload result evidence with hash prefixes only
- V076 upload result store item/report linkage
- redaction proof

## Blockers

V081 blocks:

- missing exact owner approval phrase
- non-private visibility
- public upload requests
- unlisted upload requests
- `maxItems` other than `1`
- comment automation requests
- scheduler execution requests
- missing OAuth readiness
- missing token provider readiness
- missing video asset evidence
- missing upload package evidence
- missing affiliate URL evidence
- missing Coupang Partners disclosure evidence
- missing duplicate guard evidence
- missing target channel evidence
- missing metadata readiness
- missing quota readiness
- real adapter disabled
- unsafe report requests
- mutation attempts outside the approved private pilot path

## Adapter Behavior

The default adapter is blocked and never calls `videos.insert`.

The mock adapter is test-only and can return `videosInsertCalled=true` only when V081 gates pass.

A future real adapter must be injected explicitly and must remain behind the same gates:

- exact approval phrase accepted
- `visibility=private`
- `maxItems=1`
- comment automation disabled
- scheduler execution disabled
- OAuth/token readiness present
- video asset present
- upload package present
- affiliate/disclosure evidence present
- duplicate guard present

## Upload Result Store Integration

V081 uses the V076 upload result store contract for sanitized evidence.

The report must include only:

- `youtubeVideoIdHashPrefix`
- `channelIdHashPrefix`
- evidence-present booleans
- sanitized status fields

The report must not include:

- raw affiliate URLs
- raw Coupang URLs
- full YouTube video IDs
- full YouTube channel IDs
- OAuth tokens
- refresh tokens
- API keys
- Authorization headers
- HMAC signatures

## Current State

- T011 is code/tests/docs/PR work.
- `SAFE_TO_UPLOAD=false`
- `PRIVATE_UPLOAD_PILOT_APPROVAL_REQUIRED=true`
- `PUBLIC_UPLOAD=BLOCKED`
- `COMMENT_AUTOMATION=BLOCKED`
- `SCHEDULER_EXECUTION=BLOCKED`
- public upload remains blocked.
- comment automation remains blocked.
- scheduler repeated execution remains blocked.
- success metrics and durable operational tracking belong to later controlled public-upload work, not V081.
