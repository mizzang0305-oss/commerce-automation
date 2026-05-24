from pathlib import Path
import subprocess
from .ffmpeg_check import require_ffmpeg_for_video_render


def render_vertical_video(image_path: Path, audio_path: Path, srt_path: Path, target: Path, title: str) -> Path:
    require_ffmpeg_for_video_render()
    target.parent.mkdir(parents=True, exist_ok=True)
    command = [
        "ffmpeg",
        "-y",
        "-loop",
        "1",
        "-i",
        str(image_path),
        "-i",
        str(audio_path),
        "-vf",
        "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,subtitles=" + str(srt_path).replace("\\", "/"),
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
    return target
