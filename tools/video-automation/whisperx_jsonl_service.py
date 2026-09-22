"""Persistent, local-only WhisperX CPU JSONL service. No network listener or upload path."""
from __future__ import annotations

import json
import sys
import time
from typing import Any


def emit(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def words_from_alignment(aligned: dict[str, Any]) -> tuple[list[dict[str, Any]], int]:
    words: list[dict[str, Any]] = []
    missing = 0
    for segment in aligned.get("segments", []):
        for item in segment.get("words", []):
            if item.get("start") is None or item.get("end") is None:
                missing += 1
                continue
            words.append({
                "word": str(item.get("word", "")).strip(),
                "start": round(float(item["start"]), 3),
                "end": round(float(item["end"]), 3),
                "confidence": round(float(item["score"]), 4) if item.get("score") is not None else None,
            })
    return words, missing


def main() -> int:
    try:
        import psutil  # type: ignore[import-not-found]
        import whisperx  # type: ignore[import-not-found]
    except ImportError:
        emit({"event": "failed", "safe_error": "WHISPERX_NOT_INSTALLED"})
        return 2
    started = time.perf_counter()
    model = whisperx.load_model("tiny", "cpu", compute_type="int8", language="ko")
    align_model, metadata = whisperx.load_align_model(language_code="ko", device="cpu")
    process = psutil.Process()
    peak_rss = process.memory_info().rss
    emit({"event": "ready", "load_seconds": round(time.perf_counter() - started, 3), "model": "tiny", "device": "cpu", "compute_type": "int8"})
    for raw_line in sys.stdin:
        request_id = "unknown"
        try:
            request = json.loads(raw_line)
            request_id = str(request.get("id", "unknown"))
            if request.get("language") != "ko" or request.get("model") != "tiny" or request.get("device") != "cpu" or request.get("compute_type") != "int8":
                raise ValueError("WHISPERX_REQUEST_POLICY_BLOCKED")
            request_started = time.perf_counter()
            audio = whisperx.load_audio(str(request["audio_path"]))
            provided_transcript = str(request.get("transcript", "")).strip()
            if provided_transcript:
                duration = len(audio) / 16000
                transcript_segments = [{"start": 0.0, "end": duration, "text": provided_transcript}]
                transcript_source = "provided_local_asr"
            else:
                transcript = model.transcribe(audio, batch_size=4, language="ko")
                transcript_segments = transcript["segments"]
                transcript_source = "whisperx_transcribe"
            aligned = whisperx.align(transcript_segments, align_model, metadata, audio, "cpu", return_char_alignments=False)
            words, missing = words_from_alignment(aligned)
            peak_rss = max(peak_rss, process.memory_info().rss)
            total = len(words) + missing
            emit({
                "id": request_id,
                "status": "success",
                "words": words,
                "processing_seconds": round(time.perf_counter() - request_started, 3),
                "aligned_ratio": round(len(words) / total, 4) if total else 0,
                "transcript_source": transcript_source,
                "peak_rss_mb": round(peak_rss / 1024 / 1024, 2),
            })
        except Exception:
            emit({"id": request_id, "status": "failed", "safe_error": "WHISPERX_ALIGNMENT_FAILED"})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
