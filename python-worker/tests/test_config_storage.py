import os
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.modules.setdefault("dotenv", SimpleNamespace(load_dotenv=lambda: None))

from src.config import load_config


class WorkerConfigStorageTest(unittest.TestCase):
    def test_supabase_storage_env_aliases_are_supported(self):
        env = {
            "WORKER_API_SECRET": "worker-secret",
            "STORAGE_BACKEND": "supabase",
            "SUPABASE_STORAGE_ENDPOINT_URL": "https://project.storage.supabase.co/storage/v1/s3",
            "SUPABASE_STORAGE_ACCESS_KEY_ID": "storage-access-key",
            "SUPABASE_STORAGE_SECRET_ACCESS_KEY": "storage-secret-key",
            "SUPABASE_STORAGE_REGION": "us-east-1",
            "SUPABASE_STORAGE_PUBLIC_BASE_URL": "https://project.supabase.co/storage/v1/object/public",
        }

        with patch.dict(os.environ, env, clear=True):
            config = load_config()

        self.assertEqual(config.storage_backend, "supabase")
        self.assertEqual(config.s3_endpoint_url, "https://project.storage.supabase.co/storage/v1/s3")
        self.assertEqual(config.s3_access_key_id, "storage-access-key")
        self.assertEqual(config.s3_secret_access_key, "storage-secret-key")
        self.assertEqual(config.s3_region, "us-east-1")
        self.assertEqual(config.public_storage_base_url, "https://project.supabase.co/storage/v1/object/public")

    def test_r2_bucket_public_base_urls_are_loaded_from_env(self):
        env = {
            "WORKER_API_SECRET": "worker-secret",
            "STORAGE_BACKEND": "r2",
            "R2_ENDPOINT_URL": "https://account.r2.cloudflarestorage.com",
            "R2_ACCESS_KEY_ID": "r2-access-key",
            "R2_SECRET_ACCESS_KEY": "r2-secret-key",
            "R2_REGION": "auto",
            "R2_PUBLIC_BASE_URL_RENDERED_VIDEOS": "https://pub-video.r2.dev/",
            "R2_PUBLIC_BASE_URL_THUMBNAILS": "https://pub-thumb.r2.dev",
            "R2_PUBLIC_BASE_URL_SUBTITLES": "https://pub-subtitle.r2.dev",
            "R2_PUBLIC_BASE_URL_UPLOAD_PACKAGES": "https://pub-package.r2.dev",
            "R2_PUBLIC_BASE_URL": "https://fallback.r2.dev",
        }

        with patch.dict(os.environ, env, clear=True):
            config = load_config()

        self.assertTrue(hasattr(config, "r2_public_base_urls"))
        self.assertEqual(
            config.r2_public_base_urls,
            {
                "rendered-videos": "https://pub-video.r2.dev",
                "thumbnails": "https://pub-thumb.r2.dev",
                "subtitles": "https://pub-subtitle.r2.dev",
                "upload-packages": "https://pub-package.r2.dev",
            },
        )


if __name__ == "__main__":
    unittest.main()
