from pathlib import Path
from ..config import WorkerConfig
from ..storage_client import StorageClient
from ..utils.files import clean_dir
from ..media.image_downloader import download_image
from ..media.ffmpeg_check import require_ffmpeg_for_video_render
from ..media.subtitle_generator import write_srt
from ..media.thumbnail_generator import create_thumbnail
from ..media.tts_generator import create_tts_audio
from ..media.video_renderer import build_render_quality_metadata, render_vertical_video
from ..media.format_aware_visual_calibration import evaluate_runtime_format_profile
from ..media.worker_visual_binding import verify_server_visual_binding


def run_video_render(job: dict, config: WorkerConfig, storage: StorageClient, heartbeat) -> dict:
    payload = job.get("payload", {})
    product_name = str(payload.get("product_name", "product")).strip() or "product"
    affiliate_url = str(payload.get("selected_affiliate_url", "")).strip()
    disclosure_text = str(payload.get("disclosure_text", "")).strip()
    render_plan = payload.get("render_plan")
    if not affiliate_url:
        raise ValueError("selected_affiliate_url is required for video_render")
    if render_plan is None:
        raise ValueError("render_plan is required for server-bound video_render")

    render_context = _context_from_render_plan(render_plan, product_name, disclosure_text)
    product_name = render_context["product_name"]
    image_urls = render_context["image_urls"]
    image_url = image_urls[0]
    voiceover_script = render_context["voiceover_script"]
    shot_captions = render_context["shot_captions"]
    subtitle_text = "\n".join(shot_captions)
    disclosure_text = render_context["disclosure_text"]
    shot_durations = render_context["shot_durations"]

    if not disclosure_text:
        raise ValueError("disclosure_text is required for video_render")
    if not voiceover_script:
        raise ValueError("script is required for video_render")
    if not image_url:
        raise ValueError("image_url or thumbnail_url is required for video_render")

    verified_binding = verify_server_visual_binding(
        job,
        payload,
        render_plan,
        getattr(config, "worker_visual_binding_secret", ""),
    )

    ffmpeg_exe = require_ffmpeg_for_video_render()

    work_dir = clean_dir(Path("temp") / job["id"])
    output_dir = clean_dir(Path("outputs") / job["id"])
    downloaded_by_url: dict[str, Path] = {}
    shot_image_paths: list[Path] = []
    for index, shot_image_url in enumerate(image_urls, start=1):
        image_path = downloaded_by_url.get(shot_image_url)
        if image_path is None:
            target_name = "product.jpg" if len(image_urls) == 1 else f"shot-{index:03d}.jpg"
            image_path = download_image(shot_image_url, work_dir / target_name)
            downloaded_by_url[shot_image_url] = image_path
            heartbeat()
        shot_image_paths.append(image_path)
    image_path = shot_image_paths[0]
    # Preserve the render-plan timeline even when multiple shots reuse the same
    # downloaded image. Download de-duplication is an I/O concern; collapsing
    # the shot list here falls back to the legacy single-image renderer and
    # loses its explicit 30 fps / per-shot duration contract.
    sequence_image_paths = shot_image_paths if len(shot_image_paths) > 1 else None
    visual_gate = evaluate_runtime_format_profile(
        verified_binding["format_name"],
        shot_image_paths,
    )
    if not visual_gate["gate_pass"]:
        raise ValueError(
            "pre_render_visual_gate_blocked:" + ",".join(visual_gate["blockers"])
        )
    planned_duration = sum(shot_durations) if shot_durations else None
    audio_path = create_tts_audio(
        voiceover_script,
        work_dir / "voiceover.wav",
        duration_seconds=planned_duration,
        provider=getattr(config, "korean_voice_provider", "placeholder"),
        provider_approved=getattr(config, "korean_voice_provider_approved", False),
        language=getattr(config, "korean_voice_language", "ko"),
        command=getattr(config, "korean_voice_command", ""),
        reject_windows_sapi=getattr(config, "korean_voice_reject_windows_sapi", True),
        speed=getattr(config, "korean_voice_speed", 1.14),
        timeout_seconds=getattr(config, "korean_voice_timeout_seconds", 600),
        ffmpeg_exe=ffmpeg_exe,
    )
    srt_path = write_srt(
        subtitle_text,
        output_dir / "captions.srt",
        shot_durations=shot_durations,
        shot_captions=shot_captions,
    )
    heartbeat()
    video_path = render_vertical_video(
        image_path,
        audio_path,
        srt_path,
        output_dir / "video.mp4",
        product_name,
        ffmpeg_exe=ffmpeg_exe,
        subtitle_text=subtitle_text,
        shot_durations=shot_durations,
        shot_captions=shot_captions,
        shot_image_paths=sequence_image_paths,
    )
    thumbnail_path = create_thumbnail(image_path, output_dir / "thumbnail.jpg", product_name)
    package_path = output_dir / "upload_package.txt"
    quality_metadata = build_render_quality_metadata(
        render_plan_used=render_plan is not None,
        shot_count=len(shot_durations or []),
        total_duration_sec=sum(shot_durations) if shot_durations else None,
        image_sequence_used=sequence_image_paths is not None,
        unique_image_count=len(downloaded_by_url),
        caption_voice_separated=render_plan is not None,
    )
    quality_metadata_text = "\n".join(f"{key}: {value}" for key, value in quality_metadata.items())
    visual_metadata_text = "\n".join([
        "visual_binding_verified: true",
        f"pre_render_visual_gate_version: {visual_gate['gate_version']}",
        f"pre_render_visual_gate_pass: {str(visual_gate['gate_pass']).lower()}",
        f"pre_render_visual_format: {visual_gate['format_name']}",
    ])
    package_path.write_text(
        f"{product_name}\n\n{voiceover_script}\n\n{disclosure_text}\n{affiliate_url}\n\nRender QA\n{quality_metadata_text}\n{visual_metadata_text}\n",
        encoding="utf-8",
    )

    key_prefix = f"{job['id']}"
    return {
        "video_url": storage.upload("video", video_path, f"{key_prefix}/video.mp4"),
        "thumbnail_url": storage.upload("thumbnail", thumbnail_path, f"{key_prefix}/thumbnail.jpg"),
        "srt_url": storage.upload("subtitle", srt_path, f"{key_prefix}/captions.srt"),
        "upload_package_url": storage.upload("upload_package", package_path, f"{key_prefix}/upload_package.txt"),
        "visual_gate": {
            **visual_gate,
            "binding_verified": True,
        },
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
    shot_captions: list[str] = []
    shot_durations: list[float] = []
    image_urls: list[str] = []
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
        image_urls.append(image_url)
        caption = str(shot.get("caption") or "").strip()
        if not caption:
            raise ValueError("render_plan.shots.caption is required")
        voice_lines.append(voice_text)
        shot_captions.append(caption)
        shot_durations.append(float(duration_sec))

    return {
        "product_name": product_name,
        "image_urls": image_urls,
        "voiceover_script": "\n".join(voice_lines).strip(),
        "shot_captions": shot_captions,
        "disclosure_text": disclosure_text,
        "shot_durations": shot_durations,
    }
