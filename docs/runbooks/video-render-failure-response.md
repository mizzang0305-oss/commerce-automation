# Video Render Failure Response

## Fail-Closed Rules

- Invalid or duplicate image: block before FFmpeg.
- Missing or mismatched video-use checkout: block or fall back to legacy.
- Timeout: terminate the subprocess and report `VIDEO_USE_RENDER_TIMEOUT`.
- Media quality failure: do not create a publish bridge.
- Missing disclosure: compliance FAIL and no publish.
- Shadow result: comparison only.

## Triage

1. Capture job id, renderer, version, pinned commit, source hash, error code, elapsed seconds, and quality blockers.
2. Do not capture raw URLs, affiliate links, authorization headers, tokens, cookies, or secrets.
3. Verify FFmpeg, FFprobe, Python, upstream commit, input readability, disk space, and timeout.
4. Reproduce with a rights-cleared local fixture.
5. If video-use fails and legacy passes, use legacy fallback and keep the incident non-publishable until existing publish gates run.

## Windows Notes

Use UTF-8 Python environment variables. Keep upstream subtitle rendering disabled at the pinned commit and let the adapter burn a relative SRT during normalization.

## Escalation

Repeated failures, orphan processes, corrupt outputs, or unexpected network/platform activity require stopping the experiment and restoring legacy mode.
