#!/usr/bin/env python3
"""Offline Korean voice command for the existing local_command contract.

Requires prepackaged, licensed Supertone/supertonic-3 assets. This command
never downloads models, approves a voice, changes worker flags, or publishes.
"""
import argparse
import os
from pathlib import Path

# Set before importing ONNX Runtime; the API alone misses initialization events.
os.environ["ORT_DISABLE_TELEMETRY"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["DO_NOT_TRACK"] = "1"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--script", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--language", required=True, choices=["ko", "ko-kr"])
    parser.add_argument("--format", required=True, choices=["wav"])
    args = parser.parse_args()
    root = Path(os.environ.get("MINZ_TTS_MODEL_DIR", ""))
    if not root.is_absolute() or not (root / "onnx/tts.json").is_file():
        raise ValueError("PREPACKAGED_ABSOLUTE_MODEL_DIRECTORY_REQUIRED")
    if not (root / "LICENSE").is_file() or not (root / "voice_styles/M1.json").is_file():
        raise ValueError("MODEL_LICENSE_AND_PRESET_REQUIRED")
    if args.script.is_symlink() or not args.script.is_file() or args.script.stat().st_size > 12000:
        raise ValueError("BOUNDED_REGULAR_SCRIPT_REQUIRED")
    text = args.script.read_text(encoding="utf-8").strip()
    if not text or len(text) > 3000 or not any("가" <= c <= "힣" for c in text):
        raise ValueError("KOREAN_TEXT_REQUIRED")
    if args.output.exists() or args.output.is_symlink() or not args.output.parent.is_dir():
        raise ValueError("FRESH_OUTPUT_REQUIRED")
    speed = float(os.environ.get("MELOTTS_SPEED", "1.05"))
    if not 0.7 <= speed <= 2.0:
        raise ValueError("VOICE_SPEED_OUT_OF_RANGE")

    import onnxruntime as ort
    ort.disable_telemetry_events()
    from supertonic import TTS
    model = TTS(model="supertonic-3", model_dir=root, auto_download=False,
                intra_op_num_threads=2, inter_op_num_threads=1)
    style = model.get_voice_style(voice_name="M1")
    audio, _ = model.synthesize(text, voice_style=style, lang="ko",
                              total_steps=8, speed=speed)
    model.save_audio(audio, str(args.output))


if __name__ == "__main__":
    main()
