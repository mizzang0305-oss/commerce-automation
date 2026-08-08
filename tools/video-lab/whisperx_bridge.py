"""Optional local-only WhisperX JSON bridge.

The repository does not install WhisperX. Run this only from a disposable Python
3.10-3.13 environment after explicitly enabling the Video Lab experiment.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", required=True)
    parser.add_argument("--language", choices=["ko"], default="ko")
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", default="small")
    parser.add_argument("--device", choices=["cpu", "cuda"], default="cpu")
    parser.add_argument("--compute-type", choices=["int8", "float16", "float32"], default="int8")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    audio_path = Path(args.audio).resolve(strict=True)
    if not audio_path.is_file():
        raise ValueError("VIDEO_LAB_AUDIO_FILE_REQUIRED")
    output_path = Path(args.output).resolve()
    if output_path.suffix.lower() != ".json":
        raise ValueError("VIDEO_LAB_JSON_OUTPUT_REQUIRED")

    try:
        import whisperx  # type: ignore[import-not-found]
    except ImportError as exc:
        raise RuntimeError("VIDEO_LAB_WHISPERX_NOT_INSTALLED") from exc

    audio = whisperx.load_audio(str(audio_path))
    model = whisperx.load_model(args.model, args.device, compute_type=args.compute_type, language="ko")
    transcript: dict[str, Any] = model.transcribe(audio, batch_size=4, language="ko")
    align_model, metadata = whisperx.load_align_model(language_code="ko", device=args.device)
    aligned = whisperx.align(
        transcript["segments"], align_model, metadata, audio, args.device, return_char_alignments=False
    )
    words = []
    segments = []
    for segment in aligned.get("segments", []):
        segments.append(
            {
                "text": str(segment.get("text", "")).strip(),
                "start_seconds": float(segment["start"]) if segment.get("start") is not None else None,
                "end_seconds": float(segment["end"]) if segment.get("end") is not None else None,
            }
        )
        for word in segment.get("words", []):
            if "start" not in word or "end" not in word:
                continue
            words.append(
                {
                    "word": str(word.get("word", "")).strip(),
                    "start": float(word["start"]),
                    "end": float(word["end"]),
                    "confidence": float(word["score"]) if word.get("score") is not None else None,
                }
            )
    payload = {"provider": "whisperx", "language": "ko", "segments": segments, "words": words}
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {"status": "completed", "provider": "whisperx", "word_count": len(words)},
            ensure_ascii=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
