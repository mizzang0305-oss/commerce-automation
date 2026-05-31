from dataclasses import dataclass
from pathlib import Path
import os
from dotenv import load_dotenv


@dataclass(frozen=True)
class WorkerConfig:
    web_app_base_url: str
    worker_api_secret: str
    worker_id: str
    job_types: list[str]
    poll_interval_seconds: int
    heartbeat_interval_seconds: int
    storage_backend: str
    local_storage_base_dir: Path
    public_storage_base_url: str
    s3_endpoint_url: str
    s3_access_key_id: str
    s3_secret_access_key: str
    s3_region: str
    r2_public_base_urls: dict[str, str]


def first_env(*names: str, default: str = "") -> str:
    for name in names:
        value = os.getenv(name, "").strip()
        if value:
            return value
    return default


def load_config() -> WorkerConfig:
    load_dotenv()
    secret = os.getenv("WORKER_API_SECRET", "")
    if not secret:
        raise RuntimeError("WORKER_API_SECRET is required")
    return WorkerConfig(
        web_app_base_url=os.getenv("WEB_APP_BASE_URL", "http://localhost:3000").rstrip("/"),
        worker_api_secret=secret,
        worker_id=os.getenv("WORKER_ID", "python-worker"),
        job_types=[item.strip() for item in os.getenv("WORKER_JOB_TYPES", "video_render,sheet_sync").split(",") if item.strip()],
        poll_interval_seconds=int(os.getenv("POLL_INTERVAL_SECONDS", "10")),
        heartbeat_interval_seconds=int(os.getenv("HEARTBEAT_INTERVAL_SECONDS", "15")),
        storage_backend=os.getenv("STORAGE_BACKEND", "local").strip().lower(),
        local_storage_base_dir=Path(os.getenv("LOCAL_STORAGE_BASE_DIR", "./outputs/storage")),
        public_storage_base_url=first_env(
            "PUBLIC_STORAGE_BASE_URL",
            "SUPABASE_STORAGE_PUBLIC_BASE_URL",
            "R2_PUBLIC_BASE_URL",
            "STORAGE_LOCAL_BASE_URL",
        ).rstrip("/"),
        s3_endpoint_url=first_env("S3_ENDPOINT_URL", "SUPABASE_STORAGE_ENDPOINT_URL", "R2_ENDPOINT_URL"),
        s3_access_key_id=first_env("S3_ACCESS_KEY_ID", "SUPABASE_STORAGE_ACCESS_KEY_ID", "R2_ACCESS_KEY_ID"),
        s3_secret_access_key=first_env("S3_SECRET_ACCESS_KEY", "SUPABASE_STORAGE_SECRET_ACCESS_KEY", "R2_SECRET_ACCESS_KEY"),
        s3_region=first_env("S3_REGION", "SUPABASE_STORAGE_REGION", "R2_REGION", default="auto"),
        r2_public_base_urls={
            "rendered-videos": os.getenv("R2_PUBLIC_BASE_URL_RENDERED_VIDEOS", "").strip().rstrip("/"),
            "thumbnails": os.getenv("R2_PUBLIC_BASE_URL_THUMBNAILS", "").strip().rstrip("/"),
            "subtitles": os.getenv("R2_PUBLIC_BASE_URL_SUBTITLES", "").strip().rstrip("/"),
            "upload-packages": os.getenv("R2_PUBLIC_BASE_URL_UPLOAD_PACKAGES", "").strip().rstrip("/"),
        },
    )
