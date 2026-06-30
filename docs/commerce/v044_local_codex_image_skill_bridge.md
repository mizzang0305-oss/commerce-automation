# v044 Local Codex Image Skill Bridge

v044 adds a local bridge between Codex image-skill scene outputs and the existing v041 manual image drop review contract.

The bridge does not call OpenAI Images API, require `OPENAI_API_KEY`, install ComfyUI, install SD WebUI, upload videos, mutate YouTube comments, change visibility, write DB rows, write `product_assets`, or upload to R2.

## Flow

1. Build `commerce-assets/review/v044/local-codex-scene-prompt-package.json`.
2. Check whether a Node-callable local Codex image skill command is available.
3. Collect files saved under `commerce-assets/review/v044/local-codex-image-skill-output/`.
4. Validate 18 images with the local quality gate.
5. Copy valid images into `commerce-assets/manual-drop/v041/<channel>/`.
6. Write semantic evidence for the v041 gate.
7. Run the existing v041 review packet path only after image validation passes.

## Required Output Layout

```text
commerce-assets/review/v044/local-codex-image-skill-output/
  father_jobs/
    01-car-messy-cup-holder.png
    02-car-console-clutter.png
    03-organizer-product-reveal.png
    04-driver-organizing-items.png
    05-clean-car-console-after.png
    06-car-dashboard-cta.png
  neoman_moleulgeol/
    01-rain-window-laundry-problem.png
    02-wet-laundry-slow-dry.png
    03-small-room-laundry-mess.png
    04-drying-rack-solution-reveal.png
    05-laundry-use-case-human-hands.png
    06-organized-indoor-drying-result.png
  lets_buy/
    01-messy-desk-cables.png
    02-cable-clutter-closeup.png
    03-cable-organizer-reveal.png
    04-organized-desk-after.png
    05-before-after-cable-setup.png
    06-clean-desk-cta.png
```

## Commands

```bash
npm run image-skill:codex:check
npm run image-skill:codex:generate
npm run review:v044
```

`image-skill:codex:check` is expected to block when no local command is exposed. It still writes setup, prompt, and expected path artifacts for the operator.

## Quality Gates

- exactly 18 images
- decode success
- portrait orientation
- width at least 720
- height at least 1280
- file size over 50000 bytes
- no mosaic/checkerboard/noise/placeholder pattern
- semantic gate evidence written for v041 review

## Safety

All scripts report:

- `SAFE_TO_UPLOAD=false`
- `youtube_execute_called=false`
- `videos_insert_called=false`
- `new_upload_attempted=false`
- `comment_create_update_delete_called=false`
- `visibility_changed=false`
- `R2_upload=false`
- `product_assets_write=false`
- `DB_write=false`
- `raw_urls_printed=false`
- `secrets_printed=false`
- `fake_success=false`

Generated images and `commerce-assets/**` are local artifacts only and must not be committed.
