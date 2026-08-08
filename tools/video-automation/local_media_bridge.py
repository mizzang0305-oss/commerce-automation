"""Local-only bridge to approved Worker media primitives. JSON in/out; no external writes."""
from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import wave
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "python-worker"))

from PIL import Image, ImageDraw, ImageFont  # noqa: E402
from src.media.pre_render_visual_evidence_gate import SceneVisualEvidence, evaluate_pre_render_visual_evidence  # noqa: E402
from src.media.subtitle_generator import write_srt  # noqa: E402
from src.media.tts_generator import create_tts_audio  # noqa: E402
from src.media import video_renderer  # noqa: E402


def read_request() -> dict[str, Any]:
    value = json.loads(sys.stdin.read())
    if not isinstance(value, dict):
        raise ValueError("LOCAL_MEDIA_REQUEST_INVALID")
    return value


def emit(value: dict[str, Any]) -> None:
    print(json.dumps(value, ensure_ascii=False))


def visual_gate(request: dict[str, Any]) -> dict[str, Any]:
    paths = [Path(value).resolve(strict=True) for value in request["image_paths"]]
    scenes = [
        SceneVisualEvidence(
            scene_id=f"scene-{index + 1}",
            image_path=path,
            provenance="exact_product_image" if index == 3 else "reviewed_generated_real_usage",
            usage_label_present=index != 3,
        )
        for index, path in enumerate(paths)
    ]
    return evaluate_pre_render_visual_evidence(scenes)


def tts(request: dict[str, Any]) -> dict[str, Any]:
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
    labelled = [label_image(path, work / f"scene-{index + 1:02d}.png", index != 3) for index, path in enumerate(source_paths)]
    captions = request["captions"]
    if not captions:
        raise ValueError("LOCAL_MEDIA_CAPTIONS_REQUIRED")
    audio_path = Path(request["audio_path"]).resolve(strict=True)
    audio_duration = wav_duration(audio_path)
    shot_captions = [str(cue["text"]) for cue in captions]
    shot_captions[0] = str(request["hook"])
    starts = [float(cue["start"]) for cue in captions]
    shot_durations = [max(0.12, (starts[index + 1] if index + 1 < len(starts) else audio_duration) - start) for index, start in enumerate(starts)]
    shot_images = [labelled[index % len(labelled)] for index in range(len(shot_captions))]
    srt = output.parent / "captions.srt"
    write_srt("\n".join(shot_captions), srt, shot_durations, shot_captions)
    video_renderer.HOOK_FONT_SIZE = 104
    video_renderer.HOOK_TEXT_Y = 226
    video_renderer.HOOK_LINE_STEP = 118
    video_renderer.HOOK_BOX_HEIGHT = 360
    video_renderer.render_vertical_video(
        shot_images[0], audio_path, srt, output, str(request["title"]), "ffmpeg",
        subtitle_text="\n".join(shot_captions), shot_durations=shot_durations,
        shot_captions=shot_captions, shot_image_paths=shot_images,
    )
    return {"status": "success", "output": str(output), "shot_count": len(shot_images), "hook_font_px": 104, "usage_labels_separate_from_hook": True}


def inspect(request: dict[str, Any]) -> dict[str, Any]:
    output = Path(request["output"]).resolve(strict=True)
    completed = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(output)],
        check=True, capture_output=True, text=True, timeout=60,
    )
    probe = json.loads(completed.stdout)
    video = next((stream for stream in probe["streams"] if stream.get("codec_type") == "video"), None)
    audio = next((stream for stream in probe["streams"] if stream.get("codec_type") == "audio"), None)
    return {
        "status": "success", "file_size": output.stat().st_size,
        "duration_seconds": float(probe["format"]["duration"]),
        "width": video.get("width") if video else None, "height": video.get("height") if video else None,
        "video_codec": video.get("codec_name") if video else None, "audio_codec": audio.get("codec_name") if audio else None,
        "video_stream": video is not None, "audio_stream": audio is not None,
    }


def label_image(source: Path, target: Path, usage: bool) -> Path:
    with Image.open(source) as opened:
        image = opened.convert("RGB")
    draw = ImageDraw.Draw(image)
    text = "연출된 사용 예시" if usage else "상품 참고 이미지"
    font_path = Path("C:/Windows/Fonts/malgunbd.ttf")
    font = ImageFont.truetype(str(font_path), 38) if font_path.is_file() else ImageFont.load_default()
    box = draw.textbbox((0, 0), text, font=font)
    width = box[2] - box[0]
    draw.rounded_rectangle((32, 32, 64 + width, 94), radius=14, fill=(15, 23, 42))
    draw.text((48, 42), text, fill=(250, 204, 21), font=font)
    image.save(target, "PNG")
    return target


def wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as audio:
        return audio.getnframes() / audio.getframerate()


def main() -> int:
    try:
        request = read_request()
        operation = request.get("operation")
        result = {"visual_gate": visual_gate, "tts": tts, "render": render, "inspect": inspect}[operation](request)
        emit(result)
        return 0
    except Exception as exc:
        message = str(exc)
        safe_error = message if message and all(character.isupper() or character.isdigit() or character in "_:-" for character in message) else "LOCAL_MEDIA_BRIDGE_FAILED"
        emit({"status": "failed", "safe_error": safe_error, "error_type": type(exc).__name__})
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
