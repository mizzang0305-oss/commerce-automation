# V074 Public Upload Executor Scaffold

## Purpose

V074 defines the public YouTube upload executor contract for UploadPackage-driven automation.

This version is scaffold-only:

- It builds a sanitized YouTube public upload request from a V073 UploadPackage.
- It evaluates a fail-closed public upload safety gate.
- It preserves V073 upload package readiness and blockers before any V074 gate can become ready.
- It exposes blocked and mock adapters for tests.
- It does not call real YouTube APIs.
- It does not call `videos.insert`.
- It does not create comments or change visibility.
- `SAFE_TO_UPLOAD=false`.

## Request Contract

The request builder carries only execution-safe fields into the V074 request:

- `uploadPackageId`
- `channelKey`
- `videoAssetRef`
- `title`
- `description`
- `tags`
- `categoryId`
- `defaultLanguage=ko`
- `defaultAudioLanguage=ko`
- `privacyStatus=public`
- `selfDeclaredMadeForKids=false`
- `containsSyntheticMedia=true`
- `paidProductPlacementDetails.hasPaidProductPlacement=true`
- `license=youtube`
- `embeddable=true`
- `publicStatsViewable=true`
- disclosure readiness
- comment package pending state
- duplicate guard signature
- quota guard status
- approval status
- upstream V073 package readiness
- upstream V073 blocker, sanitized

Raw Coupang URLs, raw affiliate URLs, OAuth tokens, secrets, and full channel IDs are not included in reports.

## Safety Gate

Execution is allowed only if every gate is true:

- V073 package report is ready
- V073 package report blocker is null
- upload package ready
- product source ready
- Deeplink ready
- affiliate URL ready
- video asset ready
- first frame ready
- metadata ready
- description disclosure ready
- comment disclosure ready
- target channel verified
- duplicate upload risk is false
- quota ready
- OAuth ready
- public upload feature enabled
- fresh approval present

In V074, the default preflight intentionally sets public upload disabled and OAuth not ready. The scaffold therefore remains blocked.

Even with test overrides for V074 readiness fields, a V073 upstream blocker keeps the V074 gate blocked with `BLOCKED_V074_UPLOAD_PACKAGE_NOT_READY`.

## Blockers

Supported V074 blockers:

- `BLOCKED_V074_PUBLIC_UPLOAD_DISABLED`
- `BLOCKED_V074_PUBLIC_UPLOAD_APPROVAL_MISSING`
- `BLOCKED_V074_UPLOAD_PACKAGE_NOT_READY`
- `BLOCKED_V074_VIDEO_ASSET_NOT_READY`
- `BLOCKED_V074_METADATA_NOT_READY`
- `BLOCKED_V074_DISCLOSURE_NOT_READY`
- `BLOCKED_V074_TARGET_CHANNEL_NOT_VERIFIED`
- `BLOCKED_V074_DUPLICATE_UPLOAD_RISK`
- `BLOCKED_V074_YOUTUBE_OAUTH_NOT_READY`
- `BLOCKED_V074_YOUTUBE_QUOTA_NOT_READY`
- `BLOCKED_V074_REAL_ADAPTER_DISABLED`
- `BLOCKED_V074_REAL_YOUTUBE_MUTATION_FORBIDDEN`

## Adapter Modes

### Blocked Adapter

Default adapter. It always returns a blocked result with:

- `videosInsertCalled=false`
- `uploadExecutionCalled=false`
- `fakeSuccess=false`

### Mock Adapter

Test-only adapter. It returns `MOCK_ONLY` and never reports a real YouTube result.

### Real Adapter

The real adapter is disabled in V074. It must not be selected by default, and it must not connect OAuth or `videos.insert`.

## CLI

```bash
npm run upload:v074:preflight
```

The CLI prints a sanitized no-upload preflight summary. It does not write artifacts and does not mutate external systems.

## Current State

- `SAFE_TO_UPLOAD=false`
- upload execution disabled
- comment mutation disabled
- R2 / DB / product_assets writes disabled
- next task: T005 / V075 Comment Writer scaffold
