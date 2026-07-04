# V080 No-Upload Release Gate

## Purpose

V080 keeps the automation path closed while allowing maintainers to inspect the manual MVP operation pack.

The release gate is intentionally conservative:

- no public upload approval is accepted in this task
- no comment automation approval is accepted in this task
- no scheduler execution approval is accepted in this task
- no real adapter is enabled
- mutation attempts remain blocked

## Release Gate Behavior

The report keeps these values fixed:

- `safeToUpload=false`
- `publicUploadApproval=missing`
- `automationExecutionAllowed=false`
- `releaseGate.publicUploadBlocked=true`
- `releaseGate.commentAutomationBlocked=true`
- `releaseGate.schedulerExecutionBlocked=true`

`releaseGate.noUploadMvpReady=true` only means the local scaffold chain is connected and the manual operation checklist can be reviewed. It is not permission to upload.

## Required Blockers

V080 reports these blockers by design:

- `BLOCKED_V080_SAFE_TO_UPLOAD_FALSE`
- `BLOCKED_V080_PUBLIC_UPLOAD_APPROVAL_MISSING`
- `BLOCKED_V080_COMMENT_AUTOMATION_APPROVAL_MISSING`
- `BLOCKED_V080_SCHEDULER_EXECUTION_APPROVAL_MISSING`
- `BLOCKED_V080_REAL_ADAPTER_DISABLED`
- `BLOCKED_V080_MUTATION_ATTEMPT_BLOCKED`
- `BLOCKED_V080_N8N_LIVE_EXECUTION_NOT_APPROVED`
- `BLOCKED_V080_SECRETS_NOT_EXPOSED_BY_DESIGN`

If the V079 dry run is not complete, the report also includes:

- `BLOCKED_V080_NO_UPLOAD_DRY_RUN_NOT_PASSED`

## Redaction Rules

The release gate report must not include:

- raw affiliate URLs
- raw Coupang URLs
- full YouTube video IDs
- full YouTube channel IDs
- OAuth tokens
- refresh tokens
- API keys
- Authorization headers
- HMAC signatures

Only sanitized booleans, blocker names, readiness flags, and hash prefixes from upstream scaffolds are allowed.

## Exit Criteria For A Future Task

A later task may move beyond V080 only with a separate fresh approval and a new scoped implementation plan.

That future task must prove:

- target channel evidence is still valid
- duplicate guard still passes
- disclosure and paid-promotion settings are still ready
- upload package evidence is complete
- affiliate/deeplink evidence is complete
- post-upload result storage is defined
- comment writer reads upload-result evidence
- scheduler and dashboard remain disabled unless explicitly enabled

Until then, `SAFE_TO_UPLOAD=false`.
