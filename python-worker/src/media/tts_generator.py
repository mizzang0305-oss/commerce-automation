from array import array
import os
from pathlib import Path
import shutil
import subprocess
import wave


BLOCKED_NOT_CONFIGURED = "BLOCKED_KOREAN_VOICE_PROVIDER_NOT_CONFIGURED"
BLOCKED_NOT_APPROVED = "VOICE_PROVIDER_NOT_APPROVED"
BLOCKED_NOT_KOREAN = "KOREAN_VOICE_PROVIDER_NOT_KOREAN_CAPABLE"
BLOCKED_DELIVERY_STYLE = "KOREAN_VOICE_DELIVERY_STYLE_NOT_APPROVED"
BLOCKED_SAPI = "VOICEOVER_REJECTED_LOCAL_SAPI_VOICE"
BLOCKED_PAID_OR_CLOUD = "VOICE_PROVIDER_PAID_OR_CLOUD_REQUIRES_APPROVAL"
BLOCKED_COMMAND = "BLOCKED_KOREAN_VOICE_COMMAND_INVALID"
BLOCKED_GENERATION = "BLOCKED_KOREAN_VOICE_GENERATION_FAILED"
BLOCKED_AUDIO = "BLOCKED_KOREAN_VOICE_AUDIO_INVALID"
REQUIRED_DELIVERY_STYLE = "brisk_confident_sales"


def create_tts_audio(
    text: str,
    target: Path,
    duration_seconds: float | None = None,
    *,
    provider: str = "placeholder",
    provider_approved: bool = False,
    language: str = "ko",
    command: str = "",
    reject_windows_sapi: bool = True,
    delivery_style: str = "",
    speed: float = 1.14,
    timeout_seconds: int = 600,
    ffmpeg_exe: str = "ffmpeg",
) -> Path:
    if not text.strip():
        raise ValueError("script is required")
    if duration_seconds is not None and (
        isinstance(duration_seconds, bool)
        or not isinstance(duration_seconds, (int, float))
        or duration_seconds <= 0
    ):
        raise ValueError("audio duration must be positive")
    if isinstance(speed, bool) or not isinstance(speed, (int, float)) or not 0.5 <= float(speed) <= 2.0:
        raise ValueError("voice speed must be between 0.5 and 2.0")
    if isinstance(timeout_seconds, bool) or not isinstance(timeout_seconds, int) or timeout_seconds <= 0:
        raise ValueError("voice timeout must be positive")

    normalized_provider = provider.strip().lower()
    if normalized_provider == "placeholder":
        return _create_placeholder_audio(text, target, duration_seconds)
    if normalized_provider != "local_command" or not command.strip():
        raise RuntimeError(BLOCKED_NOT_CONFIGURED)
    if not provider_approved:
        raise RuntimeError(BLOCKED_NOT_APPROVED)
    if not language.strip().lower().startswith("ko"):
        raise RuntimeError(BLOCKED_NOT_KOREAN)
    normalized_delivery_style = delivery_style.strip()
    if normalized_delivery_style != REQUIRED_DELIVERY_STYLE:
        raise RuntimeError(BLOCKED_DELIVERY_STYLE)

    combined = f"{normalized_provider} {command}".lower()
    if reject_windows_sapi and any(marker in combined for marker in ("windows sapi", "local_sapi", "sapi_voice", "system.speech")):
        raise RuntimeError(BLOCKED_SAPI)
    if any(marker in combined for marker in ("openai", "elevenlabs", "eleven_labs", "naver", "google", "azure", "cloud", "api")):
        raise RuntimeError(BLOCKED_PAID_OR_CLOUD)

    command_path = Path(command).expanduser()
    if not command_path.is_absolute() or not command_path.is_file():
        raise RuntimeError(BLOCKED_COMMAND)

    target = target.resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    script_path = target.with_name(f"{target.stem}.script.txt")
    raw_path = target.with_name(f"{target.stem}.raw.wav")
    script_path.write_text(text.strip(), encoding="utf-8")
    try:
        _run_local_command(
            command_path,
            script_path,
            raw_path,
            language.strip().lower(),
            normalized_delivery_style,
            float(speed),
            timeout_seconds,
        )
        source_duration = _validate_wav(raw_path, require_non_silent=True)
        if duration_seconds is None:
            shutil.move(str(raw_path), str(target))
        else:
            _normalize_duration(
                raw_path,
                target,
                source_duration,
                float(duration_seconds),
                ffmpeg_exe,
                timeout_seconds,
            )
        final_duration = _validate_wav(target, require_non_silent=True)
        if duration_seconds is not None and abs(final_duration - float(duration_seconds)) > 0.12:
            raise RuntimeError(BLOCKED_AUDIO)
        return target
    finally:
        script_path.unlink(missing_ok=True)
        raw_path.unlink(missing_ok=True)


def _create_placeholder_audio(text: str, target: Path, duration_seconds: float | None) -> Path:
    target.parent.mkdir(parents=True, exist_ok=True)
    duration = float(duration_seconds) if duration_seconds is not None else max(2, min(20, len(text) // 12))
    with wave.open(str(target), "w") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(44100)
        wav.writeframes(b"\x00\x00" * int(round(44100 * duration)))
    return target


def _run_local_command(
    command_path: Path,
    script_path: Path,
    output_path: Path,
    language: str,
    delivery_style: str,
    speed: float,
    timeout_seconds: int,
) -> None:
    args = [
        "--script", str(script_path),
        "--output", str(output_path),
        "--language", language,
        "--format", "wav",
    ]
    if command_path.suffix.lower() in {".cmd", ".bat"}:
        command_line = ["cmd.exe", "/d", "/s", "/c", str(command_path), *args]
    else:
        command_line = [str(command_path), *args]
    env = os.environ.copy()
    env["KOREAN_VOICE_DELIVERY_STYLE"] = delivery_style
    env["MELOTTS_SPEED"] = f"{speed:.3f}"
    try:
        completed = subprocess.run(
            command_line,
            cwd=str(command_path.parent),
            env=env,
            capture_output=True,
            timeout=timeout_seconds,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise RuntimeError(BLOCKED_GENERATION) from exc
    if completed.returncode != 0 or not output_path.is_file() or output_path.stat().st_size <= 44:
        raise RuntimeError(BLOCKED_GENERATION)


def _normalize_duration(
    source: Path,
    target: Path,
    source_duration: float,
    target_duration: float,
    ffmpeg_exe: str,
    timeout_seconds: int,
) -> None:
    filters: list[str] = []
    if source_duration > target_duration + 0.05:
        filters.extend(_atempo_filters(source_duration / target_duration))
    filters.extend(["apad", f"atrim=duration={target_duration:.3f}"])
    try:
        completed = subprocess.run(
            [
                ffmpeg_exe,
                "-y",
                "-hide_banner",
                "-loglevel", "error",
                "-i", str(source),
                "-filter:a", ",".join(filters),
                "-ar", "44100",
                "-ac", "1",
                "-c:a", "pcm_s16le",
                str(target),
            ],
            capture_output=True,
            timeout=timeout_seconds,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise RuntimeError(BLOCKED_AUDIO) from exc
    if completed.returncode != 0 or not target.is_file() or target.stat().st_size <= 44:
        raise RuntimeError(BLOCKED_AUDIO)


def _atempo_filters(ratio: float) -> list[str]:
    filters: list[str] = []
    remaining = ratio
    while remaining > 2.0:
        filters.append("atempo=2.000")
        remaining /= 2.0
    filters.append(f"atempo={remaining:.3f}")
    return filters


def _validate_wav(path: Path, *, require_non_silent: bool) -> float:
    try:
        with wave.open(str(path), "rb") as wav:
            channels = wav.getnchannels()
            sample_width = wav.getsampwidth()
            frame_rate = wav.getframerate()
            frame_count = wav.getnframes()
            frames = wav.readframes(frame_count)
    except (OSError, EOFError, wave.Error) as exc:
        raise RuntimeError(BLOCKED_AUDIO) from exc
    if channels <= 0 or sample_width != 2 or frame_rate <= 0 or frame_count <= 0:
        raise RuntimeError(BLOCKED_AUDIO)
    if require_non_silent:
        samples = array("h")
        samples.frombytes(frames)
        if not samples or max(abs(sample) for sample in samples) <= 32:
            raise RuntimeError(BLOCKED_AUDIO)
    return frame_count / frame_rate
