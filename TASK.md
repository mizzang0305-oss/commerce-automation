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
- `SAFE_TO_UPLOAD=false` until T010 receives fresh approval in the current session.

## Current Source Of Truth

- main HEAD after PR #187 merge: `8937884522c68ed73f4fae13e1cd3fc5eccc65b5`
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
- Existing v057 corrected package: orphan / fail-closed
- Current blocker: `IN_PROGRESS_T007_V077_AUTOPILOT_SCHEDULER_SCAFFOLD`
- `SAFE_TO_UPLOAD=false`

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

Status: `IN_PROGRESS`

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

Status: `PENDING`

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

Status: `PENDING`

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

### T010 - V080 One-Time Guarded Public Upload

Status: `PENDING`

Goal: Only after explicit fresh approval, execute one guarded public upload package.

Required fresh approval:

```text
APPROVE_COUPANG_AUTOPILOT_PUBLIC_UPLOAD_ONCE
CONFIRM_COUPANG_PARTNERS_DISCLOSURE_READY
CONFIRM_YOUTUBE_PUBLIC_UPLOAD_SETTINGS_READY
CONFIRM_TARGET_CHANNELS_VERIFIED
```

Do not execute this task unless fresh approval appears in the current user message/session.

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

## Current Blocker

- `IN_PROGRESS_T007_V077_AUTOPILOT_SCHEDULER_SCAFFOLD`
- Public upload and real comment mutation remain blocked. T007 must add only a scaffold/readiness/plan-only scheduler and keep `SAFE_TO_UPLOAD=false`.

## Next Exact Action

- Complete T007 V077 Autopilot Scheduler scaffold and open PR. `SAFE_TO_UPLOAD=false`.
