# video-use Upstream Audit

## Snapshot

- Repository: `https://github.com/browser-use/video-use.git`
- Default branch: `main`
- Pinned commit: `92c2b34e44c205cbc2acae7f6ca7c1c219d5dd66`
- Project version: `0.1.0`
- License: MIT, Browser Use 2026
- Python: `>=3.10`
- Required tools: FFmpeg and FFprobe
- Python dependencies: requests, librosa, matplotlib, pillow, numpy
- Optional dependency: manim
- Audit decision: `VIDEO_USE_COMPATIBLE_WITH_ADAPTER`

The snapshot was read from `README.md`, `SKILL.md`, `install.md`, `pyproject.toml`, `LICENSE`, `helpers/*`, tests, examples, and recent commits. The project is a skill and helper collection, not a published stable renderer SDK.

## Stable Boundary Selected

The adapter invokes the public helper command:

```text
python helpers/render.py <edl.json> -o <output.mp4> [--preview] [--no-subtitles] [--no-loudnorm]
```

No upstream internal Python function is imported. The local checkout must match the pinned commit before execution.

## EDL and Render Behavior

The EDL maps source names to video files and defines source ranges, grade, overlays, subtitles, and expected duration. `helpers/render.py` extracts clips, concatenates them, applies optional composition, and writes MP4 output. The helper currently emits 24 fps. The adapter normalizes the final file to the requested 30 fps contract.

## Photo Input Gap

The audited helper expects video sources. It does not provide a complete photo-only commerce-shorts path with image validation, duplicate detection, 9:16 crop protection, per-image motion, commerce disclosure, or upload-package integration. The migration therefore generates local H.264/AAC motion clips from validated images, then supplies those clips to the EDL renderer.

## Optional Systems

- ElevenLabs is used by transcription workflows, not by photo-only rendering.
- Remotion, HyperFrames, and Manim are optional/lazy paths and are not required by this adapter.
- The default adapter does not perform remote downloads or TTS.

## Windows Findings

- The helper must run with `PYTHONUTF8=1` and `PYTHONIOENCODING=utf-8` to avoid cp949 console failures.
- At the pinned commit, an absolute Windows SRT path is not escaped reliably by the upstream FFmpeg subtitle filter.
- The adapter therefore asks upstream to render without subtitles, then burns the same SRT during the local 30 fps normalization step using a working-directory-relative path.
- Paths with spaces and Korean characters remain local and are passed as argument arrays rather than shell strings.

## Version and Update Policy

`config/video-use.upstream.json` is the source of truth. `npm run video-use:verify` blocks missing tools or commit mismatch. An update must change the pin, rerun 1/3/6 image smoke tests, compare output, update this audit, and receive owner review before merge.

## License Handling

The integration does not vendor upstream source. The external tools checkout remains separate. The MIT attribution and pinned source URL are recorded in repository documentation and configuration.
