"""One-shot, fail-closed Cloud Run worker adapter for MINZ Channel OS.

This module does not schedule or publish anything. It consumes at most one
existing ``video_render`` job using the current server API contract.
"""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import replace
from hashlib import sha256
import ipaddress
import json
import os
from pathlib import Path
import re
import threading
from urllib.parse import urlsplit


class CloudGateError(RuntimeError):
    """A cloud-only security or configuration precondition is not met."""


def _on(value: str | None) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes"}


def execution_enabled(environ: dict | None = None) -> bool:
    env = environ if environ is not None else os.environ
    return _on(env.get("CLOUD_MEDIA_RUN_ENABLED"))


def _hostname(value: str, *, context: str) -> str:
    try:
        parsed = urlsplit(value)
        host = (parsed.hostname or "").strip().lower().rstrip(".")
        port = parsed.port
    except ValueError as exc:
        raise CloudGateError(f"{context}: invalid URL") from exc
    if (parsed.scheme.lower() != "https" or not host or parsed.username or parsed.password
            or port not in (None, 443) or parsed.fragment or any(ch.isspace() for ch in value)):
        raise CloudGateError(f"{context}: HTTPS URL required without credentials, nonstandard port, or fragment")
    if host == "localhost" or host.endswith(".localhost") or host.endswith(".local"):
        raise CloudGateError(f"{context}: local hostname is blocked")
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        raise CloudGateError(f"{context}: IP literals are blocked")
    return host


def image_host_allowlist(environ: dict | None = None) -> frozenset[str]:
    env = environ if environ is not None else os.environ
    raw = env.get("CLOUD_MEDIA_IMAGE_HOSTS", "")
    values = [v.strip().lower().rstrip(".") for v in raw.split(",") if v.strip()]
    if not values or len(values) > 25:
        raise CloudGateError("CLOUD_MEDIA_IMAGE_HOSTS requires 1 to 25 explicit image CDN hostnames")
    if any(not re.fullmatch(r"[a-z0-9][a-z0-9.-]*[a-z0-9]", v) or ".." in v or "*" in v for v in values):
        raise CloudGateError("CLOUD_MEDIA_IMAGE_HOSTS cannot contain wildcard or invalid hostnames")
    return frozenset(values)


def validate_cloud_config(config, environ: dict | None = None) -> frozenset[str]:
    """Validate *before claim*, so misconfiguration never consumes a job."""
    env = environ if environ is not None else os.environ
    if not execution_enabled(env):
        raise CloudGateError("CLOUD_MEDIA_RUN_ENABLED must be explicitly enabled")
    if not env.get("CLOUD_RUN_EXECUTION") and not _on(env.get("CLOUD_MEDIA_TEST_ONLY")):
        raise CloudGateError("Cloud Run execution identity is missing")
    _hostname(config.web_app_base_url, context="WEB_APP_BASE_URL")
    _hostname(config.s3_endpoint_url, context="R2_ENDPOINT_URL")
    if config.storage_backend != "r2":
        raise CloudGateError("Cloud media jobs require STORAGE_BACKEND=r2")
    if list(config.job_types) != ["video_render"]:
        raise CloudGateError("Cloud media job types must be video_render only")
    if not config.worker_api_secret or not config.s3_access_key_id or not config.s3_secret_access_key:
        raise CloudGateError("Worker API and R2 credentials must be provided through Secret Manager")
    if (config.korean_voice_provider != "local_command"
            or not config.korean_voice_provider_approved
            or not config.korean_voice_command
            or not Path(config.korean_voice_command).is_file()):
        raise CloudGateError("Approved and packaged Linux Korean TTS executable is required before job claim")
    for bucket in ("rendered-videos", "thumbnails", "subtitles", "upload-packages"):
        _hostname(config.r2_public_base_urls.get(bucket, ""), context=f"R2 {bucket} public URL")
    return image_host_allowlist(env)


def cloud_worker_identity(config, environ: dict | None = None):
    env = environ if environ is not None else os.environ
    identity = f"{env.get('CLOUD_RUN_EXECUTION', 'local-test')}:{env.get('CLOUD_RUN_TASK_INDEX', '0')}"
    suffix = sha256(identity.encode("utf-8")).hexdigest()[:18]
    return replace(config, worker_id=f"minz-cloud-media-{suffix}")


def _validate_input(job: object, allowed_hosts: frozenset[str]) -> str:
    if not isinstance(job, dict):
        raise CloudGateError("Invalid server job contract")
    job_id = job.get("id")
    if not isinstance(job_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", job_id):
        raise CloudGateError("Invalid worker job identifier")
    if job.get("job_type") != "video_render":
        raise CloudGateError("Cloud media jobs only support video_render")
    payload = job.get("payload")
    plan = payload.get("render_plan") if isinstance(payload, dict) else None
    shots = plan.get("shots") if isinstance(plan, dict) else None
    if not isinstance(shots, list) or not (1 <= len(shots) <= 60):
        raise CloudGateError("Cloud media requires a signed render plan with 1-60 shots")
    total_duration = 0.0
    for shot in shots:
        if not isinstance(shot, dict):
            raise CloudGateError("Invalid shot contract")
        host = _hostname(str(shot.get("image_url") or ""), context="Image asset URL")
        if host not in allowed_hosts:
            raise CloudGateError("Image source hostname is not explicitly allowed")
        duration = shot.get("duration_sec")
        if isinstance(duration, bool) or not isinstance(duration, (float, int)) or not 0 < duration <= 900:
            raise CloudGateError("Shot duration must be 0-900 seconds")
        total_duration += duration
    if total_duration > 900:
        raise CloudGateError("Cloud media pilot is limited to 15 minutes")
    return job_id


@contextmanager
def periodic_heartbeat(heartbeat, interval_seconds: float):
    """Keep a claimed job alive while FFmpeg or TTS is blocking.

    The caller must supply a separate API client/session for this thread.
    """
    stop = threading.Event()
    failure = []

    def tick():
        while not stop.wait(interval_seconds):
            try:
                heartbeat()
            except Exception as exc:
                failure.append(type(exc).__name__)
                return

    thread = threading.Thread(target=tick, name="cloud-media-heartbeat", daemon=True)
    thread.start()
    def ensure_healthy():
        if failure:
            raise CloudGateError("Job lease heartbeat failed")

    try:
        yield ensure_healthy
    finally:
        stop.set()
        thread.join(timeout=5)


def process_one_job(api, heartbeat_api, config, storage, renderer, allowed_hosts: frozenset[str]):
    """One claim per execution. A completed artifact is never auto-published.

    Failure-to-ack is *not* translated into a fail_job call, because rendering
    and uploading may already have completed. The operator must reconcile it.
    """
    job = api.claim_job()
    if not job:
        return {"status": "no_job", "claimed": 0, "published": False}

    job_id = job.get("id") if isinstance(job, dict) else None
    try:
        _validate_input(job, allowed_hosts)
        api.heartbeat(job_id)
        with periodic_heartbeat(
            lambda: heartbeat_api.heartbeat(job_id), max(5, config.heartbeat_interval_seconds)
        ) as ensure_alive:
            result = renderer(job, config, storage, lambda: api.heartbeat(job_id))
            ensure_alive()
        ensure_alive()
        if not isinstance(result, dict) or any(
            not isinstance(result.get(field), str)
            or not result[field].startswith("https://")
            for field in ("video_url", "thumbnail_url", "srt_url", "upload_package_url")
        ):
            raise CloudGateError("Cloud rendering requires four HTTPS artifact URLs")
    except Exception as exc:
        # Do not push raw exception text (possibly token-bearing signed URLs) to DB.
        if isinstance(job_id, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,128}", job_id):
            api.fail_job(job_id, f"cloud_media_failure:{type(exc).__name__}")
        raise

    api.complete_job(job_id, result)
    return {"status": "completed", "claimed": 1, "published": False}


def main():
    if not execution_enabled():
        print(json.dumps({"status": "disabled", "claimed": 0, "published": False}))
        return 0
    try:
        from src.runtime_check import ensure_supported_runtime
        ensure_supported_runtime()
        from src.config import load_config
        from src.api_client import WorkerApiClient
        from src.storage_client import StorageClient
        from src.tasks.video_render import run_video_render

        config = load_config()
        allowed_hosts = validate_cloud_config(config)
        config = cloud_worker_identity(config)
        api = WorkerApiClient(config)
        heartbeat_api = WorkerApiClient(config)
        result = process_one_job(api, heartbeat_api, config, StorageClient(config), run_video_render, allowed_hosts)
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception as exc:
        # Avoid logging secrets, raw URLs or even full job payloads.
        print(json.dumps({"status": "error", "error_type": type(exc).__name__, "published": False}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
