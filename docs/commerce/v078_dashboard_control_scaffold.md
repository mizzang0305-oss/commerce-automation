# V078 Dashboard Control Scaffold

## Purpose

V078 adds a dashboard-facing control scaffold for the UploadPackage autopilot path.

This feature is not a real automatic upload or comment execution UI.

It only presents:

- upload readiness
- comment readiness
- scheduler readiness
- blocker lists
- candidate count
- blocked count
- next eligible time
- disabled scaffold-only actions

It never calls upload, comment, scheduler, DB, R2, or product asset mutation paths.

## Dashboard Control Contract

`V078DashboardControlPanel` contains:

- `version=v078`
- `title=Autopilot Scheduler: Scaffold Only`
- `mode=scaffold_only`
- `SAFE_TO_UPLOAD=false`
- `safeToUpload=false`
- `safeToComment=false`
- `schedulerEnabled=false`
- `uploadExecutionEnabled=false`
- `commentExecutionEnabled=false`
- `approvalRequired=true`
- `statusLabels`
- `sections`
- `summary`
- `blockers`
- `cards`
- `candidates`
- `actions`

The panel is built from a V077 scheduler plan and preserves only sanitized evidence.

## Readiness Cards

The scaffold exposes three dashboard cards:

- `upload_readiness`
- `comment_readiness`
- `scheduler_readiness`

Each card has:

- `readinessStatus=blocked`
- blocker names
- evidence-present booleans

The cards do not include raw affiliate URLs, raw Coupang URLs, full YouTube video IDs, full channel IDs, OAuth tokens, refresh tokens, API keys, Authorization headers, or HMAC signing material.

## Disabled Actions

Dashboard actions are present only so the UI can render disabled controls:

- `upload`
- `comment`
- `autopilot`

Every action is:

- `enabled=false`
- `state=blocked`
- `scaffoldOnly=true`

If a dashboard action handler receives a mutation attempt, it returns:

- `status=BLOCKED`
- `blocker=BLOCKED_V078_DASHBOARD_MUTATION_ATTEMPT`
- `videos_insert_called=false`
- `commentThreads_insert_called=false`
- `comment_create_update_delete_called=false`
- `visibility_changed=false`
- `fake_success=false`

## Required UI Text

Any dashboard view model derived from this scaffold must make these states visible:

- `Autopilot Scheduler: Scaffold Only`
- `SAFE_TO_UPLOAD=false`
- `실제 업로드/댓글 실행 비활성화`
- `승인 전 실행 불가`
- `차단 사유`
- `다음 후보`

## Blockers

The dashboard must surface scheduler and readiness blockers including:

- `BLOCKED_V077_SAFE_TO_UPLOAD_FALSE`
- `BLOCKED_V077_SCHEDULER_DISABLED`
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
- `BLOCKED_V078_DASHBOARD_CONTROL_SCAFFOLD_ONLY`

## Redaction Rules

Dashboard reports must not include:

- raw affiliate URLs
- raw Coupang URLs
- full YouTube video IDs
- full YouTube channel IDs
- OAuth tokens
- refresh tokens
- API keys
- Authorization headers
- HMAC signatures

Only sanitized booleans, queue/package IDs, channel keys, and hash prefixes are allowed.

## Current State

- T008 scaffold is implemented behind pure helper functions and tests.
- `SAFE_TO_UPLOAD=false`
- public upload execution remains blocked.
- real comment mutation remains blocked.
- scheduler auto-execution remains blocked.
- fresh approval is required before any future mutation task.
