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


if __name__ == "__main__":
    unittest.main()
