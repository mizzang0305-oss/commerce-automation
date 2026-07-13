from pathlib import Path
import wave


def create_tts_audio(text: str, target: Path, duration_seconds: float | None = None) -> Path:
    if not text.strip():
        raise ValueError("script is required")
    if duration_seconds is not None and (
        isinstance(duration_seconds, bool)
        or not isinstance(duration_seconds, (int, float))
        or duration_seconds <= 0
    ):
        raise ValueError("audio duration must be positive")
    target.parent.mkdir(parents=True, exist_ok=True)
    duration = float(duration_seconds) if duration_seconds is not None else max(2, min(20, len(text) // 12))
    with wave.open(str(target), "w") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(44100)
        wav.writeframes(b"\x00\x00" * int(round(44100 * duration)))
    return target
