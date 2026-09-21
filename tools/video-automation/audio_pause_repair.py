"""Deterministically compress long internal pauses in PCM WAV audio."""

from __future__ import annotations

import json
import math
import sys
import wave
from pathlib import Path


def _rms(data: bytes, sample_width: int) -> float:
    if not data:
        return 0.0
    signed = sample_width != 1
    midpoint = 128 if sample_width == 1 else 0
    values = []
    for offset in range(0, len(data) - sample_width + 1, sample_width):
        value = int.from_bytes(data[offset : offset + sample_width], "little", signed=signed) - midpoint
        values.append(value * value)
    return math.sqrt(sum(values) / max(1, len(values)))


def _segments(frames: bytes, frame_bytes: int, sample_width: int, threshold: float) -> list[tuple[int, int]]:
    silent: list[tuple[int, int]] = []
    start: int | None = None
    chunks = math.ceil(len(frames) / frame_bytes)
    for index in range(chunks):
        chunk = frames[index * frame_bytes : (index + 1) * frame_bytes]
        is_silent = _rms(chunk, sample_width) <= threshold
        if is_silent and start is None:
            start = index
        if not is_silent and start is not None:
            silent.append((start, index))
            start = None
    if start is not None:
        silent.append((start, chunks))
    return silent


def _stats(segments: list[tuple[int, int]], chunk_ms: int, chunks: int) -> dict[str, float | int]:
    internal = [(start, end) for start, end in segments if start > 0 and end < chunks]
    durations = [(end - start) * chunk_ms for start, end in internal]
    return {
        "longestSilenceMs": max(durations, default=0),
        "count700Ms": sum(value >= 700 for value in durations),
        "count900Ms": sum(value >= 900 for value in durations),
    }


def repair(source: Path, target: Path, threshold_ms: int = 700, target_ms: int = 500, minimum_ms: int = 300) -> dict[str, object]:
    if not 300 <= minimum_ms <= target_ms < threshold_ms:
        raise ValueError("AUDIO_REPAIR_RANGE_INVALID")
    with wave.open(str(source), "rb") as reader:
        params = reader.getparams()
        frames = reader.readframes(params.nframes)
    if params.comptype != "NONE" or params.sampwidth not in (1, 2, 3, 4):
        raise ValueError("AUDIO_REPAIR_PCM_WAV_REQUIRED")
    chunk_ms = 10
    frame_bytes = max(params.nchannels * params.sampwidth, int(params.framerate * chunk_ms / 1000) * params.nchannels * params.sampwidth)
    chunks = math.ceil(len(frames) / frame_bytes)
    rms_values = [_rms(frames[index * frame_bytes : (index + 1) * frame_bytes], params.sampwidth) for index in range(chunks)]
    peak_rms = max(rms_values, default=0.0)
    silence_threshold = max(8.0, peak_rms * 0.018)
    before_segments = _segments(frames, frame_bytes, params.sampwidth, silence_threshold)
    before = _stats(before_segments, chunk_ms, chunks)
    output = bytearray()
    cursor = 0
    applied = False
    keep_chunks = max(math.ceil(minimum_ms / chunk_ms), round(target_ms / chunk_ms))
    for start, end in before_segments:
        if start == 0 or end == chunks or (end - start) * chunk_ms <= threshold_ms:
            continue
        output.extend(frames[cursor * frame_bytes : start * frame_bytes])
        output.extend(frames[start * frame_bytes : min(end, start + keep_chunks) * frame_bytes])
        cursor = end
        applied = True
    output.extend(frames[cursor * frame_bytes :])
    target.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(target), "wb") as writer:
        writer.setparams(params)
        writer.writeframes(bytes(output))
    after_chunks = math.ceil(len(output) / frame_bytes)
    after_segments = _segments(bytes(output), frame_bytes, params.sampwidth, silence_threshold)
    after = _stats(after_segments, chunk_ms, after_chunks)
    return {
        "status": "success",
        "audioRepairApplied": applied,
        "reason": "INTERNAL_SILENCE_OVER_700MS" if applied else "NO_REPAIR_REQUIRED",
        "before": before,
        "after": after,
        "durationBeforeSeconds": round(params.nframes / params.framerate, 3),
        "durationAfterSeconds": round((len(output) / (params.nchannels * params.sampwidth)) / params.framerate, 3),
        "thresholdMs": threshold_ms,
        "targetMs": target_ms,
        "SAFE_TO_UPLOAD": False,
    }


def main() -> None:
    payload = json.load(sys.stdin)
    report = repair(
        Path(str(payload["source_path"])),
        Path(str(payload["output_path"])),
        int(payload.get("threshold_ms", 700)),
        int(payload.get("target_ms", 500)),
        int(payload.get("minimum_ms", 300)),
    )
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"status": "failed", "safe_error": str(error) if str(error).isupper() else "AUDIO_PAUSE_REPAIR_FAILED", "SAFE_TO_UPLOAD": False}))
        raise SystemExit(1)
