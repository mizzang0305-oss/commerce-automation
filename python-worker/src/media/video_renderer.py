from pathlib import Path
import subprocess

VIDEO_WIDTH = 1080
VIDEO_HEIGHT = 1920


def build_video_filter(srt_path: Path) -> str:
    safe_srt_path = str(srt_path).replace("\\", "/")
    return (
        f"scale={VIDEO_WIDTH}:{VIDEO_HEIGHT}:force_original_aspect_ratio=decrease,"
        f"pad={VIDEO_WIDTH}:{VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2,"
        f"subtitles={safe_srt_path}"
    )


def render_vertical_video(
    image_path: Path,
    audio_path: Path,
    srt_path: Path,
    target: Path,
    title: str,
    ffmpeg_exe: str,
) -> Path:
    target.parent.mkdir(parents=True, exist_ok=True)
    command = [
        ffmpeg_exe,
        "-y",
        "-loop",
        "1",
        "-i",
        str(image_path),
        "-i",
        str(audio_path),
        "-vf",
        build_video_filter(srt_path),
        "-c:v",
        "libx264",
        "-tune",
        "stillimage",
        "-c:a",
        "aac",
        "-shortest",
        "-pix_fmt",
        "yuv420p",
        str(target),
    ]
    subprocess.run(command, check=True, capture_output=True, text=True)
    if not target.exists():
        raise RuntimeError("video render output was not created")
    return target
