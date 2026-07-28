from __future__ import annotations

import json
from pathlib import Path
import shutil
import subprocess

from .korean_text_normalizer import normalize_asr_comparison_text


def validate_korean_asr(
    *,
    audio_path: Path,
    expected_script: str,
    product_name: str,
    work_dir: Path,
    provider: str,
    provider_approved: bool,
    python_executable: str,
    validator_script: str,
    model: str,
    similarity_threshold: float,
    timeout_seconds: int,
) -> dict[str, object]:
    if provider.strip().lower() != "faster_whisper_local_command":
        raise RuntimeError("BLOCKED_KOREAN_ASR_PROVIDER_NOT_CONFIGURED")
    if not provider_approved:
        raise RuntimeError("BLOCKED_KOREAN_ASR_PROVIDER_NOT_APPROVED")
    if not 0.0 < float(similarity_threshold) <= 1.0:
        raise ValueError("korean_asr_similarity_threshold_invalid")

    python_path = Path(python_executable).expanduser()
    script_path = Path(validator_script).expanduser()
    if not python_path.is_absolute() or not python_path.is_file():
        raise RuntimeError("BLOCKED_KOREAN_ASR_PYTHON_INVALID")
    if not script_path.is_absolute() or not script_path.is_file():
        raise RuntimeError("BLOCKED_KOREAN_ASR_SCRIPT_INVALID")

    draft_root = work_dir / "asr"
    slot_root = draft_root / "morning_commute"
    slot_root.mkdir(parents=True, exist_ok=True)
    staged_audio = slot_root / "voiceover.wav"
    shutil.copyfile(audio_path, staged_audio)
    (slot_root / "voiceover-script.txt").write_text(expected_script.strip() + "\n", encoding="utf-8")
    try:
        completed = subprocess.run(
            [
                str(python_path),
                str(script_path),
                "--draft-root",
                str(draft_root),
                "--model",
                model.strip() or "small",
                "--slot",
                "morning_commute",
            ],
            capture_output=True,
            timeout=timeout_seconds,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise RuntimeError("BLOCKED_KOREAN_ASR_EXECUTION_FAILED") from exc

    probe_path = slot_root / "asr-probe.json"
    transcript_path = slot_root / "asr-transcript.txt"
    if completed.returncode not in (0, 1) or not probe_path.is_file() or not transcript_path.is_file():
        raise RuntimeError("BLOCKED_KOREAN_ASR_EXECUTION_FAILED")
    try:
        probe = json.loads(probe_path.read_text(encoding="utf-8"))
        transcript = transcript_path.read_text(encoding="utf-8").strip()
    except (OSError, ValueError, TypeError) as exc:
        raise RuntimeError("BLOCKED_KOREAN_ASR_RESULT_INVALID") from exc

    similarity = float(probe.get("similarity", 0.0))
    normalized_transcript = normalize_asr_comparison_text(transcript)
    anchors = [
        normalize_asr_comparison_text(token)
        for token in product_name.split()
        if len(normalize_asr_comparison_text(token)) >= 2
    ]
    anchor_recognized = any(anchor in normalized_transcript for anchor in anchors)
    passed = bool(transcript) and similarity >= float(similarity_threshold) and anchor_recognized
    result = {
        "provider": "faster_whisper_local_cpu_int8",
        "model": model.strip() or "small",
        "similarity": round(similarity, 4),
        "threshold": float(similarity_threshold),
        "product_anchor_recognized": anchor_recognized,
        "pass": passed,
        "transcript_persisted": False,
        "raw_text_in_result": False,
    }
    if not passed:
        raise RuntimeError(
            "KOREAN_ASR_QUALITY_GATE_FAILED:"
            f"similarity={result['similarity']},anchor={str(anchor_recognized).lower()}"
        )
    return result
