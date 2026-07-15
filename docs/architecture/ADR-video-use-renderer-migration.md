# ADR: Adapter-Based video-use Renderer Migration

Status: Proposed for shadow evaluation only.

## Context

The repository has a documented Python worker renderer plus multiple local review renderers and a mature upload safety stack. Replacing all of them at once would couple video quality experimentation to production publication risk.

## Decision

Add a strict `VideoRenderer` contract and three execution modes:

- `legacy`: existing/default compatible local renderer behavior.
- `video_use`: pinned external CLI behind a server-only adapter, with automatic legacy fallback.
- `shadow`: run both, retain both artifacts, and mark every result non-publishable.

Photo inputs are converted to local motion clips before video-use EDL rendering. The new bridge never produces a live publisher request.

## Alternatives Considered

1. Replace the Python worker directly: rejected because it widens queue/storage/upload risk.
2. Fork and modify video-use: rejected because update cost and license tracking grow quickly.
3. Vendor helper files: rejected because source provenance and upstream updates become unclear.
4. External pinned checkout with CLI wrapper: selected because it is isolated, testable, and reversible.

## Feature Flags

```text
VIDEO_RENDERER=legacy|video_use|shadow
VIDEO_USE_ENABLED=false
VIDEO_USE_PATH=
VIDEO_USE_COMMIT=92c2b34e44c205cbc2acae7f6ca7c1c219d5dd66
VIDEO_USE_RENDER_TIMEOUT_SECONDS=300
VIDEO_USE_KEEP_INTERMEDIATE=false
VIDEO_USE_ALLOW_TTS=false
VIDEO_USE_ALLOW_REMOTE_DOWNLOAD=false
VIDEO_USE_PREVIEW_ONLY=true
LIVE_UPLOAD=false
```

Invalid or missing values fail to the legacy/default-disabled configuration.

## Shadow Semantics

Both renderers receive the same validated request. Results capture renderer, version, source hash, dimensions, duration, codecs, file size, elapsed time, quality, warnings, and errors. Shadow results have `safe_to_publish=false`, `live_upload_attempted=false`, and `comparison_only=true`.

## Security and Compliance

- New code performs no remote image download, OAuth flow, platform call, DB write, or storage upload.
- Manifests remove metadata keys containing token, secret, authorization, cookie, affiliate, URL, credential, or password.
- Disclosure is mandatory in `RenderRequest` and remains a quality/compliance condition.
- Upstream execution is server-only and pinned to an exact commit.

## Rollback

Immediate rollback requires only:

```text
VIDEO_RENDERER=legacy
VIDEO_USE_ENABLED=false
```

The legacy implementation and existing queues are not deleted or migrated.

## Consequences

Positive: isolated adoption, deterministic provenance, local media checks, and measurable comparison.

Negative: shadow mode roughly doubles compute and disk use. The audited fixture shows video-use is currently 2.7-3.0 times slower than the local legacy adapter. Upstream Windows subtitle behavior requires a local post-processing step.

## Cutover Constraint

This change prepares Stage 0-2 only. Canary, production deployment, public upload, scheduler activation, and legacy retirement require separate approvals and evidence.
