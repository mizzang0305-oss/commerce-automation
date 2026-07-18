# V144 V143 Worker pre-render policy gate

## Intent

Connect the merged V143 reusable creative policy to the signed Worker render path without enabling upload, public visibility, or Production rollout.

## Boundary

The server-generated `render_plan` now carries a conservative `creative_policy` evidence block. The existing V140 HMAC covers the full render plan, so the Worker rejects tampered evidence before it can be trusted.

After HMAC verification, the Python Worker combines the signed evidence with actual renderer and TTS settings and evaluates the V143 contract before FFmpeg discovery, image download, TTS, render, or storage upload.

## Fail-closed current state

The current storyboard uses a repeated product reference still, an 82 px hook, and a default 1.14 TTS speed with no approved merchant delivery style. Those facts must not be upgraded into real-usage evidence. The Worker therefore blocks the current template with explicit V143 blockers until separate reviewed work supplies truthful real-usage evidence, a compliant hook, and an approved Korean merchant TTS contract.

## Safety

- `SAFE_TO_UPLOAD=false`
- `SAFE_TO_PUBLIC_UPLOAD=false`
- no deployed Worker API call
- no production queue or object-storage mutation
- no real TTS, FFmpeg render, upload, comment, or public transition
- rollout and Worker restart require separate approval

## Rollback

Revert the V144 commit. No database, storage, queue, or secret rollback is required because this change does not deploy or mutate runtime state.
