# Product-to-Video Automation V1 Baseline

## 1. Product source

The acceptance E2E binds three exact V057 local videos referenced by the V049 preflight with `PASS_LOCAL_HUMAN_REVIEW`. It extracts local frames below the old baked hook area and classifies every derived scene as `generic_usage_example`, never `exact_product_use`. The source checkout is read-only and supplied through `VIDEO_AUTOMATION_ASSET_ROOT`; no live Coupang request, scraping, queue creation, affiliate mutation, or database write occurs.

## 2. Existing content generator

The integration emits three deterministic Korean angles (`problem_first`, `benefit_first`, `curiosity_checklist`) in one local operation. It adds no provider and makes zero LLM requests.

## 3. Existing Korean TTS

`python-worker/src/media/tts_generator.py::create_tts_audio` remains authoritative. The bridge requires approved `local_command`, Korean, actual `MELOTTS_SPEED=1.2`, non-silent WAV, and its existing timeout. The narration states the canonical product name as a separate sentence so the existing identity threshold is not weakened when Korean loanwords are transcribed.

## 4. Existing faster-whisper

The approved local faster-whisper wrapper remains the script-reality authority. V1 requires similarity `>= 0.82`, at least two context anchors, and canonical product identity similarity `>= 0.65`.

## 5. Existing FFmpeg renderer

`python-worker/src/media/video_renderer.py::render_vertical_video` remains the renderer. Hook and usage badge use independent FFmpeg drawtext inputs. The fixed 1080x1920 plan records the hook box, badge box, 32px minimum gap, Shorts exclusions, and blocks collision before render. Post-render evidence links the same geometry to the actual first-frame dimensions. The bridge applies the approved 104px hook constants only inside that disposable process and verifies 1080x1920, H.264, AAC, 30fps, streams, duration, and non-empty output with ffprobe.

## 6. Existing visual and creative QA

V1 reuses `evaluateV143ReusableCreativePolicy` and the existing perceptual scene profile. The local visual gate additionally requires an exact `PASS_LOCAL_HUMAN_REVIEW` source-video binding, at least five portrait frames, three perceptual clusters, generic-use labeling, and no exact-product claim. Product identity binding, real-use provenance, usage labels, hook readability, approved Korean TTS, ASR, alignment, captions, layout, and media format fail closed.

## 7. Existing output manifest

Local run and per-video manifests preserve candidate hashes, score breakdowns, selected rank, stage timing, QA blockers, and safe local output paths under ignored `data/video-automation/`.

## 8. Existing review artifact

The harness produces `owner-review/OWNER_REVIEW.md` plus per-product `output.mp4`, `first-frame.jpg`, `contact-sheet.jpg`, and `summary.json`. Automated technical success sets `ownerReviewStatus=pending` and `publishQualityPassed=false`; it never turns owner review into upload approval.

## 9. Fresh local acceptance evidence

Fresh run `run-20260808031308` completed 3/3 after one bounded repair cycle. It recorded Scorer V2 selection 3/3, MeloTTS/faster-whisper 3/3, WhisperX 3.8.6 with one process start and three requests, aligned ratio 1.0 for all products, captions with at most four words per cue, 32px hook/usage gap, collision false, and three H.264/AAC 1080x1920 30fps MP4 files. The resulting status is `PRODUCT_TO_VIDEO_AUTOMATION_V1_LOCAL_PROVEN_3_OF_3_NO_UPLOAD`; owner review of the three fresh MP4 files is still pending and publish readiness remains false.

## 10. Minimum integration seam

New code is isolated under `src/lib/video-automation`, `scripts/video-automation`, `tools/video-automation`, `tests/video-automation`, and this document. Production routes, repositories, Worker tasks, upload adapters, DB schema, scheduler, and Google Sheets are untouched.

## 11. Explicit non-goals

No scorer tuning, new TTS/ASR/provider, Remotion, renderer rewrite, Production deployment, database/R2/Sheets/Drive write, scheduler mutation, Worker update/restart, or platform upload.

All defaults remain disabled, including `SAFE_TO_UPLOAD=false` and `SAFE_TO_PUBLIC_UPLOAD=false`.
