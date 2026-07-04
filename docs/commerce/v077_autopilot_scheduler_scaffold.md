# V077 Autopilot Scheduler Scaffold

## Purpose

V077 defines the plan-only scheduler scaffold for the UploadPackage autopilot path.

This feature is not a real automatic upload or comment executor.

It only answers:

- which queue items could be considered next
- which action would be prepared
- which evidence is present
- which blockers prevent execution
- when a candidate is next eligible for review

It never calls upload or comment adapters.

## Scheduler Plan Contract

`AutopilotSchedulerPlan` contains:

- `schedulerPlanId`
- `generatedAt`
- `mode=scaffold_only`
- `enabled=false`
- `safeToUpload=false`
- `safeToComment=false`
- `approvalRequired=true`
- `candidateCount`
- `blockedCount`
- `nextEligibleAt`
- `blockers`
- `candidates`

Candidate entries contain:

- `queueItemId`
- `uploadPackageId`
- `channelKey`
- `platform`
- `intendedAction`
- `readinessStatus`
- `nextEligibleAt`
- `evidencePresent`
- `hashPrefixes`
- `sanitizedReason`
- `blockers`

Reports expose hash prefixes and booleans only.

## Intended Actions

Supported scaffold actions:

- `upload_prepare`
- `comment_prepare`

Both actions are plan-only. They do not call:

- `videos.insert`
- `commentThreads.insert`
- comment create/update/delete
- visibility update APIs

## Default Safety

The scheduler is disabled by default:

- `enabled=false`
- `SAFE_TO_UPLOAD=false`
- `safeToUpload=false`
- `safeToComment=false`
- `approvalRequired=true`
- real adapters disabled
- mutation attempts blocked

Even a fully ready fixture remains scaffold-only until a later explicitly approved task changes the execution boundary.

## Blockers

Supported V077 blockers:

- `BLOCKED_V077_SCHEDULER_DISABLED`
- `BLOCKED_V077_SAFE_TO_UPLOAD_FALSE`
- `BLOCKED_V077_UPLOAD_FEATURE_DISABLED`
- `BLOCKED_V077_COMMENT_FEATURE_DISABLED`
- `BLOCKED_V077_APPROVAL_MISSING`
- `BLOCKED_V077_UPLOAD_RESULT_EVIDENCE_MISSING`
- `BLOCKED_V077_AFFILIATE_URL_MISSING`
- `BLOCKED_V077_COUPANG_DISCLOSURE_MISSING`
- `BLOCKED_V077_TARGET_CHANNEL_EVIDENCE_MISSING`
- `BLOCKED_V077_PUBLIC_VISIBILITY_NOT_APPROVED`
- `BLOCKED_V077_DUPLICATE_GUARD_NOT_SATISFIED`
- `BLOCKED_V077_REAL_ADAPTER_DISABLED`
- `BLOCKED_V077_MUTATION_ATTEMPT_BLOCKED`

## Redaction Rules

The scheduler report must not include:

- raw affiliate URLs
- raw Coupang URLs
- full YouTube video IDs
- full YouTube channel IDs
- OAuth tokens
- refresh tokens
- API keys
- Authorization headers
- HMAC signatures

Only sanitized booleans and hash prefixes are allowed.

## Current State

- T007 scaffold is implemented behind pure helper functions and tests.
- `SAFE_TO_UPLOAD=false`
- real public upload execution remains blocked
- real comment mutation remains blocked
- next task: review and merge the V077 PR before T008
