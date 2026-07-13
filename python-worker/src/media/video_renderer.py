from pathlib import Path
import subprocess

from .subtitle_generator import resolve_subtitle_cue_texts, wrap_caption

VIDEO_WIDTH = 1080
VIDEO_HEIGHT = 1920
VIDEO_FPS = 30
SAFE_MARGIN_X = 72
SAFE_TOP = 120
SAFE_BOTTOM = 240
PRODUCT_IMAGE_TOP = 260
PRODUCT_IMAGE_MAX_WIDTH = 936
PRODUCT_IMAGE_MAX_HEIGHT = 1100
SUBTITLE_FONT_SIZE = 10
SUBTITLE_MARGIN_V = 220
SUBTITLE_STYLE = "compact_safe_area"
TYPOGRAPHY_STYLE = "legacy_commerce_hook_box_v1"
RENDER_LAYOUT_VERSION = "v4-legacy-commerce-typography"
DRAWTEXT_SUBTITLE_FONT_SIZE = 44
DRAWTEXT_SUBTITLE_Y = "h-240-text_h"
DRAWTEXT_BOX_COLOR = "black@0.42"
DRAWTEXT_BOX_BORDER = 24
DRAWTEXT_LINE_STEP = 58
HOOK_FONT_SIZE = 82
HOOK_MAX_CHARS = 12
HOOK_TEXT_Y = 168
HOOK_LINE_STEP = 96
HOOK_BOX_X = 64
HOOK_BOX_Y = 118
HOOK_BOX_WIDTH = 952
HOOK_BOX_HEIGHT = 270
HOOK_BOX_COLOR = "black@0.78"
HOOK_ACCENT_COLOR = "0xfacc15@1"
HOOK_ACCENT_HEIGHT = 10

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
    shot_captions: list[str] | None = None,
    subtitle_dir: Path | None = None,
) -> str:
    safe_srt_path = str(srt_path).replace("\\", "/")
    base_filter = _build_base_video_filter()
    if shot_captions is not None or (subtitle_text and subtitle_text.strip()):
        drawtext_filters = build_drawtext_subtitle_filters(
            subtitle_text or "",
            shot_durations=shot_durations,
            shot_captions=shot_captions,
            subtitle_dir=subtitle_dir or srt_path.parent / "drawtext-subtitles",
        )
        return ",".join([base_filter, *drawtext_filters])
    return f"{base_filter},subtitles={safe_srt_path}:force_style='{build_subtitle_style()}'"


def build_image_sequence_filter_complex(
    srt_path: Path,
    *,
    image_count: int,
    subtitle_text: str | None,
    shot_durations: list[float],
    shot_captions: list[str] | None = None,
    subtitle_dir: Path | None = None,
) -> str:
    _validate_image_sequence(image_count, shot_durations)
    parts: list[str] = []
    shot_labels: list[str] = []
    for index in range(image_count):
        label = f"shot{index}"
        parts.append(
            f"[{index}:v]{_build_base_video_filter()},fps={VIDEO_FPS},"
            f"setsar=1,setpts=PTS-STARTPTS[{label}]"
        )
        shot_labels.append(f"[{label}]")

    parts.append(f"{''.join(shot_labels)}concat=n={image_count}:v=1:a=0[sequence]")
    if shot_captions is not None or (subtitle_text and subtitle_text.strip()):
        drawtext_filters = build_drawtext_subtitle_filters(
            subtitle_text or "",
            shot_durations=shot_durations,
            shot_captions=shot_captions,
            subtitle_dir=subtitle_dir or srt_path.parent / "drawtext-subtitles",
        )
        parts.append(f"[sequence]{','.join(drawtext_filters)}[video]")
    else:
        safe_srt_path = str(srt_path).replace("\\", "/")
        parts.append(
            f"[sequence]subtitles={safe_srt_path}:force_style='{build_subtitle_style()}'[video]"
        )
    return ";".join(parts)


def build_render_command(
    image_path: Path,
    audio_path: Path,
    srt_path: Path,
    target: Path,
    ffmpeg_exe: str,
    *,
    subtitle_text: str | None = None,
    shot_durations: list[float] | None = None,
    shot_captions: list[str] | None = None,
    shot_image_paths: list[Path] | None = None,
) -> list[str]:
    if shot_image_paths is None:
        return [
            ffmpeg_exe,
            "-y",
            "-loop",
            "1",
            "-i",
            str(image_path),
            "-i",
            str(audio_path),
            "-vf",
            build_video_filter(
                srt_path,
                subtitle_text=subtitle_text,
                shot_durations=shot_durations,
                shot_captions=shot_captions,
            ),
            "-c:v",
            "libx264",
            "-tune",
            "stillimage",
            "-c:a",
            "aac",
            "-shortest",
            "-pix_fmt",
            "yuv420p",
            "-color_range",
            "tv",
            str(target),
        ]

    durations = list(shot_durations or [])
    _validate_image_sequence(len(shot_image_paths), durations)
    command = [ffmpeg_exe, "-y"]
    for path, duration in zip(shot_image_paths, durations):
        command.extend(
            [
                "-loop",
                "1",
                "-framerate",
                str(VIDEO_FPS),
                "-t",
                _format_duration_arg(duration),
                "-i",
                str(path),
            ]
        )
    audio_input_index = len(shot_image_paths)
    command.extend(
        [
            "-i",
            str(audio_path),
            "-filter_complex",
            build_image_sequence_filter_complex(
                srt_path,
                image_count=len(shot_image_paths),
                subtitle_text=subtitle_text,
                shot_durations=durations,
                shot_captions=shot_captions,
            ),
            "-map",
            "[video]",
            "-map",
            f"{audio_input_index}:a:0",
            "-c:v",
            "libx264",
            "-tune",
            "stillimage",
            "-c:a",
            "aac",
            "-shortest",
            "-pix_fmt",
            "yuv420p",
            "-color_range",
            "tv",
            str(target),
        ]
    )
    return command


def _build_base_video_filter() -> str:
    return (
        f"scale={PRODUCT_IMAGE_MAX_WIDTH}:{PRODUCT_IMAGE_MAX_HEIGHT}:"
        "force_original_aspect_ratio=decrease:out_range=tv,"
        f"pad={VIDEO_WIDTH}:{VIDEO_HEIGHT}:(ow-iw)/2:{PRODUCT_IMAGE_TOP}:color=0x0f172a,"
        "format=yuv420p"
    )


def _validate_image_sequence(image_count: int, shot_durations: list[float]) -> None:
    if image_count < 2:
        raise ValueError("image sequence requires at least two shot images")
    if len(shot_durations) != image_count:
        raise ValueError("shot image count must match shot duration count")
    for duration in shot_durations:
        if isinstance(duration, bool) or not isinstance(duration, (int, float)) or duration <= 0:
            raise ValueError("shot duration must be positive")


def _format_duration_arg(duration: float) -> str:
    return f"{float(duration):.3f}".rstrip("0").rstrip(".")


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
    shot_captions: list[str] | None = None,
    subtitle_dir: Path,
) -> list[str]:
    cues = _build_subtitle_cues(subtitle_text, shot_durations, shot_captions)
    subtitle_dir.mkdir(parents=True, exist_ok=True)
    filters: list[str] = []
    for index, cue in enumerate(cues, start=1):
        is_hook = index == 1
        enable = f"between(t,{cue['start']:.3f},{cue['end']:.3f})"
        if is_hook:
            filters.extend(
                [
                    "drawbox="
                    f"x={HOOK_BOX_X}:y={HOOK_BOX_Y}:w={HOOK_BOX_WIDTH}:h={HOOK_BOX_HEIGHT}:"
                    f"color={HOOK_BOX_COLOR}:t=fill:enable='{enable}'",
                    "drawbox="
                    f"x={HOOK_BOX_X}:y={HOOK_BOX_Y}:w={HOOK_BOX_WIDTH}:h={HOOK_ACCENT_HEIGHT}:"
                    f"color={HOOK_ACCENT_COLOR}:t=fill:enable='{enable}'",
                    "drawbox="
                    f"x={HOOK_BOX_X}:y={HOOK_BOX_Y + HOOK_BOX_HEIGHT - HOOK_ACCENT_HEIGHT}:"
                    f"w={HOOK_BOX_WIDTH}:h={HOOK_ACCENT_HEIGHT}:"
                    f"color={HOOK_ACCENT_COLOR}:t=fill:enable='{enable}'",
                ]
            )
        lines = str(cue["text"]).splitlines() or [str(cue["text"])]
        for line_index, line in enumerate(lines, start=1):
            text_path = subtitle_dir / f"subtitle-cue-{index:03d}-line-{line_index:02d}.txt"
            text_path.write_text(line, encoding="utf-8")
            textfile = _escape_filter_path(text_path)
            if is_hook:
                filters.append(
                    "drawtext="
                    f"{_drawtext_font_clause(bold=True)}"
                    f"textfile='{textfile}':"
                    "fontcolor=white:"
                    f"fontsize={HOOK_FONT_SIZE}:"
                    "x=(w-text_w)/2:"
                    f"y={HOOK_TEXT_Y + ((line_index - 1) * HOOK_LINE_STEP)}:"
                    "borderw=2:bordercolor=black:"
                    f"enable='{enable}'"
                )
            else:
                y_offset = (len(lines) - line_index) * DRAWTEXT_LINE_STEP
                y_expr = DRAWTEXT_SUBTITLE_Y if y_offset == 0 else f"{DRAWTEXT_SUBTITLE_Y}-{y_offset}"
                filters.append(
                    "drawtext="
                    f"{_drawtext_font_clause()}"
                    f"textfile='{textfile}':"
                    "fontcolor=white:"
                    f"fontsize={DRAWTEXT_SUBTITLE_FONT_SIZE}:"
                    "x=(w-text_w)/2:"
                    f"y={y_expr}:"
                    "box=1:"
                    f"boxcolor={DRAWTEXT_BOX_COLOR}:"
                    f"boxborderw={DRAWTEXT_BOX_BORDER}:"
                    f"enable='{enable}'"
                )
    return filters


def _build_subtitle_cues(
    subtitle_text: str,
    shot_durations: list[float] | None,
    shot_captions: list[str] | None = None,
) -> list[dict[str, float | str]]:
    lines = resolve_subtitle_cue_texts(subtitle_text, shot_durations, shot_captions)
    if shot_durations:
        durations = [float(duration) for duration in shot_durations]
    else:
        lines = lines[:20]
        durations = [1.0 for _ in lines]
    if not lines:
        return []

    cues: list[dict[str, float | str]] = []
    elapsed = 0.0
    for line, duration in zip(lines, durations):
        if duration <= 0:
            raise ValueError("subtitle cue duration must be positive")
        is_hook = len(cues) == 0
        wrapped = "\n".join(
            wrap_caption(
                line,
                max_chars=HOOK_MAX_CHARS if is_hook else 16,
                max_lines=2,
            )
        )
        cues.append({"text": wrapped, "start": elapsed, "end": elapsed + duration})
        elapsed += duration
    return cues


def _drawtext_font_clause(*, bold: bool = False) -> str:
    font_paths = (
        ["C:/Windows/Fonts/malgunbd.ttf", "C:/Windows/Fonts/malgun.ttf"]
        if bold
        else ["C:/Windows/Fonts/malgun.ttf", "C:/Windows/Fonts/arial.ttf"]
    )
    for font_path in font_paths:
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
    image_sequence_used: bool = False,
    unique_image_count: int | None = None,
    caption_voice_separated: bool = False,
) -> dict[str, str]:
    metadata = {
        "render_layout_version": RENDER_LAYOUT_VERSION,
        "subtitle_style": SUBTITLE_STYLE,
        "typography_style": TYPOGRAPHY_STYLE,
        "hook_box_style": "bold_upper_high_contrast",
        "render_plan_used": str(render_plan_used).lower(),
        "image_sequence_used": str(image_sequence_used).lower(),
        "caption_voice_separated": str(caption_voice_separated).lower(),
        "shot_count": str(shot_count),
    }
    if unique_image_count is not None:
        metadata["unique_image_count"] = str(unique_image_count)
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
    shot_captions: list[str] | None = None,
    shot_image_paths: list[Path] | None = None,
) -> Path:
    target.parent.mkdir(parents=True, exist_ok=True)
    command = build_render_command(
        image_path,
        audio_path,
        srt_path,
        target,
        ffmpeg_exe,
        subtitle_text=subtitle_text,
        shot_durations=shot_durations,
        shot_captions=shot_captions,
        shot_image_paths=shot_image_paths,
    )
    subprocess.run(command, check=True, capture_output=True, text=True)
    if not target.exists():
        raise RuntimeError("video render output was not created")
    return target
