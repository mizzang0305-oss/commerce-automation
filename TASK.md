# TASK.md - Coupang Autopilot Full Orchestra

## Mission

Build `COUPANG_AUTOPILOT_PUBLIC_UPLOAD_COMPLETE`.

Final target:

```text
Product discovery
-> raw_coupang_url retained by system
-> Coupang Deeplink API creates selected_affiliate_url
-> video/shorts package generated
-> metadata/description/comment/disclosure generated
-> target YouTube channel verified
-> public upload executed
-> top-level comment written
-> result stored
-> duplicate guard / retry / quota / dashboard managed
```

## Non-Negotiable Rules

- No manual affiliate URL as the default path.
- No manual raw Coupang URL as the default path.
- No video-only upload package.
- No product source, no upload.
- No disclosure, no upload.
- No verified target channel, no upload.
- No duplicate guard, no upload.
- No fresh approval, no real public upload.
- No raw URL, secret, token, Authorization/HMAC signature, or full channel ID in logs or reports.
- `SAFE_TO_UPLOAD=false`; project status is `NO_UPLOAD_MANUAL_MVP_READY`, not public upload execution.

## Current Source Of Truth

- main HEAD after PR #191 merge: `cae0dca3be958b9cd9cb47d71ab93dba86b00260`
- PR #182: V071 upstream product source binding, `MERGED`
- PR #182 merge commit: `dbd7f5a7bb8771c2e7bacd2f5a0fa7880763cfcd`
- PR #183: V072 public autopilot target spec, `MERGED`
- PR #183 merge commit: `f66749e5d4e787ba0c225596a8341c5487f23327`
- PR #184: V073 upload package generator, `MERGED`
- PR #184 merge commit: `a83c9315c55a9e5a279ed8923a2f57c9bdb08a3d`
- PR #185: V074 public upload executor scaffold, `MERGED`
- PR #185 merge commit: `4fe422851e8dd006f9147064636fe4f31e271207`
- PR #186: V075 comment writer scaffold, `MERGED`
- PR #186 merge commit: `a55ff6eebc8755361bb628e32cd291def162d27d`
- PR #187: V076 upload result store scaffold, `MERGED`
- PR #187 merge commit: `8937884522c68ed73f4fae13e1cd3fc5eccc65b5`
- PR #188: V077 autopilot scheduler scaffold, `MERGED`
- PR #188 merge commit: `8682ed344aad565d590d1a8a55fbbcb873d9a7ca`
- PR #189: V078 dashboard control scaffold, `MERGED`
- PR #189 merge commit: `46cbbd07479f538b8ecaefd553557e1650c13af7`
- PR #190: V079 end-to-end no-upload dry run, `MERGED`
- PR #190 merge commit: `57683be19023695f0545c3c5817b1f8057c1d2e0`
- PR #191: V080 manual MVP operation pack / release gate, `MERGED`
- PR #191 merge commit: `cae0dca3be958b9cd9cb47d71ab93dba86b00260`
- Existing v057 corrected package: orphan / fail-closed
- Current blocker: `PR_OPEN_T011_V081_CONTROLLED_PRIVATE_UPLOAD_PILOT_REVIEW`
- `SAFE_TO_UPLOAD=false`
- PRIVATE_UPLOAD_PILOT_APPROVAL_REQUIRED=true
- PUBLIC_UPLOAD=BLOCKED
- COMMENT_AUTOMATION=BLOCKED
- SCHEDULER_EXECUTION=BLOCKED
- Public upload approval: `BLOCKED_FRESH_APPROVAL_REQUIRED`
- Comment automation approval: `BLOCKED_FRESH_APPROVAL_REQUIRED`
- Scheduler execution approval: `BLOCKED_FRESH_APPROVAL_REQUIRED`

## Status Legend

- `PENDING`
- `IN_PROGRESS`
- `BLOCKED`
- `PR_OPEN`
- `PR_MERGED`
- `DONE`

## Backlog

### T001 - Merge PR #182 V071 Upstream Product Source Binding

Status: `DONE`

Goal: Merge V071 if checks remain clean.

Safety: no upload, no readiness execution, no materializer execution in merge-only step.

Acceptance:

- PR #182 head matches expected commit.
- mergeable CLEAN.
- checks PASS.
- no CHANGES_REQUESTED.
- no unresolved P1/P2 review.
- squash merged.
- main synced.
- `SAFE_TO_UPLOAD=false`.

### T002 - V072 Public Autopilot Target Spec

Status: `DONE`

Goal: Document and test the final target architecture.

Deliverables:

- `docs/commerce/v072_public_autopilot_target_spec.md`
- `tests/v072-public-autopilot-target-spec.test.ts`

Spec must define:

- UploadPackage as the core unit.
- Product source provenance required.
- Deeplink generation default.
- YouTube public upload gate.
- Comment writer gate.
- Advanced settings gate.
- Scheduler gate.
- Dashboard control gate.
- Manual URL input only as emergency override.
- `SAFE_TO_UPLOAD=false` during buildout.

### T003 - V073 Upload Package Generator

Status: `DONE`

Goal: Generate upload packages from queue, generated content, and review package data automatically.

Requirements:

- ProductQueueItem / GeneratedContent source carried forward.
- raw_coupang_url retained internally.
- product-source manifest created with package.
- no video-only package allowed.
- package_id generated.
- per-channel package supported.
- raw URL redacted from reports.
- tests for missing product source block.

### T004 - V074 Public Upload Executor Scaffold

Status: `DONE`

Goal: Implement public upload executor behind a hard disabled gate.

Requirements:

- videos.insert adapter interface.
- mock adapter tests.
- real adapter never called unless explicit execution approval.
- advanced settings object built:
  - privacyStatus=public
  - selfDeclaredMadeForKids=false
  - containsSyntheticMedia=true
  - paidProductPlacementDetails.hasPaidProductPlacement=true
  - license=youtube
  - embeddable=true
  - publicStatsViewable=true
  - defaultLanguage=ko
  - defaultAudioLanguage=ko
- no upload in this task.

### T005 - V075 Comment Writer

Status: `DONE`

Goal: Add top-level comment writer after upload success.

Requirements:

- commentThreads.insert adapter interface.
- comment contains affiliate link and Coupang Partners disclosure.
- no comment if affiliate URL missing.
- no comment if upload failed.
- no raw affiliate URL in logs.
- mock tests only.

### T006 - V076 Upload Result Store

Status: `DONE`

Goal: Scaffold a sanitized internal upload result store contract.

Store:

- uploadResultId
- queueItemId
- platform
- visibility
- uploadedAt
- youtubeVideoIdHashPrefix
- channelIdHashPrefix
- evidencePresent booleans
- sanitizedStatus
- createdAt
- updatedAt

No raw YouTube video IDs, full channel IDs, raw URLs, secrets, tokens, or fake success.

### T007 - V077 Autopilot Scheduler

Status: `DONE`

Goal: Add autopilot scheduler policy.

Requirements:

- daily upload limit
- channel slots
- quota guard
- duplicate guard
- retry queue
- hold/manual review
- feature flag default off
- public upload default disabled until explicit enablement
- scheduler scaffold default disabled
- plan/report only; no upload/comment execution

### T008 - V078 Dashboard Control

Status: `DONE`

Goal: Dashboard controls for autopilot.

UI:

- package readiness
- today's queue
- upload slots
- blockers
- result history
- enable/disable autopilot
- daily limit
- public upload switch protected by confirmation
- no secrets exposed

### T009 - V079 End-to-End No-Upload Dry Run

Status: `DONE`

Goal: Run full no-upload dry run from product source to package readiness.

Expected:

- product source present
- Deeplink ready
- affiliate URL gate ready
- video ready
- metadata ready
- target channel ready
- duplicate risk false
- disclosure ready
- approval missing only
- `SAFE_TO_UPLOAD=false`

### T010 - V080 Manual MVP Operation Pack / Release Gate

Status: `DONE`

Goal: Build the manual MVP operation pack and release gate without public upload/comment/scheduler execution.

Requirements:

- manual operator checklist
- no-upload release gate
- public upload approval explicitly blocked
- manual operation allowed, automation execution disabled
- upload/comment/scheduler mutation blocked
- `SAFE_TO_UPLOAD=false`

### T011 - V081 Controlled YouTube Private Upload Pilot

Status: `PR_OPEN`

Goal: Add a controlled one-item YouTube private upload pilot executor behind an exact owner approval gate.

Requirements:

- public upload blocked
- comment automation blocked
- scheduler repeated execution blocked
- daily batch upload blocked
- exactly one private upload item allowed
- exact approval phrase required: `APPROVE_YOUTUBE_PRIVATE_UPLOAD_PILOT_1_ITEM_NO_COMMENT`
- default adapter blocked
- mock adapter test-only
- videos.insert allowed only after private pilot approval and readiness gates pass through an injected adapter
- upload result stored/reported as sanitized evidence only
- raw URL, full video ID, full channel ID, token, secret, Authorization, and HMAC output blocked
- `PRIVATE_UPLOAD_PILOT_APPROVAL_REQUIRED=true`
- `PUBLIC_UPLOAD=BLOCKED`
- `COMMENT_AUTOMATION=BLOCKED`
- `SCHEDULER_EXECUTION=BLOCKED`
- `SAFE_TO_UPLOAD=false`

## Latest Evidence

- 2026-07-04 KST: `TASK.md` created as sanitized source-of-truth document. PR #182 is the current merge gate. `SAFE_TO_UPLOAD=false`.
- 2026-07-04 KST: PR #182 squash merged. Main synced at `dbd7f5a7bb8771c2e7bacd2f5a0fa7880763cfcd`. T001 is complete. `SAFE_TO_UPLOAD=false`.
- 2026-07-04 KST: T002 spec and regression test drafted on `codex/v072-public-autopilot-target-spec`. Targeted test passed. `SAFE_TO_UPLOAD=false`.
- 2026-07-04 KST: T002 PR opened as PR #183 from `codex/v072-public-autopilot-target-spec`. `SAFE_TO_UPLOAD=false`.
- 2026-07-04 KST: PR #183 squash merged. Main synced at `f66749e5d4e787ba0c225596a8341c5487f23327`. T002 is complete. `SAFE_TO_UPLOAD=false`.
- 2026-07-04 KST: T003 started on `codex/v073-upload-package-generator` from main `e1409c00e19bd9d7a1f27c73f2da15d71d39e7af`. `SAFE_TO_UPLOAD=false`.
- 2026-07-04 KST: T003 implementation committed at `b64a305` and opened as PR #184: https://github.com/mizzang0305-oss/commerce-automation/pull/184. Validation passed. Upload execution was not run. Raw URLs, secrets, and full channel IDs were not printed. `SAFE_TO_UPLOAD=false`.
- 2026-07-04 KST: PR #184 P1/P2 review fix pushed at `4a71420`. Added duplicate target-channel blocking and queue/generated product-source validation hardening. Validation passed. Upload/readiness/materializer execution was not run. Raw URLs, secrets, and full channel IDs were not printed. `SAFE_TO_UPLOAD=false`.
- 2026-07-04 KST: PR #184 squash merged. Main synced at `a83c9315c55a9e5a279ed8923a2f57c9bdb08a3d`. T003 is complete. Upload/readiness/materializer execution was not run. Raw URLs, secrets, and full channel IDs were not printed. `SAFE_TO_UPLOAD=false`.
- 2026-07-04 KST: T004 started on `codex/v074-public-upload-executor-scaffold` from main `23fc8551990f9c8ff32e63937de7709496be6ef2`. `SAFE_TO_UPLOAD=false`.
- 2026-07-04 KST: T004 V074 scaffold committed at `dc71f407019de6bdeadd22025ff93f1a99ec515c` and opened as PR #185: https://github.com/mizzang0305-oss/commerce-automation/pull/185. Validation passed. Upload execution was not run. Raw URLs, secrets, and full channel IDs were not printed. `SAFE_TO_UPLOAD=false`.
- 2026-07-04 KST: PR #185 review fix pushed at `c781aed7c9f6ccb06f0d09266867ff3f60a1b610`. V074 now preserves sanitized V073 package readiness/blocker evidence and cannot override an upstream package blocker into ready state. Validation passed. Upload/readiness/materializer execution was not run. Raw URLs, secrets, and full channel IDs were not printed. `SAFE_TO_UPLOAD=false`.
- 2026-07-04 KST: PR #185 squash merged. Main synced at `4fe422851e8dd006f9147064636fe4f31e271207`. T004 is complete. Upload/readiness/materializer execution was not run. Raw URLs, secrets, and full channel IDs were not printed. `SAFE_TO_UPLOAD=false`.
- 2026-07-04 KST: T005 started on `codex/v075-comment-writer-scaffold` from main `3c71525969e2f24f9692586d5cf3fa2a4de52cba`. `SAFE_TO_UPLOAD=false`.
- 2026-07-04 KST: T005 V075 comment writer scaffold committed at `c57f62f50e3c9ba4459618d211035cfe2a0a9957` and opened as PR #186: https://github.com/mizzang0305-oss/commerce-automation/pull/186. Validation passed. Upload/readiness/materializer execution was not run. Real comment mutation was not run. Raw URLs, full video IDs, secrets, and full channel IDs were not printed. `SAFE_TO_UPLOAD=false`.
- 2026-07-04 KST: PR #186 review fix pushed at `bef5fd3f7ec6c87f456e2f33437bc688dbffacdf`. V075 now fails closed when upload result evidence is not bound to the selected package/channel. Focused validation passed. Upload execution, real comment mutation, and readiness/materializer execution were not run. Raw URLs, full video IDs, secrets, and full channel IDs were not printed. `SAFE_TO_UPLOAD=false`.
- 2026-07-04 KST: PR #186 squash merged. Main synced at `a55ff6eebc8755361bb628e32cd291def162d27d`. T005 is complete. Upload execution, real comment mutation, and readiness/materializer execution were not run. Raw URLs, full video IDs, secrets, and full channel IDs were not printed. `SAFE_TO_UPLOAD=false`.
- 2026-07-04 KST: T006 started on `codex/v076-upload-result-store-scaffold` from main `1de6d4c`. Upload result store work is scaffold-only; no upload/comment/DB/R2/product asset mutation is allowed. `SAFE_TO_UPLOAD=false`.
- 2026-07-04 KST: T006 V076 upload result store scaffold committed at `5604421` and opened as PR #187: https://github.com/mizzang0305-oss/commerce-automation/pull/187. Validation passed. Upload execution, real comment mutation, readiness/materializer execution, DB/R2/product asset writes were not run. Raw URLs, full video IDs, secrets, and full channel IDs were not printed. `SAFE_TO_UPLOAD=false`.
- 2026-07-04 KST: PR #187 squash merged. Main synced at `8937884522c68ed73f4fae13e1cd3fc5eccc65b5`. T006 is complete. Upload execution, real comment mutation, readiness/materializer execution, DB/R2/product asset writes were not run. Raw URLs, full video IDs, secrets, and full channel IDs were not printed. `SAFE_TO_UPLOAD=false`.
- 2026-07-04 KST: T007 started on `codex/v077-autopilot-scheduler-scaffold` from main `7bdcfa2`. Scheduler work is scaffold/readiness/plan-only; no upload/comment/DB/R2/product asset mutation is allowed. `SAFE_TO_UPLOAD=false`.
- 2026-07-04 KST: T007 V077 autopilot scheduler scaffold committed at `efe7055` and opened as PR #188: https://github.com/mizzang0305-oss/commerce-automation/pull/188. Validation passed. Upload execution, real comment mutation, readiness/materializer execution, DB/R2/product asset writes were not run. Raw URLs, full video IDs, secrets, and full channel IDs were not printed. `SAFE_TO_UPLOAD=false`.
- 2026-07-05 KST: PR #188 squash merged. Main synced at `8682ed344aad565d590d1a8a55fbbcb873d9a7ca`. T007 is complete. Upload execution, real comment mutation, readiness/materializer execution, scheduler auto-execution, DB/R2/product asset writes were not run. Raw URLs, full video IDs, secrets, and full channel IDs were not printed. `SAFE_TO_UPLOAD=false`.
- 2026-07-05 KST: T008 started on `codex/v078-dashboard-control-scaffold` from main `fe8eae7`. Dashboard work is scaffold/readiness/control-only; no upload/comment/scheduler auto-execution/DB/R2/product asset mutation is allowed. `SAFE_TO_UPLOAD=false`.
- 2026-07-05 KST: T008 V078 dashboard control scaffold committed at `0cda3c1` and opened as PR #189: https://github.com/mizzang0305-oss/commerce-automation/pull/189. Validation passed. Upload execution, real comment mutation, scheduler auto-execution, DB/R2/product asset writes were not run. Raw URLs, full video IDs, secrets, and full channel IDs were not printed. `SAFE_TO_UPLOAD=false`.
- 2026-07-05 KST: PR #189 squash merged. Main synced at `46cbbd07479f538b8ecaefd553557e1650c13af7`. T008 is complete. Upload execution, real comment mutation, scheduler auto-execution, DB/R2/product asset writes were not run. Raw URLs, full video IDs, secrets, and full channel IDs were not printed. `SAFE_TO_UPLOAD=false`.
- 2026-07-05 KST: T009 started on `codex/v079-end-to-end-no-upload-dry-run` from main `b55d478`. Dry-run work is local fixture / pure function / sanitized report only; no upload/comment/scheduler/webhook/DB/R2/product asset mutation is allowed. `SAFE_TO_UPLOAD=false`.
- 2026-07-05 KST: T009 V079 end-to-end no-upload dry-run committed at `4bfa792` and opened as PR #190: https://github.com/mizzang0305-oss/commerce-automation/pull/190. Validation passed. Upload execution, real comment mutation, scheduler auto-execution, n8n webhook calls, DB/R2/product asset writes were not run. Raw URLs, full video IDs, secrets, and full channel IDs were not printed. `SAFE_TO_UPLOAD=false`.
- 2026-07-05 KST: PR #190 squash merged. Main synced at `57683be19023695f0545c3c5817b1f8057c1d2e0`. T009 is complete. Upload execution, real comment mutation, scheduler auto-execution, n8n webhook calls, DB/R2/product asset writes were not run. Raw URLs, full video IDs, secrets, and full channel IDs were not printed. `SAFE_TO_UPLOAD=false`.
- 2026-07-05 KST: T010 started on `codex/v080-manual-mvp-operation-pack` from main `e4323ad`. Work is manual MVP operation pack / release gate only; no upload/comment/scheduler/webhook/DB/R2/product asset mutation is allowed. `SAFE_TO_UPLOAD=false`.
- 2026-07-05 KST: T010 V080 manual MVP operation pack committed at `ca6f19e` and opened as PR #191: https://github.com/mizzang0305-oss/commerce-automation/pull/191. Validation passed. Upload execution, real comment mutation, scheduler auto-execution, n8n webhook calls, DB/R2/product asset writes were not run. Raw URLs, full video IDs, secrets, and full channel IDs were not printed. `SAFE_TO_UPLOAD=false`.
- 2026-07-05 KST: PR #191 squash merged. Main synced at `cae0dca3be958b9cd9cb47d71ab93dba86b00260`. T010 is complete and project status is `NO_UPLOAD_MANUAL_MVP_READY`. This is manual MVP operation readiness only: an operator can review and manually upload outside automation after direct confirmation, while the system remains limited to generation, validation, and monitoring. Public upload approval, comment automation approval, and scheduler execution approval remain `BLOCKED_FRESH_APPROVAL_REQUIRED`. `SAFE_TO_UPLOAD=false`.
- 2026-07-05 KST: T011 started on `codex/v081-controlled-private-upload-pilot` from main `9b92a8b`. Work is a controlled one-item private upload pilot gate only; public upload, comment automation, scheduler execution, n8n webhook calls, DB/R2/product asset writes, and raw URL/full ID/secret output remain blocked. `SAFE_TO_UPLOAD=false`.
- 2026-07-05 KST: T011 V081 controlled private upload pilot committed at `b8dd86f` and opened as PR #192: https://github.com/mizzang0305-oss/commerce-automation/pull/192. Validation passed. Upload execution, real comment mutation, scheduler auto-execution, n8n webhook calls, DB/R2/product asset writes were not run. Raw URLs, full video IDs, secrets, and full channel IDs were not printed. `SAFE_TO_UPLOAD=false`; `SAFE_TO_PUBLIC_UPLOAD=false`.

## Current Blocker

- `PR_OPEN_T011_V081_CONTROLLED_PRIVATE_UPLOAD_PILOT_REVIEW`
- Controlled private upload pilot executor PR #192 is open for review behind an exact owner approval gate.
- Public upload remains blocked.
- Comment automation remains blocked.
- Scheduler execution remains blocked.
- Daily batch upload remains blocked.
- `PRIVATE_UPLOAD_PILOT_APPROVAL_REQUIRED=true`
- `PUBLIC_UPLOAD=BLOCKED`
- `COMMENT_AUTOMATION=BLOCKED`
- `SCHEDULER_EXECUTION=BLOCKED`
- Public upload approval: `BLOCKED_FRESH_APPROVAL_REQUIRED`
- Comment automation approval: `BLOCKED_FRESH_APPROVAL_REQUIRED`
- Scheduler execution approval: `BLOCKED_FRESH_APPROVAL_REQUIRED`
- Public upload, real comment mutation, scheduler auto-execution, and external webhook/API calls remain blocked. `SAFE_TO_UPLOAD=false`.

## Next Exact Action

- Review and merge PR #192 only after checks/review stay clean. Do not execute private pilot upload until a separate fresh `APPROVE_YOUTUBE_PRIVATE_UPLOAD_PILOT_1_ITEM_NO_COMMENT` approval and readiness gate are present. Public upload/comment/scheduler execution remains blocked until a separate fresh approval and scope. `SAFE_TO_UPLOAD=false`; `SAFE_TO_PUBLIC_UPLOAD=false`.
