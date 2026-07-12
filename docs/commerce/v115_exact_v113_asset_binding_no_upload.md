# V115 Exact V113 Asset Binding (No Upload)

## Purpose

V115 prevents a private replacement-upload attempt from silently selecting the older V057 or V112 media after the owner selected the product-matched V113 preview.

The only accepted media contract is:

- channel: `father_jobs`
- version: `v113`
- product reference: `CURRENT_REAR_SEAT_MULTIFUNCTION_ORGANIZER`
- video file name: `preview-v113.mp4`
- video SHA-256 prefix: `a98dcf4a74d7`
- video size: `7,640,938` bytes
- first-frame SHA-256 prefix: `2680d9ee6482`

Generated media remains protected and is not committed.

## Binding Gates

The V115 path requires all of the following before local preparation can become ready:

- exact V113 video path, size, and SHA-256 match
- exact V113 first-frame path and SHA-256 match
- V113 summary identifies `father_jobs`
- V113 summary identifies the rear-seat multifunction organizer
- product-matched script and replacement voice evidence are ready
- ASR similarity and product-anchor evidence pass
- pinned-comment package contains affiliate/disclosure evidence but comment mutation remains disabled
- source review summary explicitly records raw URL, local path, full ID, secret, and transcript output flags as false
- summary records zero upload/comment/visibility side effects and no fake success

Any missing or mismatched evidence fails closed. V057 and V112 files are never considered as fallback candidates in this path.

## Commands

No-upload preflight:

```powershell
npm run upload:v115:exact-v113-private-pilot:preflight --silent
```

Focused tests:

```powershell
npm run upload:v115:focused --silent
```

The separate execute command exists for a later owner-approved one-item private replacement attempt. It must not be run during V115 implementation, review, or merge validation.

## Safety

- V115 implementation and validation perform no YouTube upload.
- `videos.insert=0` and `commentThreads.insert=false`.
- Public and unlisted visibility remain blocked.
- Comment and scheduler execution remain disabled.
- No R2, DB, product-assets, n8n, or visibility mutation is performed.
- Reports contain file names, booleans, and hash prefixes only; raw local paths, URLs, full IDs, and credentials are omitted.
- `SAFE_TO_UPLOAD=false`.
- `SAFE_TO_PUBLIC_UPLOAD=false`.

## Next Gate

After merge, run the V115 preflight against the protected local V113 artifacts. Only a clean exact-hash result may proceed to a new, separately approved one-item private replacement upload. Deleting the incorrect private V057 upload remains a separate owner action.

## Local Validation Result

- exact V113 video hash and size: matched
- exact V113 first-frame hash: matched
- product, voice, ASR, affiliate/disclosure review evidence: ready
- V057/V112 fallback: forbidden
- asset preparation readiness: true
- asset preparation attempted: false
- YouTube execution attempted: false
- current blocker: `BLOCKED_V110_RUNTIME_CONTEXT_NOT_READY`
- next runtime step after merge: refresh V095 context for the V113 selection, then rerun V115 preflight without an upload approval
