# video-use Rollout Runbook

## Preconditions

1. `npm run video-use:verify` passes against the pinned commit.
2. Focused tests, typecheck, lint, build, and 1/3/6 image smoke pass.
3. `VIDEO_RENDERER=legacy`, `VIDEO_USE_ENABLED=false`, and `LIVE_UPLOAD=false` remain defaults.
4. Product source, disclosure, price/stock freshness, duplicate guard, and upload approval remain owned by existing gates.

## Stages

### Stage 0: Audit

Documentation and local fixtures only. No execution in worker or publisher paths.

### Stage 1: Local Preview

Set `VIDEO_RENDERER=video_use`, `VIDEO_USE_ENABLED=true`, and `VIDEO_USE_PREVIEW_ONLY=true` only in an isolated local process. Use local rights-cleared fixtures.

### Stage 2: Shadow

Set `VIDEO_RENDERER=shadow` in a non-production worker experiment. Preserve legacy as the only candidate output. Record success, elapsed time, file size, quality, fallback, and video-use commit. Do not promote shadow output to `PUBLISH_READY`.

### Stage 3: Internal Review

Review the ignored comparison HTML and videos. Confirm Korean text, product identity, crop, CTA, disclosure, and audio.

### Stage 4+: Separate Approval Required

Canary, partial cutover, full cutover, and legacy retirement are outside this change. Each requires an owner-approved plan, isolated account/channel, private visibility where applicable, monitoring, and tested rollback.

## Operational Defaults

- Start concurrency at 1.
- Keep render and upload queues separate.
- Treat timeout or quality failure as blocked.
- Do not retry indefinitely.
- Keep renderer name/version/commit and source hash in manifests.
