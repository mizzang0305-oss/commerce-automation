from pathlib import Path
from ..config import WorkerConfig
from ..storage_client import StorageClient
from ..utils.files import clean_dir
from ..media.image_downloader import download_image
from ..media.subtitle_generator import write_srt
from ..media.thumbnail_generator import create_thumbnail
from ..media.tts_generator import create_tts_audio
from ..media.video_renderer import render_vertical_video


def run_video_render(job: dict, config: WorkerConfig, storage: StorageClient, heartbeat) -> dict:
    payload = job.get("payload", {})
    product_name = str(payload.get("product_name", "product"))
    image_url = str(payload.get("image_url", ""))
    script = str(payload.get("script", ""))
    affiliate_url = str(payload.get("selected_affiliate_url", ""))
    disclosure_text = str(payload.get("disclosure_text", ""))
    if not affiliate_url:
        raise ValueError("selected_affiliate_url is required for video_render")
    if not disclosure_text:
        raise ValueError("disclosure_text is required for video_render")

    work_dir = clean_dir(Path("temp") / job["id"])
    output_dir = clean_dir(Path("outputs") / job["id"])
    image_path = download_image(image_url, work_dir / "product.jpg")
    heartbeat()
    audio_path = create_tts_audio(script, work_dir / "voiceover.wav")
    srt_path = write_srt(script, output_dir / "captions.srt")
    heartbeat()
    video_path = render_vertical_video(image_path, audio_path, srt_path, output_dir / "video.mp4", product_name)
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
