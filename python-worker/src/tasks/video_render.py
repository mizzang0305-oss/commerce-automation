from pathlib import Path
from ..config import WorkerConfig
from ..storage_client import StorageClient
from ..utils.files import clean_dir
from ..media.image_downloader import download_image
from ..media.ffmpeg_check import require_ffmpeg_for_video_render
from ..media.subtitle_generator import write_srt
from ..media.thumbnail_generator import create_thumbnail
from ..media.tts_generator import create_tts_audio
from ..media.video_renderer import render_vertical_video


def run_video_render(job: dict, config: WorkerConfig, storage: StorageClient, heartbeat) -> dict:
    payload = job.get("payload", {})
    product_name = str(payload.get("product_name", "product")).strip() or "product"
    affiliate_url = str(payload.get("selected_affiliate_url", "")).strip()
    disclosure_text = str(payload.get("disclosure_text", "")).strip()
    render_plan = payload.get("render_plan")
    if not affiliate_url:
        raise ValueError("selected_affiliate_url is required for video_render")

    if render_plan is not None:
        render_context = _context_from_render_plan(render_plan, product_name, disclosure_text)
        product_name = render_context["product_name"]
        image_url = render_context["image_url"]
        script = render_context["script"]
        disclosure_text = render_context["disclosure_text"]
    else:
        image_url = str(payload.get("image_url") or payload.get("thumbnail_url") or "").strip()
        script = str(payload.get("script", "")).strip()

    if not disclosure_text:
        raise ValueError("disclosure_text is required for video_render")
    if not script:
        raise ValueError("script is required for video_render")
    if not image_url:
        raise ValueError("image_url or thumbnail_url is required for video_render")

    ffmpeg_exe = require_ffmpeg_for_video_render()

    work_dir = clean_dir(Path("temp") / job["id"])
    output_dir = clean_dir(Path("outputs") / job["id"])
    image_path = download_image(image_url, work_dir / "product.jpg")
    heartbeat()
    audio_path = create_tts_audio(script, work_dir / "voiceover.wav")
    srt_path = write_srt(script, output_dir / "captions.srt")
    heartbeat()
    video_path = render_vertical_video(
        image_path,
        audio_path,
        srt_path,
        output_dir / "video.mp4",
        product_name,
        ffmpeg_exe=ffmpeg_exe,
    )
    thumbnail_path = create_thumbnail(image_path, output_dir / "thumbnail.jpg", product_name)
    package_path = output_dir / "upload_package.txt"
    package_path.write_text(
        f"{product_name}\n\n{script}\n\n{disclosure_text}\n{affiliate_url}\n",
        encoding="utf-8",
    )

    key_prefix = f"{job['id']}"
    return {
        "video_url": storage.upload("video", video_path, f"{key_prefix}/video.mp4"),
        "thumbnail_url": storage.upload("thumbnail", thumbnail_path, f"{key_prefix}/thumbnail.jpg"),
        "srt_url": storage.upload("subtitle", srt_path, f"{key_prefix}/captions.srt"),
        "upload_package_url": storage.upload("upload_package", package_path, f"{key_prefix}/upload_package.txt"),
    }


def _context_from_render_plan(render_plan: object, fallback_product_name: str, fallback_disclosure_text: str) -> dict:
    if not isinstance(render_plan, dict):
        raise ValueError("render_plan must be an object")

    shots = render_plan.get("shots")
    if not isinstance(shots, list) or not shots:
        raise ValueError("render_plan.shots is required")

    product_name = str(render_plan.get("product_name") or fallback_product_name or "product").strip() or "product"
    disclosure_text = str(render_plan.get("disclosure_text") or fallback_disclosure_text or "").strip()
    if not disclosure_text:
        raise ValueError("render_plan.disclosure_text is required")

    voice_lines: list[str] = []
    first_image_url = ""
    for index, shot in enumerate(shots, start=1):
        if not isinstance(shot, dict):
            raise ValueError("render_plan.shots must contain objects")
        image_url = str(shot.get("image_url") or "").strip()
        voice_text = str(shot.get("voice_text") or "").strip()
        duration_sec = shot.get("duration_sec")
        if not image_url:
            raise ValueError("render_plan.shots.image_url is required")
        if not voice_text:
            raise ValueError("render_plan.shots.voice_text is required")
        if isinstance(duration_sec, bool) or not isinstance(duration_sec, (int, float)) or duration_sec <= 0:
            raise ValueError("render_plan.shots.duration_sec must be positive")
        if not first_image_url:
            first_image_url = image_url
        caption = str(shot.get("caption") or "").strip()
        voice_lines.append(f"{caption}\n{voice_text}" if caption else voice_text)

    return {
        "product_name": product_name,
        "image_url": first_image_url,
        "script": "\n".join(voice_lines).strip(),
        "disclosure_text": disclosure_text,
    }
