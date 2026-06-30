# v046 Agent Image Skill Handoff

v046 restores the proven v035 renderer path for three channel review packets, but it does not try to make Node call the Codex image skill. The operator generates the images through the Codex agent image tool, saves the local files, and the repo only validates and consumes those files.

## Scope

- Version: `v046`
- Source image root: `commerce-assets/review/v046/generated-scenes/`
- Required image count: 18
- Channels: `father_jobs`, `neoman_moleulgeol`, `lets_buy`
- Renderer: proven v035 renderer adapter
- Upload state: `SAFE_TO_UPLOAD=false`

## Flow

1. Generate six photorealistic 9:16 images per channel with the Codex agent image skill.
2. Save the actual local image files under `commerce-assets/review/v046/generated-scenes/<channel>/`.
3. Run `npm run review:v046`.
4. The handoff manifest validates local files, image dimensions, file size, semantic gate flags, and URL-only failure.
5. Only after the quality gate passes, v046 maps the six channel images into the v035 eight-scene renderer contract.
6. The v035 renderer creates per-channel local review packets.

## Required Artifacts

- `commerce-assets/review/v046/agent-image-skill-handoff-manifest.json`
- `commerce-assets/review/v046/generated-image-contact-sheet.jpg`
- `commerce-assets/review/v046/real-image-semantic-summary.json`
- `commerce-assets/review/v046/<channel>/local-review-video.mp4`
- `commerce-assets/review/v046/<channel>/review-console.html`
- `commerce-assets/review/v046/<channel>/human-review-decision.json`
- `commerce-assets/review/v046/<channel>/review-summary.json`

## Safety

The v046 workflow does not call YouTube Execute, `videos.insert`, comment APIs, visibility mutation, R2, `product_assets`, DB writes, or production deploys. Generated images and all `commerce-assets` outputs are local review artifacts and must not be committed.

## Blockers

- `BLOCKED_V046_AGENT_IMAGE_SKILL_OUTPUT_QUALITY_FAIL`: at least one of the 18 local images is missing, not decodable, too small, not portrait, too small in bytes, URL-only, or fails semantic quality.
- `BLOCKED_V035_SUCCESS_PIPELINE_NOT_REUSABLE`: the v035 generator contract is unavailable.
- `BLOCKED_V046_AGENT_IMAGE_SKILL_HANDOFF`: the quality gate passed but the v035 renderer did not create all three channel review packets.
