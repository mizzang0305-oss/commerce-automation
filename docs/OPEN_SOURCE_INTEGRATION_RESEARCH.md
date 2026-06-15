# Open Source Integration Research

Date: 2026-06-15

Scope: plan-only analysis for open source adoption. No runtime dependency is installed by this report. No code path, database row, upload, deployment, queue job, or live scout execution is changed.

## 1. Current Structure Summary

The current project is an in-house Next.js plus Python Worker commerce automation MVP for Coupang affiliate shorts.

Primary flow:

1. Candidate collection and import
2. Candidate analytics, seed planning, and candidate-only collector gate
3. Candidate review and queue promotion
4. Content draft and render plan preparation
5. Python Worker render
6. R2 or storage-backed product assets
7. Artifact QA
8. Upload package preparation
9. YouTube private/manual approval flow
10. Manual Studio verification and result tracking

Important modules:

- `/uploads`
  - `app/uploads/page.tsx`
  - `src/components/YouTubeProductVideoPackageFlow.tsx`
  - `src/components/RealProductAutoPilotFlow.tsx`
  - `app/api/uploads/youtube/*`
  - `src/lib/uploads/youtube/*`
  - The page separates local MVP status from domain-ready upload asset readiness. It uses explicit private/manual approval gates. It must not run public upload by default.

- Product candidates
  - `app/api/candidates/*`
  - `src/lib/candidates/*`
  - `src/lib/collectors/*`
  - `src/lib/coupang/*`
  - Candidates are intentionally separate from queue rows. Candidate-only execution gates must not create queue rows, worker jobs, render plans, or upload packages.

- Product assets and artifact QA
  - `app/api/artifacts/*`
  - `app/artifacts/page.tsx`
  - `src/components/ArtifactQaClient.tsx`
  - `src/lib/artifacts/artifactQa.ts`
  - Artifact QA is a review and state-management surface only. It must not trigger upload, worker jobs, or queue posted/uploaded state changes.

- YouTube upload path
  - `src/lib/uploads/youtube/youtubeExecuteReadiness.ts`
  - `src/lib/uploads/youtube/youtubeUploadAdapter.ts`
  - `src/lib/uploads/youtube/youtubeTokenProviderContract.ts`
  - `src/lib/uploads/youtube/uploadAssetContract.ts`
  - Execution is gated by server-side readiness, token provider readiness, server-accessible prepared asset references, and exact approval phrases. Public upload remains blocked.

- Coupang scout/import path
  - `src/lib/coupang/scoutCompatibility.ts`
  - `src/lib/coupang/coupangCandidateImport.ts`
  - `app/api/candidates/collect-coupang/route.ts`
  - `app/api/candidates/import-coupang/route.ts`
  - Live scout and import must stay bounded, approval-gated, secret-safe, and candidate-only unless explicitly expanded.

- Test structure
  - `tests/*uploads*`
  - `tests/*youtube*`
  - `tests/*coupang*`
  - `tests/*candidate*`
  - `tests/*artifact*`
  - `tests/*production*`
  - The test suite already encodes side-effect gates: no public upload, no secret exposure, no worker job creation from unsafe surfaces, and no production deploy command execution.

## 2. Open Source Candidate Applicability

Classification legend:

- Directly usable: can be adopted as a dependency after a small compatibility PR and security review.
- Partial adoption: use narrow SDK/module or workflow after a contract PR.
- Pattern only: do not add dependency yet; copy the design pattern into local contracts.
- Idea only, code risky: useful concept, but direct code/runtime is too risky for this repo now.
- Hold: license, security, or side-effect risk blocks adoption.

### Crawlee

- Likely license posture: Apache-2.0 for the primary Node/Python crawling libraries based on public package/repository metadata checked during this review.
- Fit: candidate scouting and bounded crawler diagnostics.
- Classification: partial adoption.
- Useful patterns:
  - Request queue and bounded retry policy.
  - Normalized result envelope.
  - Browserless-first crawling with optional browser fallback.
  - Per-request metadata and failure classification.
- Current project fit:
  - Good for future candidate scout workers, but only behind explicit approval and candidate-only gates.
  - Do not use to bypass site protections, login walls, CAPTCHA, or terms of service.
  - Do not let crawler output create queue rows or worker jobs directly.
- Recommendation:
  - First implement a local `ScoutProviderContract` and dry-run tests. Install Crawlee only after measured need exists.

### Trigger.dev

- Likely license posture: public package metadata reports MIT for the SDK; Trigger.dev platform materials also reference open-source/self-host licensing. Verify exact component license before adoption.
- Fit: background task orchestration and job observability.
- Classification: pattern only for now.
- Useful patterns:
  - Typed tasks.
  - Retried background jobs with observability.
  - Idempotency keys.
  - Separate dev/prod environments.
- Current project fit:
  - The repo already has `next-batch`, worker jobs, Python Worker polling, and approval-gated upload boundaries.
  - Introducing Trigger.dev runtime now would duplicate scheduler/worker responsibilities and create deployment complexity.
- Recommendation:
  - Use its design as a reference for a `JobRunEvent` and idempotency contract. Do not replace the Python Worker pipeline yet.

### Langfuse

- Likely license posture: core MIT with enterprise folders separated based on public repository metadata.
- Fit: content prompt, render plan, safety result, and AI-provider observability.
- Classification: partial adoption.
- Useful patterns:
  - Trace/span model for generation steps.
  - Prompt version metadata.
  - Evaluation/safety score capture.
  - Dataset and experiment tracking.
- Current project fit:
  - Strong fit once OpenAI/Gemini providers are actually used beyond template fallback.
  - For now, add a local trace event schema before installing an SDK.
- Recommendation:
  - Start with local `content_generation_trace` and `render_plan_trace` envelopes. Langfuse can be optional later.

### Infisical

- Likely license posture: package metadata for the Node SDK reports ISC; the platform is an open-source secrets/configuration product with separate terms that need final legal review.
- Fit: secret inventory, rotation, and environment parity.
- Classification: directly usable as an external secrets process, not as an immediate app dependency.
- Useful patterns:
  - Central secret naming.
  - Environment-scoped secret sync.
  - Secret scanning and drift detection.
  - Service identity access.
- Current project fit:
  - Very high operational value because the project has Vercel, local worker, YouTube token, Coupang, R2, Supabase, and content-provider secrets.
  - Adoption must never expose values in client diagnostics.
- Recommendation:
  - First create a secret inventory contract and validation report. Do not wire secret fetch at runtime until deploy target and secret provider are finalized.

### PostHog

- Likely license posture: core/self-hosted materials indicate MIT or open-core MIT posture; package metadata for `posthog-node` reports MIT while `posthog-js` references a repository license file.
- Fit: product analytics for operator flows and conversion funnel.
- Classification: partial adoption.
- Useful patterns:
  - Event taxonomy.
  - Funnel analysis.
  - Feature flags.
  - Session replay with privacy controls.
- Current project fit:
  - Good for measuring candidate-to-video-to-upload-package conversion.
  - High privacy risk if raw URLs, affiliate URLs, product names, or operator inputs are sent without redaction.
- Recommendation:
  - Start with a local analytics event schema and redaction tests. Install SDK only after telemetry policy is approved.

### Activepieces

- Likely license posture: open-core; public docs describe MIT core and commercial enterprise features. NPM metadata for inspected packages was incomplete, so verify exact package license before any dependency use.
- Fit: workflow builder and integration patterns.
- Classification: structure only.
- Useful patterns:
  - Visual workflow steps.
  - Connector/piece model.
  - Manual approval nodes.
  - Retry and failure surfaces.
- Current project fit:
  - Overlaps with n8n and existing internal workflow surfaces.
  - Runtime adoption risks creating parallel automation paths that bypass current safety gates.
- Recommendation:
  - Do not add Activepieces runtime. Borrow UI/workflow pattern ideas for operator-only plans.

### Windmill

- Likely license posture: mixed Apache-2.0 and AGPLv3 or AGPL-heavy depending on component; public metadata requires component-level license review.
- Fit: internal tools, scripts, and workflow execution.
- Classification: code use is risky but ideas are good.
- Useful patterns:
  - Script catalog with typed inputs.
  - Approval-gated internal tools.
  - Run history and parameter logging.
  - Self-hosted worker model.
- Current project fit:
  - Conceptually overlaps with operator command palette, runbooks, and dev/test lab.
  - Direct runtime use could introduce AGPL and operational complexity.
- Recommendation:
  - Use only as reference for internal tool UX and run history. No dependency adoption now.

### Firecrawl

- Likely license posture: AGPL-3.0 for core; SDK/UI subsets may be MIT based on public metadata.
- Fit: content extraction and website-to-markdown conversion.
- Classification: code use is risky but ideas are good.
- Useful patterns:
  - Clean page extraction.
  - Crawl result normalization.
  - Markdown output contracts.
  - Failure classification.
- Current project fit:
  - Useful for research/source extraction, but direct self-hosting may carry AGPL SaaS implications.
  - Cloud API introduces cost and data-sharing considerations.
  - Must not be used to bypass protected sites or scrape disallowed content.
- Recommendation:
  - Hold core adoption. Borrow normalized extraction contract ideas only.

### Novu

- Likely license posture: open-core; public metadata describes MIT core and commercial enterprise features.
- Fit: operator notification infrastructure.
- Classification: partial adoption.
- Useful patterns:
  - Notification workflow templates.
  - Inbox/read state model.
  - Channel routing.
  - Digest and escalation policies.
- Current project fit:
  - Useful after artifact QA and upload result tracking mature.
  - Notification sending is an external side effect and must be disabled by default.
- Recommendation:
  - Start with a disabled notification outbox contract. Do not send email, Slack, SMS, or push in the first PR.

### Stagehand

- Likely license posture: MIT based on public package/repository metadata.
- Fit: browser automation for operator QA.
- Classification: idea only, code risky.
- Useful patterns:
  - Browser action planning.
  - Read-only Studio verification scripts.
  - Robust DOM/a11y extraction.
  - Human-in-the-loop browser tasks.
- Current project fit:
  - Dangerous if it clicks YouTube Studio or production controls automatically.
  - Potentially useful for read-only browser smoke after strict allowlists and screenshot-only mode.
- Recommendation:
  - Do not add Stagehand now. Use Playwright-style explicit selectors for test environments only.

## 3. TOP 5 Priorities

1. Secret and environment inventory contract inspired by Infisical.
2. Local observability event schema inspired by Langfuse and PostHog.
3. Job and workflow run envelope inspired by Trigger.dev.
4. Scout provider result contract inspired by Crawlee and Firecrawl.
5. Disabled notification outbox contract inspired by Novu.

These are intentionally contract-first PRs. None should install a heavy runtime, trigger external services, or mutate production data.

## 4. License and Security Risks

License risks:

- AGPL or mixed-license projects require legal review before any code import, container deployment, or hosted service integration. Windmill and Firecrawl are the highest-risk candidates here.
- Open-core projects require feature-boundary review. Activepieces, Langfuse, Novu, and PostHog have core/enterprise boundaries that must be checked per component.
- NPM package license metadata may differ from platform repository licensing. Treat package metadata as a starting point, not legal approval.

Security risks:

- Crawler tools can accidentally violate site terms or collect data beyond the approved candidate scope.
- Workflow engines can bypass existing explicit approval gates if not isolated.
- Analytics and observability tools can leak product names, affiliate URLs, signed URLs, prompts, token readiness details, or operator input unless redaction is enforced.
- Notification tools can send external messages, creating irreversible side effects.
- Browser automation tools can click production controls if not strictly read-only and allowlisted.
- Secret managers improve safety only if client diagnostics never render secret values.

Required controls before dependency adoption:

- Server-only integration boundary.
- Redaction tests.
- Side-effect flags on every route.
- Disabled-by-default providers.
- No raw Authorization, token, client secret, signed asset URL, affiliate URL, or environment value in logs/UI.
- Explicit approval phrase for live scout, upload, notification, or browser automation actions.

## 5. Data Asset Strategy

The project should treat operational events as durable product data, not just logs.

Recommended event families:

- `candidate.scout.classified`
- `candidate.import.normalized`
- `candidate.review.promoted`
- `content.draft.generated`
- `render.plan.prepared`
- `worker.render.completed`
- `asset.qa.updated`
- `upload.package.prepared`
- `youtube.execute.readiness_checked`
- `youtube.private_upload.verified`

Each event should include:

- `event_id`
- `occurred_at`
- `actor_type`
- `source_surface`
- `entity_type`
- `entity_id`
- `status`
- `blocked_reasons`
- `side_effects`
- `safe_metadata`
- `redaction_version`

Do not include:

- Secret values.
- Token values.
- Raw Authorization headers.
- Raw signed URLs.
- Raw affiliate URLs.
- Raw OAuth payloads.
- Local token file content.

## 6. Monetization Connection Strategy

The strongest monetization path is not immediate automation breadth. It is reliable conversion measurement across the MVP path.

Recommended funnel:

1. Candidate discovered.
2. Candidate passes import readiness.
3. Candidate promoted.
4. Content/render plan ready.
5. Video asset ready.
6. Artifact QA passed.
7. Upload package ready.
8. Private upload verified.
9. Public upload approval, if later allowed.
10. Performance result recorded.

Business metrics:

- Candidate-to-ready-video conversion.
- Render failure rate by product category.
- Artifact QA rejection reason.
- Upload package readiness blocker distribution.
- Private upload verification pass rate.
- Time from candidate import to private verified video.
- Revenue or affiliate-click attribution only after an approved tracking design.

Open-source mapping:

- PostHog-style event taxonomy for funnel analysis.
- Langfuse-style trace metadata for prompt/render quality.
- Infisical-style secret inventory for operational safety.
- Trigger.dev-style job run envelope for reliability and retries.
- Novu-style disabled outbox for operator alerts.

## 7. PR-Level Execution Roadmap

### PR 1: Secret and Environment Inventory Contract

Goal:

- Add a redacted inventory for Vercel WebApp, local worker, YouTube token provider, Coupang, R2, Supabase, and content provider environment names.
- Inspired by Infisical, but no Infisical SDK dependency yet.

Candidate files:

- `src/lib/ops/envInventory.ts`
- `app/api/ops/env-inventory/route.ts`
- `docs/SECRET_ENV_INVENTORY.md`
- `tests/env-inventory.test.ts`
- `tests/client-secret-exposure.test.ts`

Test plan:

- Redacted configured/missing booleans only.
- No values in API/UI/docs.
- Localhost values flagged as production blockers.
- Client bundle secret exposure remains blocked.

Side effects:

- DB write: false
- Upload: false
- Queue/job creation: false
- External API call: false
- Deploy: false

Rollback plan:

- Revert the PR. It is read-only and schema-free.

Merge gate:

- `npm run test -- tests/env-inventory.test.ts tests/client-secret-exposure.test.ts`
- `npm run check:mojibake`
- `npm run lint`
- `npm run build`

### PR 2: Local Observability Event Schema

Goal:

- Add local trace/event type definitions for candidate, content, render, artifact QA, and upload readiness.
- Inspired by Langfuse and PostHog, but no SDK/network integration.

Candidate files:

- `src/lib/observability/eventTypes.ts`
- `src/lib/observability/redaction.ts`
- `docs/OBSERVABILITY_EVENT_SCHEMA.md`
- `tests/observability-event-schema.test.ts`

Test plan:

- Events reject secret-like fields.
- Events require side-effect flags.
- Events include blocked reasons and entity references.
- No network transport implementation.

Side effects:

- DB write: false
- External analytics call: false
- Upload: false
- Queue/job creation: false

Rollback plan:

- Revert the PR. No persisted data or migration.

Merge gate:

- Targeted observability tests.
- Client secret exposure tests.
- Full `npm run test` if the schema is imported by existing code.

### PR 3: Job Run Envelope and Idempotency Plan

Goal:

- Add a job/run envelope for next-batch, worker claim, render, and upload package preparation.
- Inspired by Trigger.dev task metadata, not Trigger.dev runtime.

Candidate files:

- `src/lib/jobs/jobRunEnvelope.ts`
- `docs/JOB_RUN_ENVELOPE.md`
- `tests/job-run-envelope.test.ts`
- Possibly extend existing `tests/worker-jobs.test.ts`

Test plan:

- Stable idempotency key builder.
- Side-effect summary present.
- Retry policy represented as metadata only.
- Does not create worker jobs outside `next-batch`.

Side effects:

- DB write: false in this PR.
- Worker job creation: false.
- Upload: false.

Rollback plan:

- Revert the PR. If later adopted by runtime code, roll back by returning to existing worker job payload shape.

Merge gate:

- Job envelope targeted tests.
- Existing worker job tests.
- Production preflight remains not-deployed.

### PR 4: Scout Provider Result Contract

Goal:

- Define a provider-neutral scout result contract for Coupang and future sources.
- Inspired by Crawlee request/result patterns and Firecrawl extraction contracts.
- No live scout call and no crawler dependency.

Candidate files:

- `src/lib/scout/scoutProviderContract.ts`
- `src/lib/scout/scoutResultNormalizer.ts`
- `docs/SCOUT_PROVIDER_CONTRACT.md`
- `tests/scout-provider-contract.test.ts`
- Existing Coupang scout/import tests as regression coverage.

Test plan:

- Normalizes provider result into safe candidate input.
- Caps result count.
- Requires source classification.
- Raw request URL and affiliate URL are not included in safe logs.
- Candidate-only side effects remain false.

Side effects:

- DB write: false.
- Candidate import: false in contract tests.
- External API call: false.
- Queue/job/upload package: false.

Rollback plan:

- Revert the contract PR. Existing Coupang-specific path remains.

Merge gate:

- New scout contract tests.
- Existing Coupang scout/import tests.
- No dependency install.

### PR 5: Disabled Notification Outbox Contract

Goal:

- Add a local, disabled-by-default notification outbox contract for operator alerts.
- Inspired by Novu, but no Novu SDK and no external message sending.

Candidate files:

- `src/lib/notifications/notificationOutbox.ts`
- `src/lib/notifications/notificationPolicy.ts`
- `docs/NOTIFICATION_OUTBOX_CONTRACT.md`
- `tests/notification-outbox.test.ts`

Test plan:

- Provider disabled by default.
- Message payload redacts links and secrets.
- No email/SMS/Slack/push call.
- Notification action requires explicit future approval.

Side effects:

- External notification sent: false.
- DB write: false.
- Upload: false.
- Queue/job: false.

Rollback plan:

- Revert the PR. No external provider state exists.

Merge gate:

- Notification outbox tests.
- Client secret exposure tests.
- Production preflight deploy flags false.

## 8. Test Plan

For this report-only PR:

- `git diff --check`
- Verify tracked repo changes are limited to `docs/OPEN_SOURCE_INTEGRATION_RESEARCH.md`
- Verify the report does not contain secret/token/Auth header strings or environment values.

For future implementation PRs:

- Targeted tests per PR.
- `npm run test`
- `npm run lint`
- `npm run build`
- `npm run check:mojibake`
- `npm run check:production-env`
- `npm run preflight:production-pilot`
- Python worker tests only if Python worker files are touched.
- Client secret exposure tests whenever UI/API diagnostics are touched.

## 9. Rollback Plan

Report-only rollback:

- Delete `docs/OPEN_SOURCE_INTEGRATION_RESEARCH.md`.
- No database rollback.
- No deploy rollback.
- No secret rotation.
- No object storage cleanup.

Future PR rollback rules:

- Contract-only PRs must be revertible by one commit.
- Runtime dependency PRs must include a feature flag or provider-disabled fallback.
- Any provider transport must be disabled by default.
- Any DB schema change must be isolated into a separate migration PR with rollback notes.
- Any external integration must have a no-send/no-upload test mode.

## Final Recommendation

Do not adopt any large open-source runtime immediately.

Start with local contracts:

1. Secret/environment inventory.
2. Observability event schema.
3. Job run envelope.
4. Scout provider result contract.
5. Disabled notification outbox.

Only after those contracts are stable should the project consider installing a narrow SDK. Crawlee, Langfuse, Infisical, PostHog, and Novu have the clearest future value. Firecrawl, Windmill, Activepieces, and Stagehand should remain reference material until license, operational, and side-effect risks are explicitly resolved.
