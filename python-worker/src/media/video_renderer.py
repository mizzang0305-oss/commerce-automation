from pathlib import Path
import subprocess

VIDEO_WIDTH = 1080
VIDEO_HEIGHT = 1920
SAFE_MARGIN_X = 72
SAFE_MARGIN_Y = 96

LAYOUT_PRESETS = {
    "hook": {
        "layout": "hook",
        "image_box": (96, 360, 984, 1320),
        "caption_box": (96, 1280, 984, 1710),
    },
    "product_focus": {
        "layout": "product_focus",
        "image_box": (72, 260, 1008, 1340),
        "caption_box": (96, 1360, 984, 1720),
    },
    "benefit": {
        "layout": "benefit",
        "image_box": (96, 300, 984, 1240),
        "caption_box": (96, 1260, 984, 1710),
    },
    "caution": {
        "layout": "caution",
        "image_box": (132, 320, 948, 1180),
        "caption_box": (96, 1220, 984, 1710),
    },
    "manual_cta": {
        "layout": "manual_cta",
        "image_box": (96, 260, 984, 1160),
        "caption_box": (96, 1180, 984, 1700),
    },
}


def build_video_filter(srt_path: Path) -> str:
    safe_srt_path = str(srt_path).replace("\\", "/")
    return (
        f"scale={VIDEO_WIDTH}:{VIDEO_HEIGHT}:force_original_aspect_ratio=decrease,"
        f"pad={VIDEO_WIDTH}:{VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=0x0f172a,"
        f"subtitles={safe_srt_path}:force_style='FontSize=12,Outline=1,MarginV=180'"
    )


def build_shot_layout_config(layout: str | None) -> dict:
    preset = LAYOUT_PRESETS.get(str(layout or "").strip(), LAYOUT_PRESETS["product_focus"])
    _assert_box_inside_canvas(preset["image_box"])
    _assert_box_inside_canvas(preset["caption_box"])
    return dict(preset)


def _assert_box_inside_canvas(box: tuple[int, int, int, int]) -> None:
    x1, y1, x2, y2 = box
    if x1 < 0 or y1 < 0 or x2 > VIDEO_WIDTH or y2 > VIDEO_HEIGHT or x2 <= x1 or y2 <= y1:
        raise ValueError("render layout box must stay inside the vertical canvas")


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
