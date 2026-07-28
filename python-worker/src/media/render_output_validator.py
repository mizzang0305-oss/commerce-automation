from __future__ import annotations

from pathlib import Path
import re
import subprocess


def validate_render_output(video_path: Path, ffmpeg_exe: str, timeout_seconds: int = 60) -> dict[str, object]:
    if not video_path.is_file() or video_path.stat().st_size <= 0:
        raise RuntimeError("RENDER_OUTPUT_MISSING")
    try:
        completed = subprocess.run(
            [ffmpeg_exe, "-hide_banner", "-i", str(video_path)],
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise RuntimeError("RENDER_OUTPUT_PROBE_FAILED") from exc
    probe = f"{completed.stdout}\n{completed.stderr}".lower()
    video_ok = "video: h264" in probe and bool(re.search(r"\b1080x1920\b", probe))
    audio_ok = "audio: aac" in probe
    if not video_ok or not audio_ok:
        blockers = []
        if not video_ok:
            blockers.append("VIDEO_MUST_BE_H264_1080X1920")
        if not audio_ok:
            blockers.append("AUDIO_MUST_BE_AAC_AND_PRESENT")
        raise RuntimeError("RENDER_OUTPUT_QUALITY_GATE_FAILED:" + ",".join(blockers))
    return {
        "pass": True,
        "width": 1080,
        "height": 1920,
        "video_codec": "h264",
        "audio_codec": "aac",
        "audio_present": True,
        "raw_probe_in_result": False,
    }
