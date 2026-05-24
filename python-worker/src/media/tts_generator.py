from pathlib import Path
import wave


def create_tts_audio(text: str, target: Path) -> Path:
    if not text.strip():
        raise ValueError("script is required")
    target.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(target), "w") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(44100)
        wav.writeframes(b"\x00\x00" * 44100 * max(2, min(20, len(text) // 12)))
    return target
