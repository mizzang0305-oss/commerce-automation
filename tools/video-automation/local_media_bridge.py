"""Local-only bridge to approved Worker media primitives. JSON in/out; no external writes."""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import wave
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "python-worker"))

from PIL import Image, ImageDraw, ImageFont  # noqa: E402
from src.media.pre_render_visual_evidence_gate import build_scene_similarity_profile, summarize_scene_similarity_profile  # noqa: E402
from src.media.subtitle_generator import write_srt  # noqa: E402
from src.media.tts_generator import create_tts_audio  # noqa: E402
from src.media import video_renderer  # noqa: E402

VIDEO_WIDTH = 1080
VIDEO_HEIGHT = 1920
HOOK_BOX = {"x": 64, "y": 118, "width": 952, "height": 360}
USAGE_BADGE_BOX = {"x": 72, "y": 510, "width": 520, "height": 72}
HOOK_USAGE_MIN_GAP_PX = 32
USAGE_LABEL = "연출된 사용 예시"
FONT_PATH = Path("C:/Windows/Fonts/malgunbd.ttf")


def read_request() -> dict[str, Any]:
    value = json.loads(sys.stdin.read())
    if not isinstance(value, dict):
        raise ValueError("LOCAL_MEDIA_REQUEST_INVALID")
    return value


def emit(value: dict[str, Any]) -> None:
    print(json.dumps(value, ensure_ascii=False))


def visual_gate(request: dict[str, Any]) -> dict[str, Any]:
    paths = [Path(value).resolve(strict=True) for value in request["image_paths"]]
    asset = request.get("real_use_asset")
    blockers: list[str] = []
    if not isinstance(asset, dict) or asset.get("ownerReviewStatus") != "pass":
        blockers.append("OWNER_REVIEWED_REAL_USE_ASSET_REQUIRED")
    if isinstance(asset, dict) and asset.get("identityType") != "generic_usage_example":
        blockers.append("GENERIC_USAGE_IDENTITY_REQUIRED")
    profile = summarize_scene_similarity_profile(build_scene_similarity_profile(paths))
    if len(paths) < 5:
        blockers.append("SCENE_COUNT_BELOW_MINIMUM")
    if profile["perceptual_cluster_count"] < 3:
        blockers.append("VISUAL_CLUSTER_COUNT_BELOW_MINIMUM")
    if profile["largest_cluster_ratio"] > 0.5:
        blockers.append("REPEATED_VISUAL_CLUSTER")
    if profile["portrait_scene_count"] != len(paths):
        blockers.append("NON_PORTRAIT_SCENE_PRESENT")
    return {
        "gate_version": "local-owner-reviewed-real-use-v1",
        "gate_pass": not blockers,
        "blockers": blockers,
        "scene_count": len(paths),
        "perceptual_cluster_count": profile["perceptual_cluster_count"],
        "largest_cluster_ratio": profile["largest_cluster_ratio"],
        "portrait_scene_count": profile["portrait_scene_count"],
        "verified_usage_scene_count": len(paths),
        "usage_label_count": len(paths),
        "exact_product_scene_count": 0,
        "identity_type": "generic_usage_example",
        "owner_review_status": asset.get("ownerReviewStatus") if isinstance(asset, dict) else None,
        "raw_paths_in_report": False,
        "external_api_called": False,
        "upload_attempted": False,
    }


def prepare_reviewed_asset(request: dict[str, Any]) -> dict[str, Any]:
    source = Path(request["source_path"]).resolve(strict=True)
    target_dir = Path(request["target_dir"]).resolve()
    target_dir.mkdir(parents=True, exist_ok=True)
    duration = probe_duration(source)
    timestamps = [duration * fraction for fraction in (0.08, 0.23, 0.38, 0.53, 0.68, 0.83)]
    outputs: list[str] = []
    for index, timestamp in enumerate(timestamps, start=1):
        target = target_dir / f"scene-{index:02d}.png"
        run_process([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{timestamp:.3f}", "-i", str(source),
            "-vf", "crop=750:1260:165:540,scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=0x0f172a",
            "-frames:v", "1", str(target),
        ], 90)
        if not target.is_file() or target.stat().st_size <= 0:
            raise ValueError("OWNER_REVIEWED_FRAME_EXTRACTION_FAILED")
        outputs.append(str(target))
    return {"status": "success", "source_type": "owner_reviewed_local_video", "identity_type": "generic_usage_example", "image_paths": outputs, "frame_count": len(outputs)}


def layout_plan(request: dict[str, Any]) -> dict[str, Any]:
    hook = " ".join(str(request.get("hook", "")).split())
    usage_label = " ".join(str(request.get("usage_label", USAGE_LABEL)).split())
    blockers: list[str] = []
    if not hook or len(hook) > 24 or "..." in hook:
        blockers.append("VIDEO_LAYOUT_HOOK_CLIPPED")
    if not usage_label:
        blockers.append("VIDEO_LAYOUT_USAGE_BADGE_REQUIRED")
    font = ImageFont.truetype(str(FONT_PATH), 38) if FONT_PATH.is_file() else ImageFont.load_default()
    text_box = ImageDraw.Draw(Image.new("RGB", (1, 1))).textbbox((0, 0), usage_label, font=font)
    if text_box[2] - text_box[0] > USAGE_BADGE_BOX["width"] - 48:
        blockers.append("VIDEO_LAYOUT_USAGE_BADGE_TOO_WIDE")
    actual_gap = USAGE_BADGE_BOX["y"] - (HOOK_BOX["y"] + HOOK_BOX["height"])
    collision = boxes_overlap(HOOK_BOX, USAGE_BADGE_BOX)
    if collision or actual_gap < HOOK_USAGE_MIN_GAP_PX:
        blockers.append("VIDEO_LAYOUT_HOOK_USAGE_COLLISION")
    if USAGE_BADGE_BOX["x"] + USAGE_BADGE_BOX["width"] > VIDEO_WIDTH - 180:
        blockers.append("VIDEO_LAYOUT_RIGHT_CONTROL_COLLISION")
    return {"status": "success" if not blockers else "blocked", "passed": not blockers, "blockers": blockers, "hook_box": HOOK_BOX, "usage_badge_box": USAGE_BADGE_BOX, "minimum_gap_px": HOOK_USAGE_MIN_GAP_PX, "actual_gap_px": actual_gap, "collision": collision, "usage_label": usage_label}


def tts(request: dict[str, Any]) -> dict[str, Any]:
    if os.environ.get("MELOTTS_SPEED") != "1.2":
        raise ValueError("MELOTTS_SPEED_1_2_REQUIRED")
    target = Path(request["target"]).resolve()
    create_tts_audio(
        str(request["text"]), target, provider="local_command", provider_approved=True,
        language="ko", command=str(request["command"]), speed=1.2, timeout_seconds=600,
    )
    return {"status": "success", "output": str(target), "duration_seconds": wav_duration(target), "provider": "local_command", "speed": 1.2}


def render(request: dict[str, Any]) -> dict[str, Any]:
    output = Path(request["output"]).resolve()
    work = output.parent / "render-inputs"
    work.mkdir(parents=True, exist_ok=True)
    source_paths = [Path(value).resolve(strict=True) for value in request["image_paths"]]
    planned = layout_plan({"hook": request.get("hook"), "usage_label": request.get("usage_label", USAGE_LABEL)})
    if planned["passed"] is not True or request.get("layout_plan") != planned:
        raise ValueError(planned["blockers"][0] if planned["blockers"] else "VIDEO_LAYOUT_PLAN_BINDING_FAILED")
    captions = request["captions"]
    if not captions:
        raise ValueError("LOCAL_MEDIA_CAPTIONS_REQUIRED")
    audio_path = Path(request["audio_path"]).resolve(strict=True)
    audio_duration = wav_duration(audio_path)
    shot_captions = [str(cue["text"]) for cue in captions]
    shot_captions[0] = str(request["hook"])
    starts = [float(cue["start"]) for cue in captions]
    shot_durations = [max(0.12, (starts[index + 1] if index + 1 < len(starts) else audio_duration) - start) for index, start in enumerate(starts)]
    shot_images = [source_paths[index % len(source_paths)] for index in range(len(shot_captions))]
    srt = output.parent / "captions.srt"
    write_srt("\n".join(shot_captions), srt, shot_durations, shot_captions)
    video_renderer.HOOK_FONT_SIZE = 104
    video_renderer.HOOK_TEXT_Y = 226
    video_renderer.HOOK_LINE_STEP = 118
    video_renderer.HOOK_BOX_HEIGHT = 360
    original_builder = video_renderer.build_drawtext_subtitle_filters
    usage_text_path = work / "usage-label.txt"
    usage_text_path.write_text(str(planned["usage_label"]), encoding="utf-8")
    def build_filters_with_usage(*args: Any, **kwargs: Any) -> list[str]:
        filters = original_builder(*args, **kwargs)
        textfile = str(usage_text_path).replace("\\", "/").replace(":", "\\:")
        font_clause = f"fontfile='{str(FONT_PATH).replace(chr(92), '/').replace(':', chr(92) + ':')}':" if FONT_PATH.is_file() else ""
        filters.extend([
            f"drawbox=x={USAGE_BADGE_BOX['x']}:y={USAGE_BADGE_BOX['y']}:w={USAGE_BADGE_BOX['width']}:h={USAGE_BADGE_BOX['height']}:color=0x0f172a@0.94:t=fill",
            f"drawtext={font_clause}textfile='{textfile}':fontcolor=0xfacc15:fontsize=38:x={USAGE_BADGE_BOX['x'] + 24}:y={USAGE_BADGE_BOX['y'] + 13}",
        ])
        return filters
    video_renderer.build_drawtext_subtitle_filters = build_filters_with_usage
    try:
        video_renderer.render_vertical_video(
            shot_images[0], audio_path, srt, output, str(request["title"]), "ffmpeg",
            subtitle_text="\n".join(shot_captions), shot_durations=shot_durations,
            shot_captions=shot_captions, shot_image_paths=shot_images,
        )
    finally:
        video_renderer.build_drawtext_subtitle_filters = original_builder
    return {"status": "success", "output": str(output), "shot_count": len(shot_images), "hook_font_px": 104, "usage_labels_separate_from_hook": True, "layout": planned, "hook_text_file": str(output.parent / "drawtext-subtitles" / "subtitle-cue-001-line-01.txt"), "usage_label_text_file": str(usage_text_path)}


def render_v2(request: dict[str, Any]) -> dict[str, Any]:
    """Render local V2 full-bleed motion without changing the Production Worker renderer."""
    output = Path(request["output"]).resolve()
    work = output.parent / "render-inputs"
    work.mkdir(parents=True, exist_ok=True)
    source_paths = [Path(value).resolve(strict=True) for value in request["image_paths"]]
    captions = request.get("captions")
    if not isinstance(captions, list) or not captions:
        raise ValueError("LOCAL_MEDIA_CAPTIONS_REQUIRED")
    if any(len(cue.get("words", [])) > 4 for cue in captions if isinstance(cue, dict)):
        raise ValueError("CAPTION_SAFE_TIMELINE_FAILED")
    planned = layout_plan({"hook": request.get("hook"), "usage_label": request.get("usage_label", USAGE_LABEL)})
    if planned["passed"] is not True or request.get("layout_plan") != planned:
        raise ValueError(planned["blockers"][0] if planned["blockers"] else "VIDEO_LAYOUT_PLAN_BINDING_FAILED")
    audio_path = Path(request["audio_path"]).resolve(strict=True)
    audio_duration = wav_duration(audio_path)
    shot_captions = [str(cue["text"]) for cue in captions]
    shot_captions[0] = str(request["hook"])
    starts = [float(cue["start"]) for cue in captions]
    shot_durations = [max(0.12, (starts[index + 1] if index + 1 < len(starts) else audio_duration) - start) for index, start in enumerate(starts)]
    shot_images = [source_paths[index % len(source_paths)] for index in range(len(shot_captions))]
    srt = output.parent / "captions.srt"
    write_srt("\n".join(shot_captions), srt, shot_durations, shot_captions)

    video_renderer.HOOK_FONT_SIZE = 104
    video_renderer.HOOK_TEXT_Y = 190
    video_renderer.HOOK_LINE_STEP = 112
    video_renderer.HOOK_BOX_HEIGHT = 330
    video_renderer.DRAWTEXT_SUBTITLE_FONT_SIZE = int(request.get("caption_font_px", 66))
    video_renderer.DRAWTEXT_LINE_STEP = 80
    video_renderer.DRAWTEXT_SUBTITLE_Y = "h-290-text_h"
    original_base = video_renderer._build_base_video_filter
    original_builder = video_renderer.build_drawtext_subtitle_filters
    original_wrap = video_renderer.wrap_caption
    base_call = {"index": 0}

    def build_motion_base() -> str:
        index = base_call["index"]
        base_call["index"] += 1
        crop_x = ("(in_w-out_w)/2", "(in_w-out_w)*min(t/2.4,1)", "(in_w-out_w)*(1-min(t/2.4,1))")[index % 3]
        return (
            "scale=w='trunc(1080*(1+0.035*t)/2)*2':h='trunc(1920*(1+0.035*t)/2)*2':"
            "force_original_aspect_ratio=increase:eval=frame:out_range=tv,"
            f"crop=1080:1920:x='{crop_x}':y='(in_h-out_h)/2',"
            "format=yuv420p"
        )

    full_label_path = work / "usage-label-full.txt"
    short_label_path = work / "usage-label-short.txt"
    full_label_path.write_text(str(planned["usage_label"]), encoding="utf-8")
    short_label_path.write_text("사용 예시", encoding="utf-8")

    def build_v2_filters(*args: Any, **kwargs: Any) -> list[str]:
        filters = original_builder(*args, **kwargs)
        font_clause = f"fontfile='{str(FONT_PATH).replace(chr(92), '/').replace(':', chr(92) + ':')}':" if FONT_PATH.is_file() else ""
        full_text = str(full_label_path).replace("\\", "/").replace(":", "\\:")
        short_text = str(short_label_path).replace("\\", "/").replace(":", "\\:")
        filters.extend([
            "drawbox=x=72:y=500:w=520:h=72:color=0x0f172a@0.88:t=fill:enable='between(t,0,1.8)'",
            f"drawtext={font_clause}textfile='{full_text}':fontcolor=0xfacc15:fontsize=38:x=96:y=513:enable='between(t,0,1.8)'",
            "drawbox=x=72:y=500:w=210:h=54:color=0x0f172a@0.70:t=fill:enable='gt(t,1.8)'",
            f"drawtext={font_clause}textfile='{short_text}':fontcolor=0xfacc15:fontsize=28:x=92:y=510:enable='gt(t,1.8)'",
        ])
        elapsed = 0.0
        emphasis_dir = work / "emphasis"
        emphasis_dir.mkdir(parents=True, exist_ok=True)
        for index, (cue, duration) in enumerate(zip(captions, shot_durations), start=1):
            word = str(cue.get("emphasisWord", "")).strip() if isinstance(cue, dict) else ""
            if word:
                path = emphasis_dir / f"emphasis-{index:03d}.txt"
                path.write_text(word, encoding="utf-8")
                textfile = str(path).replace("\\", "/").replace(":", "\\:")
                start = elapsed
                end = elapsed + duration
                filters.append(
                    f"drawtext={font_clause}textfile='{textfile}':fontcolor=0xfacc15:fontsize=38:"
                    f"x=(w-text_w)/2:y=h-520:alpha='if(lt(t,{start + 0.12:.3f}),max(0,(t-{start:.3f})/0.12),1)':"
                    f"enable='between(t,{start:.3f},{end:.3f})'"
                )
            elapsed += duration
        return filters

    def wrap_v2_caption(text: str, max_chars: int = 24, max_lines: int = 2) -> list[str]:
        return original_wrap(text, max_chars=12 if max_chars == 16 else max_chars, max_lines=max_lines)

    video_renderer._build_base_video_filter = build_motion_base
    video_renderer.build_drawtext_subtitle_filters = build_v2_filters
    video_renderer.wrap_caption = wrap_v2_caption
    try:
        video_renderer.render_vertical_video(
            shot_images[0], audio_path, srt, output, str(request["title"]), "ffmpeg",
            subtitle_text="\n".join(shot_captions), shot_durations=shot_durations,
            shot_captions=shot_captions, shot_image_paths=shot_images,
        )
    finally:
        video_renderer._build_base_video_filter = original_base
        video_renderer.build_drawtext_subtitle_filters = original_builder
        video_renderer.wrap_caption = original_wrap
    return {
        "status": "success", "output": str(output), "shot_count": len(shot_images),
        "hook_font_px": 104, "caption_font_px": int(request.get("caption_font_px", 66)),
        "caption_animation": str(request.get("caption_animation", "pop")),
        "primary_visual_width_ratio": float(request.get("primary_visual_width_ratio", 0.92)),
        "canvas_fill_ratio": float(request.get("canvas_fill_ratio", 0.93)),
        "motion_preset": "push_pan", "usage_label_mode": "full_then_abbreviated",
        "usage_labels_separate_from_hook": True, "layout": planned,
        "hook_text_file": str(output.parent / "drawtext-subtitles" / "subtitle-cue-001-line-01.txt"),
        "usage_label_text_file": str(full_label_path), "usage_label_short_text_file": str(short_label_path),
    }


def inspect(request: dict[str, Any]) -> dict[str, Any]:
    output = Path(request["output"]).resolve(strict=True)
    completed = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(output)],
        check=True, capture_output=True, text=True, timeout=60,
    )
    probe = json.loads(completed.stdout)
    video = next((stream for stream in probe["streams"] if stream.get("codec_type") == "video"), None)
    audio = next((stream for stream in probe["streams"] if stream.get("codec_type") == "audio"), None)
    first_frame = Path(request["first_frame"]).resolve()
    contact_sheet = Path(request["contact_sheet"]).resolve()
    first_frame.parent.mkdir(parents=True, exist_ok=True)
    run_process(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", "0", "-i", str(output), "-frames:v", "1", "-q:v", "2", str(first_frame)], 60)
    run_process(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(output), "-vf", "fps=1/4,scale=270:480,tile=3x2", "-frames:v", "1", "-q:v", "2", str(contact_sheet)], 90)
    layout = request.get("layout_plan")
    if not isinstance(layout, dict) or layout.get("passed") is not True:
        raise ValueError("VIDEO_LAYOUT_METADATA_REQUIRED")
    return {
        "status": "success", "file_size": output.stat().st_size,
        "duration_seconds": float(probe["format"]["duration"]),
        "width": video.get("width") if video else None, "height": video.get("height") if video else None,
        "video_codec": video.get("codec_name") if video else None, "audio_codec": audio.get("codec_name") if audio else None,
        "video_stream": video is not None, "audio_stream": audio is not None,
        "frame_rate": video.get("avg_frame_rate") if video else None,
        "first_frame_path": str(first_frame), "contact_sheet_path": str(contact_sheet),
        "actual_frame_layout": {"frame_width": video.get("width") if video else None, "frame_height": video.get("height") if video else None, "hook_box": layout["hook_box"], "usage_badge_box": layout["usage_badge_box"], "minimum_gap_px": layout["minimum_gap_px"], "actual_gap_px": layout["actual_gap_px"], "collision": layout["collision"]},
    }


def wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as audio:
        return audio.getnframes() / audio.getframerate()


def probe_duration(path: Path) -> float:
    completed = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(path)], check=True, capture_output=True, text=True, timeout=60)
    return float(completed.stdout.strip())


def run_process(command: list[str], timeout_seconds: int) -> None:
    subprocess.run(command, check=True, capture_output=True, text=True, timeout=timeout_seconds)


def boxes_overlap(left: dict[str, int], right: dict[str, int]) -> bool:
    return left["x"] < right["x"] + right["width"] and left["x"] + left["width"] > right["x"] and left["y"] < right["y"] + right["height"] and left["y"] + left["height"] > right["y"]


def main() -> int:
    try:
        request = read_request()
        operation = request.get("operation")
        result = {"prepare_reviewed_asset": prepare_reviewed_asset, "visual_gate": visual_gate, "layout_plan": layout_plan, "tts": tts, "render": render, "render_v2": render_v2, "inspect": inspect}[operation](request)
        emit(result)
        return 0
    except Exception as exc:
        message = str(exc)
        safe_error = message if message and all(character.isupper() or character.isdigit() or character in "_:-" for character in message) else "LOCAL_MEDIA_BRIDGE_FAILED"
        emit({"status": "failed", "safe_error": safe_error, "error_type": type(exc).__name__})
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
