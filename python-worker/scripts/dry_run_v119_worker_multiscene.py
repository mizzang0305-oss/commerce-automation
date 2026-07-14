from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from types import SimpleNamespace
from unittest.mock import patch
import wave

from PIL import Image, ImageDraw


PYTHON_WORKER_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PYTHON_WORKER_ROOT))
sys.dont_write_bytecode = True

# The dry-run only exercises local storage. Keep optional runtime packages from
# becoming prerequisites while ensuring their external code paths stay unused.
sys.modules.setdefault("dotenv", SimpleNamespace(load_dotenv=lambda: None))
sys.modules.setdefault(
    "boto3",
    SimpleNamespace(client=lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("external storage disabled"))),
)

from src.config import WorkerConfig
from src.storage_client import StorageClient
from src.tasks.video_render import run_video_render


JOB_ID = "v119-worker-queue-dry-run"
PLANNED_DURATION_SECONDS = 9.0


def main() -> int:
    try:
        report = run_dry_run()
    except Exception as exc:
        report = {
            "decision": "BLOCKED_V119_LOCAL_WORKER_QUEUE_DRY_RUN_FAILED",
            "mode": "local_mock_storage_no_upload",
            "error_type": type(exc).__name__,
            "worker_api_called": False,
            "external_calls_attempted": False,
            "videos_insert_called": False,
            "comment_threads_insert_called": False,
            "fake_success": False,
            "safe_to_upload": False,
            "safe_to_public_upload": False,
            "raw_urls_printed": False,
            "secrets_printed": False,
        }
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 1

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


def run_dry_run() -> dict[str, object]:
    original_cwd = Path.cwd()
    fixture_root = PYTHON_WORKER_ROOT / "temp" / "v119-worker-queue-fixtures"
    output_root = PYTHON_WORKER_ROOT / "outputs" / JOB_ID
    _reset_local_directory(fixture_root, PYTHON_WORKER_ROOT / "temp")
    fixture_map = _create_fixture_images(fixture_root)
    heartbeat_count = 0

    def heartbeat() -> None:
        nonlocal heartbeat_count
        heartbeat_count += 1

    def copy_fixture(url: str, target: Path) -> Path:
        source = fixture_map.get(url)
        if source is None:
            raise ValueError("unknown local fixture image")
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        return target

    config = WorkerConfig(
        web_app_base_url="http://127.0.0.1:0",
        worker_api_secret="local-dry-run-placeholder",
        worker_id="v119-local-dry-run",
        job_types=["video_render"],
        poll_interval_seconds=10,
        heartbeat_interval_seconds=15,
        storage_backend="local",
        local_storage_base_dir=Path("outputs") / JOB_ID / "storage",
        public_storage_base_url="",
        s3_endpoint_url="",
        s3_access_key_id="",
        s3_secret_access_key="",
        s3_region="auto",
        r2_public_base_urls={},
    )

    try:
        os.chdir(PYTHON_WORKER_ROOT)
        with patch("src.tasks.video_render.download_image", side_effect=copy_fixture):
            result = run_video_render(_build_local_job(), config, StorageClient(config), heartbeat)
    finally:
        os.chdir(original_cwd)

    expected_paths = {
        "video": output_root / "storage" / "rendered-videos" / JOB_ID / "video.mp4",
        "thumbnail": output_root / "storage" / "thumbnails" / JOB_ID / "thumbnail.jpg",
        "subtitle": output_root / "storage" / "subtitles" / JOB_ID / "captions.srt",
        "upload_package": output_root / "storage" / "upload-packages" / JOB_ID / "upload_package.txt",
    }
    artifacts_present = all(path.is_file() and path.stat().st_size > 0 for path in expected_paths.values())
    if len(result) != 4 or not artifacts_present:
        raise RuntimeError("local artifact contract incomplete")

    subtitle_text = expected_paths["subtitle"].read_text(encoding="utf-8")
    cue_count = subtitle_text.count(" --> ")
    captions_only = "음성 전용" not in subtitle_text and cue_count == 3
    audio_duration = _read_wav_duration(PYTHON_WORKER_ROOT / "temp" / JOB_ID / "voiceover.wav")
    video_metadata = _read_video_metadata(expected_paths["video"])
    video_duration = float(video_metadata["duration_seconds"])
    duration_within_tolerance = (
        abs(audio_duration - PLANNED_DURATION_SECONDS) <= 0.01
        and abs(video_duration - PLANNED_DURATION_SECONDS) <= 0.15
    )
    video_profile_ready = (
        video_metadata["codec"] == "h264"
        and video_metadata["width"] == 1080
        and video_metadata["height"] == 1920
        and video_metadata["pixel_format"] == "yuv420p"
        and video_metadata["color_range"] == "tv"
        and video_metadata["fps"] == "30/1"
    )
    if not captions_only or not duration_within_tolerance or not video_profile_ready:
        raise RuntimeError("local media validation failed")

    return {
        "decision": "V119_LOCAL_WORKER_QUEUE_MULTI_SCENE_DRY_RUN_PASS_NO_UPLOAD",
        "mode": "local_mock_storage_no_upload",
        "worker_api_called": False,
        "external_calls_attempted": False,
        "storage_backend": "local",
        "shot_count": 3,
        "unique_image_count": 3,
        "caption_cue_count": cue_count,
        "caption_voice_separated": captions_only,
        "planned_duration_seconds": PLANNED_DURATION_SECONDS,
        "audio_duration_seconds": round(audio_duration, 3),
        "video_duration_seconds": round(video_duration, 3),
        "duration_within_tolerance": duration_within_tolerance,
        "video_profile_ready": video_profile_ready,
        "video_codec": video_metadata["codec"],
        "video_width": video_metadata["width"],
        "video_height": video_metadata["height"],
        "video_pixel_format": video_metadata["pixel_format"],
        "video_color_range": video_metadata["color_range"],
        "video_fps": video_metadata["fps"],
        "heartbeat_count": heartbeat_count,
        "artifacts_present": artifacts_present,
        "preview_relative_path": f"python-worker/outputs/{JOB_ID}/video.mp4",
        "videos_insert_called": False,
        "comment_threads_insert_called": False,
        "scheduler_execution_called": False,
        "fake_success": False,
        "safe_to_upload": False,
        "safe_to_public_upload": False,
        "raw_urls_printed": False,
        "secrets_printed": False,
    }


def _build_local_job() -> dict[str, object]:
    shots = []
    for index in range(1, 4):
        shots.append(
            {
                "shot_id": f"scene-{index}",
                "duration_sec": 3,
                "layout": "hook" if index == 1 else "product_focus",
                "image_role": "product",
                "image_url": f"fixture://shot-{index}",
                "caption": f"장면 {index} 핵심 문구\n두 줄도 한 장면으로 유지",
                "voice_text": f"음성 전용 문장 {index}입니다. 화면 자막과 분리해서 읽습니다.",
                "safe_area": "top_title" if index == 1 else "bottom_caption",
            }
        )
    return {
        "id": JOB_ID,
        "job_type": "video_render",
        "payload": {
            "product_name": "V119 local fixture product",
            "selected_affiliate_url": "fixture://affiliate-evidence-present",
            "disclosure_text": "This local fixture contains affiliate disclosure evidence.",
            "script": "legacy fallback must not be used",
            "render_plan": {
                "version": "1",
                "product_name": "V119 local fixture product",
                "disclosure_text": "This local fixture contains affiliate disclosure evidence.",
                "shots": shots,
            },
        },
    }


def _create_fixture_images(root: Path) -> dict[str, Path]:
    colors = [(27, 94, 32), (21, 101, 192), (198, 40, 40)]
    fixtures: dict[str, Path] = {}
    for index, color in enumerate(colors, start=1):
        path = root / f"shot-{index}.jpg"
        image = Image.new("RGB", (720, 1280), color)
        draw = ImageDraw.Draw(image)
        draw.rectangle((90, 220, 630, 1060), outline="white", width=12)
        draw.text((260, 600), f"SCENE {index}", fill="white")
        image.save(path, quality=92)
        fixtures[f"fixture://shot-{index}"] = path
    return fixtures


def _read_wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as audio:
        return audio.getnframes() / audio.getframerate()


def _read_video_metadata(path: Path) -> dict[str, object]:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        raise RuntimeError("ffprobe is required for V119 dry-run")
    completed = subprocess.run(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "stream=codec_name,width,height,pix_fmt,color_range,r_frame_rate:format=duration",
            "-of",
            "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    payload = json.loads(completed.stdout)
    stream = payload["streams"][0]
    return {
        "duration_seconds": float(payload["format"]["duration"]),
        "codec": stream["codec_name"],
        "width": int(stream["width"]),
        "height": int(stream["height"]),
        "pixel_format": stream["pix_fmt"],
        "color_range": stream.get("color_range", ""),
        "fps": stream["r_frame_rate"],
    }


def _reset_local_directory(path: Path, allowed_root: Path) -> None:
    resolved_path = path.resolve()
    resolved_root = allowed_root.resolve()
    if resolved_path == resolved_root or resolved_root not in resolved_path.parents:
        raise RuntimeError("unsafe local dry-run directory")
    if resolved_path.exists():
        shutil.rmtree(resolved_path)
    resolved_path.mkdir(parents=True, exist_ok=True)


if __name__ == "__main__":
    raise SystemExit(main())
