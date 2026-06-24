# Shorts Real Device QA Regression Log

## 2026-06-25 - Failed Private Review

- video_id: `FvBq0tHXePk`
- review_status: `FAIL_PRIVATE_REVIEW`
- visibility_at_review: `private`
- product_name: `코멧 홈 접이식 대형 빨래건조대`
- public_conversion_blocked: `true`
- unlisted_conversion_blocked: `true`

### Failure Reasons

- `SHORTS_UI_OVERLAY_TEXT_BLOCKED`
- `CAPTION_ESCAPED_NEWLINE_RENDERED_AS_LITERAL_N`
- `CAPTION_TOO_LOW_FOR_SHORTS_UI`
- `TITLE_OR_DESCRIPTION_MOJIBAKE`
- `AUDIO_INTELLIGIBILITY_FAILED`
- `STATIC_PRODUCT_CARD_FEELING`
- `HOOK_VISIBILITY_WEAK_ON_DEVICE`

### Required Fixes Before Any Fresh Private Upload

- Verify rendered captions against the actual Shorts top chip, right action rail, bottom metadata, and bottom navigation zones.
- Block literal `\n` and Hangul-joined `n` caption regressions before upload readiness can pass.
- Run Korean text integrity checks for title, description, disclosure, and captions.
- Require a Korean audio intelligibility probe with transcript similarity, keyword anchors, speech rate, silence, hard-cut, and naturalness thresholds.
- Keep the renderer problem-first and layout-varied so the output does not feel like a static product-photo card.

No YouTube execute, `videos.insert`, R2 upload, DB write, public conversion, or unlisted conversion was performed for this record.
