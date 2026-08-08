# Product-to-Video Automation V1 Baseline

## 1. Product source

The local E2E uses three V039 sanitized scene packs whose asset-to-frame proof is review-ready but whose recorded human review is still pending. They prove the technical local render path, not owner approval or real-use visual quality. The source checkout is read-only and supplied through `VIDEO_AUTOMATION_ASSET_ROOT`; no live Coupang request, scraping, queue creation, affiliate mutation, or database write occurs.

## 2. Existing content generator

The integration emits three deterministic Korean angles (`problem_first`, `benefit_first`, `curiosity_checklist`) in one local operation. It adds no provider and makes zero LLM requests.

## 3. Existing Korean TTS

`python-worker/src/media/tts_generator.py::create_tts_audio` remains authoritative. The bridge requires approved `local_command`, Korean, MeloTTS, speed `1.2`, non-silent WAV, and its existing timeout.

## 4. Existing faster-whisper

The approved local faster-whisper wrapper remains the script-reality authority. V1 requires similarity `>= 0.82` and at least three product anchors.

## 5. Existing FFmpeg renderer

`python-worker/src/media/video_renderer.py::render_vertical_video` remains the renderer. The local bridge supplies reviewed scene copies with a separate usage badge and applies the approved 104px hook constants only inside that disposable process. It verifies 1080x1920, H.264, AAC, video stream, audio stream, duration, and non-empty output with ffprobe.

## 6. Existing visual and creative QA

V1 reuses `evaluateV143ReusableCreativePolicy` plus `evaluate_pre_render_visual_evidence`. Product identity binding, real-use provenance, usage labels, hook readability, approved Korean TTS, ASR, alignment, captions, and media format fail closed.

## 7. Existing output manifest

Local run and per-video manifests preserve candidate hashes, score breakdowns, selected rank, stage timing, QA blockers, and safe local output paths under ignored `data/video-automation/`.

## 8. Existing review artifact

The harness produces `owner-review-summary.json` and `.md`. It never turns owner review into upload approval.

## 9. Minimum integration seam

New code is isolated under `src/lib/video-automation`, `scripts/video-automation`, `tools/video-automation`, `tests/video-automation`, and this document. Production routes, repositories, Worker tasks, upload adapters, DB schema, scheduler, and Google Sheets are untouched.

## 10. Explicit non-goals

No scorer tuning, new TTS/ASR/provider, Remotion, renderer rewrite, Production deployment, database/R2/Sheets/Drive write, scheduler mutation, Worker update/restart, or platform upload.

All defaults remain disabled, including `SAFE_TO_UPLOAD=false` and `SAFE_TO_PUBLIC_UPLOAD=false`.
