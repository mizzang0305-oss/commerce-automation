from pathlib import Path
import shutil
from urllib.parse import quote
import boto3
from .config import WorkerConfig


BUCKETS = {
    "video": "rendered-videos",
    "thumbnail": "thumbnails",
    "subtitle": "subtitles",
    "sheet_export": "sheet-exports",
    "upload_package": "upload-packages",
    "product_image": "product-images",
}

CONTENT_TYPES = {
    "video": "video/mp4",
    "thumbnail": "image/jpeg",
    "subtitle": "text/plain; charset=utf-8",
    "sheet_export": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "upload_package": "text/plain; charset=utf-8",
    "product_image": "image/jpeg",
}


class StorageClient:
    def __init__(self, config: WorkerConfig):
        self.config = config

    def upload(self, asset_type: str, path: Path, key: str) -> str:
        bucket = get_bucket(asset_type)
        safe_key = normalize_storage_key(key)
        if self.config.storage_backend == "local":
            target = self.config.local_storage_base_dir / bucket / safe_key
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
            if self.config.public_storage_base_url:
                return build_public_url(self.config.public_storage_base_url, bucket, safe_key)
            return target.resolve().as_uri()

        if self.config.storage_backend in {"s3", "r2", "supabase"}:
            self._validate_s3_compatible_config()
            client = boto3.client(
                "s3",
                endpoint_url=self.config.s3_endpoint_url or None,
                aws_access_key_id=self.config.s3_access_key_id,
                aws_secret_access_key=self.config.s3_secret_access_key,
                region_name=self.config.s3_region,
            )
            client.upload_file(str(path), bucket, safe_key, ExtraArgs={"ContentType": CONTENT_TYPES[asset_type]})
            base = self.config.public_storage_base_url
            return build_public_url(base, bucket, safe_key) if base else f"s3://{bucket}/{safe_key}"

        raise ValueError(f"unsupported STORAGE_BACKEND: {self.config.storage_backend}")

    def _validate_s3_compatible_config(self) -> None:
        if not self.config.s3_access_key_id or not self.config.s3_secret_access_key:
            raise RuntimeError("S3-compatible storage requires access key and secret key")
        if self.config.storage_backend in {"r2", "supabase"} and not self.config.s3_endpoint_url:
            raise RuntimeError(f"{self.config.storage_backend} storage requires an endpoint URL")


def get_bucket(asset_type: str) -> str:
    try:
        return BUCKETS[asset_type]
    except KeyError as exc:
        raise ValueError(f"unsupported asset_type: {asset_type}") from exc


def normalize_storage_key(key: str) -> str:
    normalized = key.replace("\\", "/").strip()
    parts = [part for part in normalized.split("/") if part]
    if not parts or normalized.startswith("/") or any(part == ".." or ":" in part for part in parts):
        raise ValueError("unsafe storage key")
    return "/".join(parts)


def build_public_url(base_url: str, bucket: str, key: str) -> str:
    encoded_key = quote(key, safe="/")
    return f"{base_url.rstrip('/')}/{bucket}/{encoded_key}"
