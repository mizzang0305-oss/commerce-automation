# v037 Three-Channel Commerce Review Packets

v037 turns the merged v036 multi-channel router into local-only review packets for three separate Shorts channels:

- `father_jobs`
- `neoman_moleulgeol`
- `lets_buy`

This is not an upload release. It only prepares channel-specific review materials and keeps `SAFE_TO_UPLOAD=false`.

## Flow

1. Select one distinct product candidate per channel.
2. Generate five channel-specific hooks and one selected hook.
3. Build a short script preview, comment preview, and metadata preview.
4. Build seven scene prompts per channel for local image-skill review assets.
5. Generate local scene artifacts and a local review video under `commerce-assets/review/v037/`.
6. Write one review console per channel.
7. Stop at `PENDING_HUMAN_REVIEW`.

## Outputs

Top level:

- `commerce-assets/review/v037/three-channel-review-plan.json`
- `commerce-assets/review/v037/three-channel-routing-summary.html`

Each channel:

- `review-console.html`
- `local-review-video.mp4`
- `scene-manifest.json`
- `hook-script-preview.json`
- `comment-preview.json`
- `youtube-metadata-preview.html`
- `human-review-decision.json`

## Review Decision Defaults

```json
{
  "version": "v037",
  "channel_key": "<channel_key>",
  "human_review_status": "PENDING_HUMAN_REVIEW",
  "metadata_review_status": "PENDING_METADATA_REVIEW",
  "safe_to_upload": false,
  "requires_fresh_upload_approval": true
}
```

## Safety Boundary

The v037 generator does not call YouTube Execute, `videos.insert`, comment APIs, R2, DB, `product_assets`, or production deploy paths. It must not commit `commerce-assets`, `.env.local`, `AGENTS.md`, or generated media artifacts.

The comment and metadata previews use a masked affiliate URL only. Raw affiliate URLs, product image URLs, asset URLs, tokens, secrets, Authorization headers, and auth codes must not be printed.

## Validation

Required before PR:

```bash
npm run test -- tests/v037-three-channel-review-packets.test.ts
npm run test -- tests/v036-multi-channel-commerce-router.test.ts
npm run test -- uploads
npm run test -- tests/youtube-disclosure-guard.test.ts
npm run test -- tests/youtube-metadata-korean-hardening.test.ts
npm run check:mojibake
npm run lint
npm run test
npm run build
git diff --check
git status --short
```
