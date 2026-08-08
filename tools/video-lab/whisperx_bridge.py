"""Optional local-only CPU WhisperX JSON bridge.

The repository does not install WhisperX. Run this only from the disposable
Python 3.12 Video Lab environment. It never uploads or mutates Production data.
"""

from __future__ import annotations

import argparse
from difflib import SequenceMatcher
import json
from pathlib import Path
import re
import time
from typing import Any
import wave


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--audio")
    source.add_argument("--manifest")
    parser.add_argument("--language", choices=["ko"], default="ko")
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", default="small")
    parser.add_argument("--device", choices=["cpu"], default="cpu")
    parser.add_argument("--compute-type", choices=["int8", "float32"], default="int8")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    output_path = Path(args.output).resolve()
    if output_path.suffix.lower() != ".json":
        raise ValueError("VIDEO_LAB_JSON_OUTPUT_REQUIRED")
    samples = load_samples(args)

    try:
        import psutil  # type: ignore[import-not-found]
        import whisperx  # type: ignore[import-not-found]
    except ImportError as exc:
        raise RuntimeError("VIDEO_LAB_WHISPERX_NOT_INSTALLED") from exc

    process = psutil.Process()
    observed_peak_rss = process.memory_info().rss
    model_started = time.perf_counter()
    model = whisperx.load_model(
        args.model, "cpu", compute_type=args.compute_type, language="ko"
    )
    align_model, metadata = whisperx.load_align_model(language_code="ko", device="cpu")
    model_load_seconds = time.perf_counter() - model_started
    observed_peak_rss = max(observed_peak_rss, process.memory_info().rss)

    results = []
    for sample in samples:
        started = time.perf_counter()
        audio = whisperx.load_audio(str(sample["audio_path"]))
        transcript: dict[str, Any] = model.transcribe(audio, batch_size=4, language="ko")
        observed_peak_rss = max(observed_peak_rss, process.memory_info().rss)
        aligned = whisperx.align(
            transcript["segments"],
            align_model,
            metadata,
            audio,
            "cpu",
            return_char_alignments=False,
        )
        processing_seconds = time.perf_counter() - started
        observed_peak_rss = max(observed_peak_rss, process.memory_info().rss)
        results.append(build_sample_result(sample, transcript, aligned, processing_seconds))

    payload = {
        "provider": "whisperx",
        "whisperx_version": package_version("whisperx"),
        "python_version": package_version("python"),
        "language": "ko",
        "device": "cpu",
        "compute_type": args.compute_type,
        "model": args.model,
        "model_load_seconds": round(model_load_seconds, 3),
        "observed_peak_rss_mb": round(observed_peak_rss / 1024 / 1024, 2),
        "samples": results,
        "safety": {
            "VIDEO_LAB_WHISPERX": False,
            "SAFE_TO_UPLOAD": False,
            "SAFE_TO_PUBLIC_UPLOAD": False,
        },
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "status": "completed",
                "provider": "whisperx",
                "device": "cpu",
                "sample_count": len(results),
                "word_count": sum(item["word_count"] for item in results),
            },
            ensure_ascii=True,
        )
    )
    return 0


def load_samples(args: argparse.Namespace) -> list[dict[str, Any]]:
    if args.audio:
        path = Path(args.audio).resolve(strict=True)
        return [{"id": "single", "audio_path": path, "reference": ""}]
    manifest_path = Path(args.manifest).resolve(strict=True)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(manifest, list) or not 1 <= len(manifest) <= 10:
        raise ValueError("VIDEO_LAB_MANIFEST_SAMPLE_COUNT_INVALID")
    samples = []
    for index, item in enumerate(manifest):
        if not isinstance(item, dict):
            raise ValueError("VIDEO_LAB_MANIFEST_ENTRY_INVALID")
        sample_id = item.get("id")
        audio = item.get("audio")
        reference = item.get("reference")
        if not isinstance(sample_id, str) or not sample_id.strip():
            raise ValueError("VIDEO_LAB_SAMPLE_ID_REQUIRED")
        if not isinstance(audio, str) or not isinstance(reference, str) or not reference.strip():
            raise ValueError("VIDEO_LAB_SAMPLE_FIELDS_REQUIRED")
        audio_path = Path(audio).resolve(strict=True)
        if not audio_path.is_file():
            raise ValueError("VIDEO_LAB_AUDIO_FILE_REQUIRED")
        samples.append({"id": sample_id, "audio_path": audio_path, "reference": reference})
    return samples


def build_sample_result(
    sample: dict[str, Any],
    transcript: dict[str, Any],
    aligned: dict[str, Any],
    processing_seconds: float,
) -> dict[str, Any]:
    duration = wav_duration(sample["audio_path"])
    raw_text = " ".join(str(segment.get("text", "")).strip() for segment in transcript["segments"]).strip()
    words = []
    missing_timing = 0
    for segment in aligned.get("segments", []):
        for word in segment.get("words", []):
            if word.get("start") is None or word.get("end") is None:
                missing_timing += 1
                continue
            words.append(
                {
                    "word": str(word.get("word", "")).strip(),
                    "start": round(float(word["start"]), 3),
                    "end": round(float(word["end"]), 3),
                    "confidence": round(float(word["score"]), 4)
                    if word.get("score") is not None
                    else None,
                }
            )
    nonmonotonic = sum(
        1 for previous, current in zip(words, words[1:]) if current["start"] < previous["start"]
    )
    overlap = sum(
        1 for previous, current in zip(words, words[1:]) if current["start"] < previous["end"] - 0.05
    )
    total_word_entries = len(words) + missing_timing
    timeline_pass = bool(words) and nonmonotonic == 0 and overlap == 0 and all(
        0 <= word["start"] < word["end"] <= duration + 0.25 for word in words
    )
    phrases = group_words(words, max_words=5, max_chars=18)
    pop_groups = group_words(words, max_words=3, max_chars=12)
    return {
        "id": sample["id"],
        "audio_duration_seconds": round(duration, 3),
        "processing_seconds": round(processing_seconds, 3),
        "rtf": round(processing_seconds / duration, 3) if duration else None,
        "raw_transcript": raw_text,
        "transcript_similarity": round(similarity(sample["reference"], raw_text), 4),
        "word_count": len(words),
        "aligned_ratio": round(len(words) / total_word_entries, 4) if total_word_entries else 0,
        "missing_timing_count": missing_timing,
        "overlap_count": overlap,
        "nonmonotonic_count": nonmonotonic,
        "caption_timeline_pass": timeline_pass,
        "korean_segmentation_usable": timeline_pass and len(words) >= 3,
        "caption_modes": {
            "WORD": len(words),
            "PHRASE": len(phrases),
            "POP_GROUP": len(pop_groups),
        },
        "words": words,
        "phrase_timeline": phrases,
        "pop_group_timeline": pop_groups,
    }


def group_words(words: list[dict[str, Any]], max_words: int, max_chars: int) -> list[dict[str, Any]]:
    groups: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    for word in words:
        projected = " ".join(item["word"] for item in [*current, word]).strip()
        if current and (len(current) >= max_words or len(projected) > max_chars):
            groups.append(current)
            current = []
        current.append(word)
    if current:
        groups.append(current)
    return [
        {
            "text": " ".join(word["word"] for word in group).strip(),
            "start": group[0]["start"],
            "end": group[-1]["end"],
        }
        for group in groups
    ]


def wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as audio:
        return audio.getnframes() / audio.getframerate()


def similarity(expected: str, actual: str) -> float:
    normalize = lambda value: re.sub(r"[^가-힣a-z0-9]", "", value.lower())
    return SequenceMatcher(None, normalize(expected), normalize(actual)).ratio()


def package_version(package: str) -> str:
    if package == "python":
        import platform

        return platform.python_version()
    from importlib.metadata import version

    return version(package)


if __name__ == "__main__":
    raise SystemExit(main())
