# V113 Product-Matched Script and Voice Preview (No Upload)

## Purpose

V113 replaces the mismatched timing-reference audio in the corrected V112 preview with a Korean voiceover written specifically for the authoritative rear-seat multifunction organizer.

The locked product reference is:

```text
CURRENT_REAR_SEAT_MULTIFUNCTION_ORGANIZER
```

## Copy Scope

The script may describe only evidence visible in the authoritative product reference:

- rear-seat and headrest mounting context
- two side cup holders
- front tissue storage opening
- center fold-out mirror
- small-item storage
- lower hooks for a bag or umbrella
- an installation and seat-spacing check before purchase

Copy for a front center-console organizer, gear-shift gap, or driver-side console is rejected as a product mismatch.

## Voice and QA

- Reuse the configured, approved Korean `local_command` provider.
- Use a faster `1.14` delivery multiplier with short, benefit-led sentences for an energetic sales-presenter tone.
- Normalize the narration to about 21.4 seconds so the final visual CTA has a short breathing interval.
- Keep the delivery assertive and rhythmic without adding unsupported claims or artificial urgency.
- End with `제품 정보는 고정 댓글 링크에서 확인하세요` and fail closed if the pinned-comment/link CTA is removed.
- The CTA is narration copy only in V113. No comment is created, updated, pinned, or deleted without a separate approval.
- Reject Windows SAPI and paid/cloud providers in this V113 path.
- Target the existing V112 duration of about 22.7 seconds.
- Replace the old audio track rather than mixing it with the corrected narration.
- Run the configured local Korean ASR against the finished preview.
- Require transcript similarity and product-anchor evidence before reporting a review-ready preview.
- Do not print the raw transcript, local command, model path, or file paths in the report.

## Outputs

Generated locally under:

```text
commerce-assets/review/v113/father_jobs/
```

- `voiceover-script-v113.txt`
- `voiceover-v113.wav`
- `pinned-comment-v113.txt`
- `preview-v113.mp4`
- `first-frame-v113.jpg`
- `v113-preview-summary.json`

Generated media remains protected and must not be committed.

The pinned-comment artifact contains the bound affiliate URL internally. Console and JSON reports expose only presence, host, hash-prefix, disclosure, and readiness evidence.

## Run

```powershell
npm run review:v113
```

## Safety

- No YouTube upload or visibility change.
- No `videos.insert` or comment mutation.
- No scheduler, n8n, R2, DB, Supabase, storage, or product-assets write.
- No raw URL, full video/channel ID, token, secret, Auth, HMAC, command, model path, or local file path output.
- `SAFE_TO_UPLOAD=false`.
- `SAFE_TO_PUBLIC_UPLOAD=false`.
- `BLOCKED_V113_OWNER_VOICE_REVIEW_REQUIRED` remains active after a technically valid preview.
- `BLOCKED_V113_PINNED_COMMENT_ACTION_NOT_APPROVED` remains active because V113 does not create or pin comments.
- Comment pinning remains a manual YouTube Studio action after a separately approved upload/comment step.

The preview must be reviewed by the owner before any separate replacement-upload decision.

## Local Result

- status: `preview_ready_for_owner_review`
- product copy: matched to `CURRENT_REAR_SEAT_MULTIFUNCTION_ORGANIZER`
- voice provider: approved local command
- paid/cloud voice used: false
- voice style: energetic sales presenter, `1.14` speed multiplier
- voice duration: 21.391 seconds
- output: 1080x1920, 22.709 seconds, H.264 + mono AAC
- local ASR executed: true
- transcript similarity: 0.966
- recognized product anchors: 7; required threshold: 5
- pinned-comment CTA present: true
- pinned-comment package ready: true; disclosure and bound affiliate link present
- comment created or pinned: false; manual create/pin required
- audio level probe: mean -18.3 dB, peak -2.1 dB
- upload/comment/visibility/R2/DB/product-assets side effects: 0
- current blocker: `BLOCKED_V113_OWNER_VOICE_REVIEW_REQUIRED`
