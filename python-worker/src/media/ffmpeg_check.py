from dataclasses import dataclass
from pathlib import Path
import shutil
import subprocess


FFMPEG_MISSING_MESSAGE = "ffmpeg가 PATH에 없어 영상 렌더링을 실행하지 못했습니다. ffmpeg -version으로 설치 여부를 확인하세요."


@dataclass(frozen=True)
class FfmpegStatus:
    found: bool
    path: str
    version: str
    safe_message: str


def check_ffmpeg() -> FfmpegStatus:
    ffmpeg_path = shutil.which("ffmpeg")
    if not ffmpeg_path:
        return FfmpegStatus(found=False, path="", version="", safe_message=FFMPEG_MISSING_MESSAGE)

    try:
        completed = subprocess.run(
            [ffmpeg_path, "-version"],
            check=True,
            capture_output=True,
            text=True,
            timeout=10,
        )
    except Exception:
        return FfmpegStatus(
            found=False,
            path=_safe_binary_name(ffmpeg_path),
            version="",
            safe_message="ffmpeg 실행 확인에 실패했습니다. ffmpeg -version으로 PATH와 설치 상태를 확인하세요.",
        )

    first_line = (completed.stdout or completed.stderr or "").splitlines()[0:1]
    return FfmpegStatus(
        found=True,
        path=_safe_binary_name(ffmpeg_path),
        version=first_line[0] if first_line else "ffmpeg version 확인 완료",
        safe_message="ffmpeg 실행 확인 완료",
    )


def require_ffmpeg_for_video_render() -> None:
    status = check_ffmpeg()
    if not status.found:
        raise RuntimeError(status.safe_message)


def _safe_binary_name(path: str) -> str:
    name = Path(path).name
    if name.lower().startswith("ffmpeg"):
        return "ffmpeg"
    return name or "ffmpeg"
