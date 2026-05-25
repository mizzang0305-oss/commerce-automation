import tempfile
import unittest
from pathlib import Path
import sys
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.modules.setdefault("dotenv", SimpleNamespace(load_dotenv=lambda: None))
sys.modules.setdefault("boto3", SimpleNamespace(client=lambda *args, **kwargs: None))

from src.config import WorkerConfig
from src.storage_client import StorageClient


def make_config(**overrides):
    values = {
        "web_app_base_url": "http://localhost:3000",
        "worker_api_secret": "test-secret",
        "worker_id": "test-worker",
        "job_types": ["video_render"],
        "poll_interval_seconds": 10,
        "heartbeat_interval_seconds": 15,
        "storage_backend": "local",
        "local_storage_base_dir": Path("./outputs/storage"),
        "public_storage_base_url": "http://localhost:3000/mock-storage",
        "s3_endpoint_url": "",
        "s3_access_key_id": "",
        "s3_secret_access_key": "",
        "s3_region": "auto",
    }
    values.update(overrides)
    return WorkerConfig(**values)


class StorageClientTest(unittest.TestCase):
    def test_local_upload_copies_file_and_returns_public_url(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "video.mp4"
            source.write_text("mock video", encoding="utf-8")
            storage_root = Path(temp_dir) / "storage"
            client = StorageClient(
                make_config(
                    local_storage_base_dir=storage_root,
                    public_storage_base_url="http://localhost:3000/mock-storage",
                )
            )

            url = client.upload("video", source, "job-1/video.mp4")

            self.assertEqual(url, "http://localhost:3000/mock-storage/rendered-videos/job-1/video.mp4")
            self.assertEqual((storage_root / "rendered-videos" / "job-1" / "video.mp4").read_text(), "mock video")

    def test_upload_rejects_path_traversal_keys(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "video.mp4"
            source.write_text("mock video", encoding="utf-8")
            client = StorageClient(make_config(local_storage_base_dir=Path(temp_dir) / "storage"))

            with self.assertRaisesRegex(ValueError, "unsafe storage key"):
                client.upload("video", source, "../video.mp4")

    def test_upload_rejects_windows_drive_keys(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "video.mp4"
            source.write_text("mock video", encoding="utf-8")
            client = StorageClient(make_config(local_storage_base_dir=Path(temp_dir) / "storage"))

            with self.assertRaisesRegex(ValueError, "unsafe storage key"):
                client.upload("video", source, "C:/temp/video.mp4")

    def test_s3_compatible_upload_uses_configured_endpoint_and_returns_public_url(self):
        source = Path("artifact.txt")
        config = make_config(
            storage_backend="supabase",
            public_storage_base_url="https://project.supabase.co/storage/v1/object/public",
            s3_endpoint_url="https://project.storage.supabase.co/storage/v1/s3",
            s3_access_key_id="storage-access-key",
            s3_secret_access_key="storage-secret-key",
            s3_region="us-east-1",
        )

        with patch("src.storage_client.boto3.client") as boto_client:
            client = StorageClient(config)

            url = client.upload("upload_package", source, "job-1/upload_package.txt")

        boto_client.assert_called_once_with(
            "s3",
            endpoint_url="https://project.storage.supabase.co/storage/v1/s3",
            aws_access_key_id="storage-access-key",
            aws_secret_access_key="storage-secret-key",
            region_name="us-east-1",
        )
        boto_client.return_value.upload_file.assert_called_once_with(
            "artifact.txt",
            "upload-packages",
            "job-1/upload_package.txt",
            ExtraArgs={"ContentType": "text/plain; charset=utf-8"},
        )
        self.assertEqual(
            url,
            "https://project.supabase.co/storage/v1/object/public/upload-packages/job-1/upload_package.txt",
        )

    def test_supabase_backend_requires_endpoint(self):
        client = StorageClient(
            make_config(
                storage_backend="supabase",
                s3_endpoint_url="",
                s3_access_key_id="storage-access-key",
                s3_secret_access_key="storage-secret-key",
            )
        )

        with self.assertRaisesRegex(RuntimeError, "endpoint"):
            client.upload("video", Path("artifact.mp4"), "job-1/video.mp4")


if __name__ == "__main__":
    unittest.main()
