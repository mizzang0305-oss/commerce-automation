from dataclasses import dataclass
import importlib
import os
import shutil
import subprocess


FFMPEG_MISSING_MESSAGE = "ffmpeg 실행 파일을 찾지 못했습니다. imageio-ffmpeg 또는 시스템 PATH 설정을 확인하세요."
FFMPEG_VERSION_FAILURE_MESSAGE = "ffmpeg 실행 확인 중 오류가 발생했습니다. ffmpeg -version으로 설치 여부를 확인하세요."


@dataclass(frozen=True)
class FfmpegStatus:
    found: bool
    source: str
    exe: str
    version: str
    safe_message: str


def check_ffmpeg() -> FfmpegStatus:
    for source, exe in _candidate_executables():
        status = _check_candidate(source, exe)
        if status.found:
            return status
        if status.safe_message == FFMPEG_VERSION_FAILURE_MESSAGE:
            return status

    return FfmpegStatus(found=False, source="", exe="", version="", safe_message=FFMPEG_MISSING_MESSAGE)


def require_ffmpeg_for_video_render() -> str:
    status = check_ffmpeg()
    if not status.found:
        raise RuntimeError(status.safe_message)
    return status.exe


def _candidate_executables() -> list[tuple[str, str]]:
    candidates: list[tuple[str, str]] = []
    env_exe = os.environ.get("IMAGEIO_FFMPEG_EXE", "").strip()
    if env_exe:
        candidates.append(("env", env_exe))

    imageio_exe = _get_imageio_ffmpeg_exe()
    if imageio_exe:
        candidates.append(("imageio-ffmpeg", imageio_exe))

    system_exe = shutil.which("ffmpeg")
    if system_exe:
        candidates.append(("system-path", system_exe))
    return candidates


def _get_imageio_ffmpeg_exe() -> str:
    try:
        imageio_ffmpeg = importlib.import_module("imageio_ffmpeg")
        return str(imageio_ffmpeg.get_ffmpeg_exe()).strip()
    except Exception:
        return ""


def _check_candidate(source: str, exe: str) -> FfmpegStatus:
    try:
        completed = subprocess.run(
            [exe, "-version"],
            check=False,
            capture_output=True,
            text=True,
            timeout=10,
        )
    except Exception:
        return FfmpegStatus(
            found=False,
            source=source,
            exe="",
            version="",
            safe_message=FFMPEG_VERSION_FAILURE_MESSAGE,
        )

    if completed.returncode != 0:
        return FfmpegStatus(
            found=False,
            source=source,
            exe="",
            version="",
            safe_message=FFMPEG_VERSION_FAILURE_MESSAGE,
        )

    first_line = (completed.stdout or completed.stderr or "").splitlines()[0:1]
    return FfmpegStatus(
        found=True,
        source=source,
        exe=exe,
        version=first_line[0] if first_line else "ffmpeg version 확인 완료",
        safe_message="",
    )
