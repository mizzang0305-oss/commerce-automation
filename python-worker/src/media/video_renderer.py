from pathlib import Path
import subprocess
import textwrap

from .subtitle_generator import wrap_caption

VIDEO_WIDTH = 1080
VIDEO_HEIGHT = 1920
SAFE_MARGIN_X = 72
SAFE_TOP = 120
SAFE_BOTTOM = 240
PRODUCT_IMAGE_TOP = 260
PRODUCT_IMAGE_MAX_WIDTH = 936
PRODUCT_IMAGE_MAX_HEIGHT = 1100
SUBTITLE_FONT_SIZE = 10
SUBTITLE_MARGIN_V = 220
SUBTITLE_STYLE = "compact_safe_area"
RENDER_LAYOUT_VERSION = "v3-subtitle-polish"
DRAWTEXT_SUBTITLE_FONT_SIZE = 44
DRAWTEXT_SUBTITLE_Y = "h-240-text_h"
DRAWTEXT_BOX_COLOR = "black@0.42"
DRAWTEXT_BOX_BORDER = 24
DRAWTEXT_LINE_STEP = 58

LAYOUT_PRESETS = {
    "hook": {
        "layout": "hook",
        "image_box": (96, 300, 984, 1180),
        "caption_box": (96, 1240, 984, 1660),
    },
    "product_focus": {
        "layout": "product_focus",
        "image_box": (72, 240, 1008, 1190),
        "caption_box": (96, 1260, 984, 1660),
    },
    "benefit": {
        "layout": "benefit",
        "image_box": (96, 280, 984, 1160),
        "caption_box": (96, 1220, 984, 1660),
    },
    "caution": {
        "layout": "caution",
        "image_box": (132, 300, 948, 1120),
        "caption_box": (96, 1200, 984, 1660),
    },
    "manual_cta": {
        "layout": "manual_cta",
        "image_box": (96, 260, 984, 1100),
        "caption_box": (96, 1160, 984, 1660),
    },
}


def build_video_filter(
    srt_path: Path,
    *,
    subtitle_text: str | None = None,
    shot_durations: list[float] | None = None,
    subtitle_dir: Path | None = None,
) -> str:
    safe_srt_path = str(srt_path).replace("\\", "/")
    base_filter = (
        f"scale={PRODUCT_IMAGE_MAX_WIDTH}:{PRODUCT_IMAGE_MAX_HEIGHT}:force_original_aspect_ratio=decrease,"
        f"pad={VIDEO_WIDTH}:{VIDEO_HEIGHT}:(ow-iw)/2:{PRODUCT_IMAGE_TOP}:color=0x0f172a"
    )
    if subtitle_text and subtitle_text.strip():
        drawtext_filters = build_drawtext_subtitle_filters(
            subtitle_text,
            shot_durations=shot_durations,
            subtitle_dir=subtitle_dir or srt_path.parent / "drawtext-subtitles",
        )
        return ",".join([base_filter, *drawtext_filters])
    return f"{base_filter},subtitles={safe_srt_path}:force_style='{build_subtitle_style()}'"


def build_subtitle_style() -> str:
    return ",".join(
        [
            f"FontSize={SUBTITLE_FONT_SIZE}",
            "Outline=1",
            "Shadow=0",
            "BorderStyle=3",
            "BackColour=&H66000000",
            "PrimaryColour=&H00FFFFFF",
            "Alignment=2",
            f"MarginV={SUBTITLE_MARGIN_V}",
            f"MarginL={SAFE_MARGIN_X}",
            f"MarginR={SAFE_MARGIN_X}",
        ]
    )


def build_drawtext_subtitle_filters(
    subtitle_text: str,
    *,
    shot_durations: list[float] | None,
    subtitle_dir: Path,
) -> list[str]:
    cues = _build_subtitle_cues(subtitle_text, shot_durations)
    subtitle_dir.mkdir(parents=True, exist_ok=True)
    filters: list[str] = []
    for index, cue in enumerate(cues, start=1):
        lines = str(cue["text"]).splitlines() or [str(cue["text"])]
        for line_index, line in enumerate(lines, start=1):
            text_path = subtitle_dir / f"subtitle-cue-{index:03d}-line-{line_index:02d}.txt"
            text_path.write_text(line, encoding="utf-8")
            textfile = _escape_filter_path(text_path)
            font_clause = _drawtext_font_clause()
            y_offset = (len(lines) - line_index) * DRAWTEXT_LINE_STEP
            y_expr = DRAWTEXT_SUBTITLE_Y if y_offset == 0 else f"{DRAWTEXT_SUBTITLE_Y}-{y_offset}"
            filters.append(
                "drawtext="
                f"{font_clause}"
                f"textfile='{textfile}':"
                "fontcolor=white:"
                f"fontsize={DRAWTEXT_SUBTITLE_FONT_SIZE}:"
                "x=(w-text_w)/2:"
                f"y={y_expr}:"
                "box=1:"
                f"boxcolor={DRAWTEXT_BOX_COLOR}:"
                f"boxborderw={DRAWTEXT_BOX_BORDER}:"
                f"enable='between(t,{cue['start']:.3f},{cue['end']:.3f})'"
            )
    return filters


def _build_subtitle_cues(subtitle_text: str, shot_durations: list[float] | None) -> list[dict[str, float | str]]:
    source_lines = [line.strip() for line in subtitle_text.splitlines() if line.strip()]
    if shot_durations:
        lines = source_lines[: len(shot_durations)]
        durations = [float(duration) for duration in shot_durations[: len(lines)]]
    else:
        lines = [line.strip() for line in textwrap.wrap(subtitle_text, width=32) if line.strip()][:20]
        durations = [1.0 for _ in lines]
    if not lines:
        return []

    cues: list[dict[str, float | str]] = []
    elapsed = 0.0
    for line, duration in zip(lines, durations):
        if duration <= 0:
            raise ValueError("subtitle cue duration must be positive")
        wrapped = "\n".join(wrap_caption(line))
        cues.append({"text": wrapped, "start": elapsed, "end": elapsed + duration})
        elapsed += duration
    return cues


def _drawtext_font_clause() -> str:
    for font_path in ["C:/Windows/Fonts/malgun.ttf", "C:/Windows/Fonts/arial.ttf"]:
        if Path(font_path).exists():
            return f"fontfile='{_escape_filter_path(Path(font_path))}':"
    return ""


def _escape_filter_path(path: Path) -> str:
    return str(path).replace("\\", "/").replace(":", "\\:")


def build_shot_layout_config(layout: str | None) -> dict:
    preset = LAYOUT_PRESETS.get(str(layout or "").strip(), LAYOUT_PRESETS["product_focus"])
    _assert_box_inside_canvas(preset["image_box"])
    _assert_box_inside_canvas(preset["caption_box"])
    _assert_box_inside_safe_area(preset["image_box"], preset["caption_box"])
    return dict(preset)


def _assert_box_inside_canvas(box: tuple[int, int, int, int]) -> None:
    x1, y1, x2, y2 = box
    if x1 < 0 or y1 < 0 or x2 > VIDEO_WIDTH or y2 > VIDEO_HEIGHT or x2 <= x1 or y2 <= y1:
        raise ValueError("render layout box must stay inside the vertical canvas")


def _assert_box_inside_safe_area(
    image_box: tuple[int, int, int, int],
    caption_box: tuple[int, int, int, int],
) -> None:
    if image_box[1] < SAFE_TOP:
        raise ValueError("render image box must stay below the top safe area")
    if caption_box[3] > VIDEO_HEIGHT - SAFE_BOTTOM:
        raise ValueError("render caption box must stay above the bottom safe area")
    if image_box[3] >= caption_box[1]:
        raise ValueError("render image and caption boxes must not overlap")


def build_render_quality_metadata(
    *,
    render_plan_used: bool,
    shot_count: int,
    total_duration_sec: float | None,
) -> dict[str, str]:
    metadata = {
        "render_layout_version": RENDER_LAYOUT_VERSION,
        "subtitle_style": SUBTITLE_STYLE,
        "render_plan_used": str(render_plan_used).lower(),
        "shot_count": str(shot_count),
    }
    if total_duration_sec is not None:
        metadata["total_duration_sec"] = f"{total_duration_sec:.2f}".rstrip("0").rstrip(".")
    return metadata


def render_vertical_video(
    image_path: Path,
    audio_path: Path,
    srt_path: Path,
    target: Path,
    title: str,
    ffmpeg_exe: str,
    *,
    subtitle_text: str | None = None,
    shot_durations: list[float] | None = None,
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
        build_video_filter(srt_path, subtitle_text=subtitle_text, shot_durations=shot_durations),
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
