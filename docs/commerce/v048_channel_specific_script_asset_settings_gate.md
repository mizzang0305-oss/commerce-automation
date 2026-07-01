# v048 Channel-Specific Script Asset Settings Gate

## Goal

v048 fixes the v047 owner review failure where all three channels effectively used the laundry drying rack script and scene purpose family.

It does not introduce a new renderer. It reuses:

- v046 local generated images
- v035 renderer and review console path
- v035 local Korean `local_command` voice path

## Channel Binding

Each channel must carry its own product, script, scene purposes, metadata, comment preview, and core ASR anchors.

| Channel | Product | Required anchors |
| --- | --- | --- |
| father_jobs | 차량용 컵홀더 정리함 | 차량, 컵홀더, 정리함 |
| neoman_moleulgeol | 접이식 빨래건조대 | 빨래, 건조대, 공간 |
| lets_buy | 특가 케이블 정리함 | 케이블, 정리함, 책상 |

Failure blockers include:

- `CHANNEL_SCRIPT_BINDING_FAIL`
- `CHANNEL_SCENE_MANIFEST_BINDING_FAIL`
- `CHANNEL_METADATA_BINDING_FAIL`
- `CHANNEL_COMMENT_BINDING_FAIL`
- `CROSS_CHANNEL_TEXT_CONTAMINATION`
- `SAME_SCRIPT_REUSED_ACROSS_CHANNELS`

## Upload Settings Preview

Each channel writes `youtube-upload-settings-preview.json` with:

- `visibility=public`
- `made_for_kids=false`
- `contains_paid_promotion=true`
- `paid_promotion_disclosure_required=true`
- `paid_promotion_setting_verification=REQUIRED_BEFORE_UPLOAD`
- `safe_to_upload=false`

Because upload is not executed here, public upload remains blocked by `MANUAL_PAID_PROMOTION_CHECK_REQUIRED`.

## Command

```bash
npm run review:v048
```

## Safety

`SAFE_TO_UPLOAD=false` always. YouTube Execute, `videos.insert`, upload, comment mutation, visibility change, R2, `product_assets`, DB writes, and deploy remain blocked.
