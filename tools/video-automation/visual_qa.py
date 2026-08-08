"""Local-only video quality probes. Reads one JSON request and emits one JSON response."""
from __future__ import annotations

import json
import math
from pathlib import Path
import re
import subprocess
import sys
import time
from typing import Any

from PIL import Image, ImageStat


FIRST_THREE_TIMESTAMPS = (0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0)


def run(command: list[str], timeout: int = 120) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, check=True, capture_output=True, text=True, timeout=timeout)


def probe(path: Path) -> tuple[dict[str, Any], dict[str, Any] | None, dict[str, Any] | None]:
    payload = json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)], 60).stdout)
    video = next((item for item in payload.get("streams", []) if item.get("codec_type") == "video"), None)
    audio = next((item for item in payload.get("streams", []) if item.get("codec_type") == "audio"), None)
    return payload, video, audio


def extract_frame(video: Path, target: Path, timestamp: float) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{timestamp:.3f}", "-i", str(video), "-frames:v", "1", "-q:v", "2", str(target)], 90)


def make_contact_sheet(paths: list[Path], target: Path, columns: int) -> None:
    if not paths:
        raise ValueError("VISUAL_QA_FRAME_EXTRACTION_FAILED")
    images = [Image.open(path).convert("RGB").resize((270, 480)) for path in paths]
    rows = math.ceil(len(images) / columns)
    canvas = Image.new("RGB", (columns * 270, rows * 480), (15, 23, 42))
    for index, image in enumerate(images):
        canvas.paste(image, ((index % columns) * 270, (index // columns) * 480))
    target.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(target, quality=90)
    for image in images:
        image.close()


def parse_freezes(video: Path, duration: float) -> tuple[float, float, float]:
    completed = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(video), "-vf", "freezedetect=n=-55dB:d=0.35", "-an", "-f", "null", "-"],
        capture_output=True, text=True, timeout=180
    )
    durations = [float(value) for value in re.findall(r"freeze_duration:\s*([0-9.]+)", completed.stderr)]
    frozen = min(duration, sum(durations))
    ratio = frozen / duration if duration > 0 else 1.0
    return round(ratio, 4), round(max(durations, default=0.0), 3), round(max(0.0, 1.0 - ratio), 4)


def parse_audio(video: Path) -> tuple[int, int, int, float | None, float | None]:
    silence = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(video), "-af", "silencedetect=noise=-40dB:d=0.2", "-vn", "-f", "null", "-"],
        capture_output=True, text=True, timeout=180
    )
    durations_ms = [round(float(value) * 1000) for value in re.findall(r"silence_duration:\s*([0-9.]+)", silence.stderr)]
    loudness = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(video), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-vn", "-f", "null", "-"],
        capture_output=True, text=True, timeout=180
    )
    match = re.search(r"\{\s*\"input_i\".*?\}", loudness.stderr, re.DOTALL)
    data = json.loads(match.group(0)) if match else {}
    integrated = _finite_float(data.get("input_i"))
    peak = _finite_float(data.get("input_tp"))
    return sum(1 for value in durations_ms if value > 700), max(durations_ms, default=0), round(sum(durations_ms) / len(durations_ms)) if durations_ms else 0, integrated, peak


def canvas_density(paths: list[Path]) -> tuple[float, float]:
    empty_ratios: list[float] = []
    for path in paths:
        with Image.open(path).convert("RGB").resize((108, 192)) as image:
            pixels = list(image.getdata())
            corner = image.getpixel((1, 1))
            close = sum(1 for pixel in pixels if sum(abs(pixel[index] - corner[index]) for index in range(3)) < 24)
            low_detail = max(0.0, 1.0 - min(1.0, sum(ImageStat.Stat(image.convert("L")).stddev) / 35.0))
            empty_ratios.append(min(1.0, (close / len(pixels)) * 0.75 + low_detail * 0.25))
    empty = sum(empty_ratios) / len(empty_ratios) if empty_ratios else 1.0
    return round(1.0 - empty, 4), round(empty, 4)


def analyze(request: dict[str, Any]) -> dict[str, Any]:
    started = time.perf_counter()
    video_path = Path(request["video_path"]).resolve(strict=True)
    output_dir = Path(request["output_dir"]).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    payload, video, audio = probe(video_path)
    duration = float(payload.get("format", {}).get("duration", 0.0))
    first_paths: list[Path] = []
    for index, timestamp in enumerate(FIRST_THREE_TIMESTAMPS):
        target = output_dir / "first-3-seconds" / f"frame-{index:02d}-{int(timestamp * 1000):04d}ms.jpg"
        extract_frame(video_path, target, min(timestamp, max(0.0, duration - 0.02)))
        first_paths.append(target)
    regular_times = [min(duration - 0.02, value) for value in _regular_timestamps(duration)]
    regular_paths: list[Path] = []
    for index, timestamp in enumerate(regular_times):
        target = output_dir / "regular-frames" / f"frame-{index:02d}-{timestamp:.2f}s.jpg"
        extract_frame(video_path, target, max(0.0, timestamp))
        regular_paths.append(target)
    first_sheet = output_dir / "first-3-seconds-contact-sheet.jpg"
    contact_sheet = output_dir / "contact-sheet.jpg"
    make_contact_sheet(first_paths, first_sheet, 4)
    make_contact_sheet(regular_paths, contact_sheet, 3)
    freeze_ratio, longest_freeze, change_ratio = parse_freezes(video_path, duration)
    long_count, longest_silence, mean_pause, loudness, peak = parse_audio(video_path)
    frame_fill, empty_ratio = canvas_density(first_paths + regular_paths)
    configured_fill = float(request.get("canvas_fill_ratio", frame_fill))
    return {
        "status": "success",
        "fileSize": video_path.stat().st_size,
        "durationSeconds": round(duration, 3),
        "width": int(video.get("width", 0)) if video else 0,
        "height": int(video.get("height", 0)) if video else 0,
        "frameRate": str(video.get("avg_frame_rate", "")) if video else "",
        "videoCodec": video.get("codec_name") if video else None,
        "audioCodec": audio.get("codec_name") if audio else None,
        "videoStream": video is not None,
        "audioStream": audio is not None,
        "firstFramePath": str(first_paths[0]),
        "firstThreeSecondsContactSheetPath": str(first_sheet),
        "contactSheetPath": str(contact_sheet),
        "sampledFramePaths": [str(path) for path in first_paths + regular_paths],
        "freezeRatio": freeze_ratio,
        "longestFreezeSeconds": longest_freeze,
        "visualChangeRatio": change_ratio,
        "canvasFillRatio": round(max(frame_fill, configured_fill), 4),
        "emptyCanvasRatio": empty_ratio,
        "integratedLoudnessLufs": loudness,
        "truePeakDb": peak,
        "longSilenceCount": long_count,
        "longestSilenceMs": longest_silence,
        "meanPauseMs": mean_pause,
        "qaOverheadSeconds": round(time.perf_counter() - started, 2),
        "rawPathsInLogs": False,
        "externalApiCalled": False,
        "uploadAttempted": False,
    }


def _regular_timestamps(duration: float) -> list[float]:
    if duration <= 0:
        return [0.0]
    return [duration * fraction for fraction in (0.08, 0.22, 0.36, 0.5, 0.64, 0.78, 0.92)]


def _finite_float(value: Any) -> float | None:
    try:
        parsed = float(value)
        return round(parsed, 2) if math.isfinite(parsed) else None
    except (TypeError, ValueError):
        return None


def main() -> int:
    try:
        request = json.loads(sys.stdin.read())
        if request.get("operation") != "analyze":
            raise ValueError("VISUAL_QA_OPERATION_INVALID")
        print(json.dumps(analyze(request), ensure_ascii=False))
        return 0
    except Exception as exc:
        message = str(exc)
        safe = message if message and all(char.isupper() or char.isdigit() or char in "_:-" for char in message) else "VISUAL_QA_FAILED"
        print(json.dumps({"status": "failed", "safe_error": safe, "error_type": type(exc).__name__}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
