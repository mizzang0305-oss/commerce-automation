# v047 Restore v035 Korean Voice Provider

## Goal

v047 restores the proven v035 Korean voice provider contract for the three-channel v046 image set.

It does not upload, comment, change visibility, write DB rows, upload to R2, or write `product_assets`.

## Inputs

- Source images: `commerce-assets/review/v046/generated-scenes/**`
- Source renderer: v035 image-skill scene Shorts generator
- Voice provider: approved local `KOREAN_VOICE_PROVIDER=local_command`

## Required Local Voice Contract

The local command must already be installed outside committed files and must support:

```text
<local command> --script <voiceover-script.txt> --output <voiceover.wav> --language ko --format wav
```

Required readiness flags:

- `KOREAN_VOICE_PROVIDER=local_command`
- `KOREAN_VOICE_PROVIDER_APPROVED=true`
- `KOREAN_VOICE_COMMAND` present
- Korean language starts with `ko`
- Windows SAPI markers absent
- OpenAI, ElevenLabs, Naver, Google, Azure, cloud, or API markers absent

Raw command values, paths, affiliate URLs, and secrets are not printed.

## Blockers

- Missing v046 generated images: `BLOCKED_V046_GENERATED_IMAGES_MISSING`
- v046 image quality fail: `BLOCKED_V046_AGENT_IMAGE_SKILL_OUTPUT_QUALITY_FAIL`
- Local Korean voice provider not reproducible: `BLOCKED_V035_KOREAN_VOICE_PROVIDER_NOT_REPRODUCIBLE`
- Render failure after provider readiness: `BLOCKED_V047_THREE_CHANNEL_RENDER_FAILED`

## Command

```bash
npm run review:v047
```

## Safety

`SAFE_TO_UPLOAD=false` always. Any public, private, or unlisted upload requires a separate future owner approval.
