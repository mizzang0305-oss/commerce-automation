# Legacy vs video-use Comparison

## Decision

`VIDEO_USE_MIXED`

Both engines produced valid local fixture videos, but video-use was materially slower and required a Windows subtitle compatibility adapter. The result supports continued shadow evaluation, not a production cutover.

## Environment

- Windows PowerShell
- FFmpeg/FFprobe 8.1.1
- Python 3.14.3
- Node 24.14.0
- video-use commit `92c2b34e44c205cbc2acae7f6ca7c1c219d5dd66`
- Concurrency: 1 scenario at a time

## Measurements

| Fixture | Renderer | Success | Seconds | Bytes | Quality |
|---|---|---:|---:|---:|---|
| 1 image / 15 s | legacy | yes | 7.676 | 55,048 | PASS |
| 1 image / 15 s | video-use | yes | 22.145 | 75,423 | PASS |
| 3 images / 20 s | legacy | yes | 9.911 | 74,191 | PASS |
| 3 images / 20 s | video-use | yes | 28.226 | 123,991 | PASS |
| 6 images / 30 s | legacy | yes | 14.725 | 112,455 | PASS |
| 6 images / 30 s | video-use | yes | 43.670 | 190,287 | PASS |

All final outputs passed 1080x1920, 30 fps, H.264, yuv420p, AAC audio, duration tolerance, non-empty file, faststart, and black-frame checks. The color fixtures test mechanics, not product-image aesthetics.

## Qualitative Findings

- Crop: both paths preserve the full 9:16 fixture without distortion.
- Motion: the photo adapter cycles push, pan, pull, and hold effects without depending on remote services.
- Korean captions: adapter-managed SRT burn-in works on Windows with a Korean font fallback.
- Manual frame inspection: all three fixture outputs were nonblank, correctly framed, and showed intact Korean captions inside the vertical safe area.
- Determinism: generated fixtures and command arguments are local and deterministic.
- Failure isolation: commit mismatch, timeout, invalid images, duplicate hashes, and quality failures do not become publish-ready results.
- Upload safety: `safe_to_publish=false` and `live_upload_attempted=false` in every scenario.

## Limitations

- No real product images, BGM, voiceover, logo, price freshness, or platform UI safe-zone review was used.
- CPU and memory peaks were not measured with a dedicated profiler.
- Concurrency 2 and 4 were not tested because the local baseline should remain concurrency 1 until stability is established.
- The comparison report under `artifacts/video-use-comparison/` is ignored and must not be committed.

## Next Comparison Gate

Use sanitized, rights-cleared internal product fixtures in shadow mode and perform manual visual review. Do not connect either result to a publisher until a separate canary approval exists.
