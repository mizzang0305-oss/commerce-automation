# v057 Hook Overlay and First-Frame Optimization

Status: local preview only. No upload.

## Goal

v057 keeps the v056 corrected three-channel video structure, voice, product binding, metadata/comment disclosure structure, and channel routing assumptions. It changes only:

- larger and stronger first-screen hook overlay
- cover-like first-frame optimization for small YouTube Shorts/list thumbnails

## Scope

Allowed:

- generate local preview artifacts under `commerce-assets/review/v057/`
- generate channel review consoles and summary reports
- validate hook readability, contrast, channel binding, disclosure previews, and no-upload safety

Forbidden:

- YouTube upload or `videos.insert`
- comment create/update/delete
- visibility change
- existing video mutation
- R2/product_assets/DB writes
- raw affiliate URL, token, secret, or Authorization output
- committing `commerce-assets`, generated media, `.env.local`, or `AGENTS.md`

## Channel Hooks

| Channel | Product | v057 hook | Intent |
| --- | --- | --- | --- |
| `father_jobs` | 차량용 컵홀더 정리함 | 차 안 수납 / 이거부터 보세요 | 출근길 차량 정리 문제를 짧게 전달 |
| `neoman_moleulgeol` | 접이식 빨래건조대 | 장마철 빨래 / 그냥 널면 손해 | 장마철 실내건조 체크 필요성을 강조 |
| `lets_buy` | 특가 케이블 정리함 | 케이블 정리 / 조건부터 보세요 | 가격보다 조건 비교가 먼저라는 메시지 |

The hooks avoid guarantee, fake review, medical, absolute-price, and deceptive claims.

## Output Artifacts

Run:

```bash
npm run review:v057
```

Expected local outputs:

- `commerce-assets/review/v057/<channel>/corrected-preview-v057.mp4`
- `commerce-assets/review/v057/<channel>/first-frame-v057.jpg`
- `commerce-assets/review/v057/<channel>/hook-overlay-preview.jpg`
- `commerce-assets/review/v057/<channel>/review-console.html`
- `commerce-assets/review/v057/<channel>/upload-settings-preview.json`
- `commerce-assets/review/v057/<channel>/metadata-preview.json`
- `commerce-assets/review/v057/<channel>/comment-preview.json`
- `commerce-assets/review/v057/<channel>/first-frame-clickability-summary.json`
- `commerce-assets/review/v057/three-channel-v057-summary.html`
- `commerce-assets/review/v057/hook-overlay-validation-report.json`
- `commerce-assets/review/v057/first-frame-clickability-report.json`

## Validation Gates

The v057 test and generator validate:

- `hook_text_large_pass`
- `hook_text_contrast_pass`
- `first_frame_clickability_pass`
- `channel_binding_pass`
- `no_fake_claims_pass`
- `no_mojibake_pass`
- `disclosure_preview_pass`
- `upload_settings_preview_present`
- `no_upload_side_effects`

## Next Action

민즈님이 3개 채널의 v057 preview MP4와 `first-frame-v057.jpg`를 보고 PASS/FAIL을 준다. PASS 후에만 corrected reupload approval 단계로 이동한다.
