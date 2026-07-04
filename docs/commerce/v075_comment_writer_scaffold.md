# V075 Comment Writer Scaffold

## Purpose

V075 defines the disabled YouTube top-level comment writer contract for UploadPackage-driven automation.

This version is scaffold-only:

- It builds a CommentPackage from a V073 UploadPackage and sanitized upload-result evidence.
- It builds a YouTube top-level comment request with internal-only video ID, comment text, and affiliate URL.
- It evaluates a fail-closed comment safety gate.
- It exposes blocked and mock adapters for tests.
- It does not call real YouTube APIs.
- It does not call `commentThreads.insert`.
- It does not create, update, or delete comments.
- `SAFE_TO_UPLOAD=false`.

## Comment Package Contract

The package carries execution-required fields internally:

- `uploadPackageId`
- `channelKey`
- internal `youtubeVideoId`
- `youtubeVideoIdHash`
- internal `affiliateUrl`
- `affiliateUrlHash`
- internal `commentText`
- Coupang Partners disclosure readiness
- affiliate URL readiness
- upload result status
- upload visibility
- target channel verification
- duplicate guard signature
- approval required
- `commentWriteAllowed=false`

Reports include only sanitized hash prefixes and booleans. Raw affiliate URLs, raw Coupang URLs, full video IDs, full channel IDs, OAuth tokens, refresh tokens, secrets, and signing material are not included in reports.

## Safety Gate

Comment writing can only become gate-ready if every input is true:

- upload result is present
- upload result status is `uploaded_public` or `uploaded`
- YouTube video ID is present internally
- upload visibility is `public`
- affiliate URL is ready
- Coupang Partners disclosure is present
- comment text is ready
- target channel is verified
- duplicate guard passed
- public upload package is ready
- comment feature enabled
- fresh comment approval present

In V075, the default preflight intentionally sets comment feature disabled and approval missing. The scaffold therefore remains blocked.

Even if tests override every readiness field to true, the report remains scaffold-only with `BLOCKED_V075_REAL_ADAPTER_DISABLED` and no real mutation call.

## Blockers

Supported V075 blockers:

- `BLOCKED_V075_COMMENT_WRITER_DISABLED`
- `BLOCKED_V075_UPLOAD_RESULT_MISSING`
- `BLOCKED_V075_VIDEO_ID_MISSING`
- `BLOCKED_V075_UPLOAD_NOT_PUBLIC`
- `BLOCKED_V075_AFFILIATE_URL_MISSING`
- `BLOCKED_V075_COUPANG_DISCLOSURE_MISSING`
- `BLOCKED_V075_COMMENT_TEXT_MISSING`
- `BLOCKED_V075_TARGET_CHANNEL_NOT_VERIFIED`
- `BLOCKED_V075_DUPLICATE_GUARD_NOT_PASSED`
- `BLOCKED_V075_COMMENT_APPROVAL_MISSING`
- `BLOCKED_V075_REAL_COMMENT_MUTATION_FORBIDDEN`
- `BLOCKED_V075_REAL_ADAPTER_DISABLED`

## Adapter Modes

### Blocked Adapter

Default adapter. It always returns a blocked result with:

- `commentCreateCalled=false`
- `commentThreadsInsertCalled=false`
- `fakeSuccess=false`

### Mock Adapter

Test-only adapter. It returns `MOCK_ONLY` and never reports a real YouTube comment result.

### Real Adapter

The real adapter is disabled in V075. It must not be selected by default, and it must not connect OAuth or `commentThreads.insert`.

## CLI

```bash
npm run upload:v075:preflight
```

The CLI prints a sanitized no-comment-mutation preflight summary. It does not write artifacts and does not mutate external systems.

## Current State

- `SAFE_TO_UPLOAD=false`
- upload execution disabled
- comment mutation disabled
- R2 / DB / product_assets writes disabled
- next task: T006 / V076 Upload Result Store
