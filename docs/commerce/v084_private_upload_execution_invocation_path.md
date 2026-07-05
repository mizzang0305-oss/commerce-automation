# V084 Private Upload Execution Invocation Path

V084 adds the invocation path.

V084 is not a real upload execution PR. It provides the server-only command and invocation contract that will be used by a later fresh approval gate.

No videos.insert is called by V084 tests or plan commands. No commentThreads.insert is called by V084 tests or plan commands.

## Commands

```text
npm run upload:v084:private-pilot:plan
npm run upload:v084:private-pilot:execute
```

The plan command is always no-upload. The execute command also remains fail-closed in this PR and returns `BLOCKED_V084_REAL_EXECUTION_NOT_ALLOWED_IN_THIS_PR` when all readiness gates pass.

## Invocation Contract

The invocation request uses:

- `mode=private_upload_pilot_invocation`
- `visibility=private`
- `maxItems=1`
- exact fresh approval phrase for the later private pilot execution gate
- comment automation disabled
- scheduler execution disabled
- V083 adapter availability
- V081/V082/token/scope/asset/package/duplicate/disclosure/affiliate/target-channel readiness

## Blockers

- `BLOCKED_V084_FRESH_APPROVAL_REQUIRED`
- `BLOCKED_V084_STALE_APPROVAL_REJECTED`
- `BLOCKED_V084_SERVER_ONLY_CONTEXT_REQUIRED`
- `BLOCKED_V084_V083_ADAPTER_NOT_AVAILABLE`
- `BLOCKED_V084_VISIBILITY_MUST_BE_PRIVATE`
- `BLOCKED_V084_MAX_ITEMS_MUST_BE_ONE`
- `BLOCKED_V084_PUBLIC_UPLOAD_NOT_ALLOWED`
- `BLOCKED_V084_UNLISTED_UPLOAD_NOT_ALLOWED`
- `BLOCKED_V084_COMMENT_AUTOMATION_NOT_ALLOWED`
- `BLOCKED_V084_SCHEDULER_EXECUTION_NOT_ALLOWED`
- `BLOCKED_V084_UPLOAD_PACKAGE_REQUIRED`
- `BLOCKED_V084_QUEUE_ITEM_REQUIRED`
- `BLOCKED_V084_READINESS_NOT_READY`
- `BLOCKED_V084_REAL_EXECUTION_NOT_ALLOWED_IN_THIS_PR`
- `BLOCKED_V084_UNSAFE_REPORT_REQUESTED`

## Evidence And Redaction

V084 keeps V076 evidence integration available through the V081 private pilot result contract, but it does not create completed evidence unless a future real adapter result includes all required values:

- `youtubeVideoId`
- `channelId`
- `uploadedAt`

Reports may include booleans and hash prefixes only. Raw affiliate URLs, raw Coupang URLs, full YouTube video IDs, full channel IDs, credentials, headers, and signatures must not be printed.

## Safety

V084 keeps:

- `SAFE_TO_UPLOAD=false`
- `SAFE_TO_PUBLIC_UPLOAD=false`
- `PUBLIC_UPLOAD=BLOCKED`
- `COMMENT_AUTOMATION=BLOCKED`
- `SCHEDULER_EXECUTION=BLOCKED`

Merge of V084 only prepares the invocation path. A new fresh owner approval is required after merge before any controlled private one-item execution attempt.
