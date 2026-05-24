from pathlib import Path
import shutil
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


class StorageClient:
    def __init__(self, config: WorkerConfig):
        self.config = config

    def upload(self, asset_type: str, path: Path, key: str) -> str:
        bucket = BUCKETS[asset_type]
        if self.config.storage_backend == "local":
            target = self.config.local_storage_base_dir / bucket / key
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
            if self.config.public_storage_base_url:
                return f"{self.config.public_storage_base_url}/{bucket}/{key}"
            return target.resolve().as_uri()

        if self.config.storage_backend in {"s3", "r2", "supabase"}:
            client = boto3.client(
                "s3",
                endpoint_url=self.config.s3_endpoint_url or None,
                aws_access_key_id=self.config.s3_access_key_id,
                aws_secret_access_key=self.config.s3_secret_access_key,
                region_name=self.config.s3_region,
            )
            client.upload_file(str(path), bucket, key)
            base = self.config.public_storage_base_url
            return f"{base}/{bucket}/{key}" if base else f"s3://{bucket}/{key}"

        raise ValueError(f"unsupported STORAGE_BACKEND: {self.config.storage_backend}")
