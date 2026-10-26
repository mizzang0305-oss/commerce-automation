from dataclasses import dataclass, replace
from pathlib import Path
import os
import sys
import time
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import cloud_media_job as cloud


@dataclass(frozen=True)
class FakeConfig:
    web_app_base_url: str = "https://commerce-automation.vercel.app"
    s3_endpoint_url: str = "https://abc.r2.cloudflarestorage.com"
    storage_backend: str = "r2"
    job_types: tuple = ("video_render",)
    worker_api_secret: str = "test-placeholder"
    s3_access_key_id: str = "test-placeholder"
    s3_secret_access_key: str = "test-placeholder"
    heartbeat_interval_seconds: int = 5
    worker_id: str = "test"
    r2_media_bucket: str = "minz"
    r2_review_url_ttl_seconds: int = 900
    worker_visual_binding_secret: str = "synthetic-binding-secret"
    korean_voice_provider: str = "local_command"
    korean_voice_provider_approved: bool = True
    korean_voice_command: str = str(Path(__file__).resolve())
    r2_public_base_urls: dict = None

    def __post_init__(self):
        if self.r2_public_base_urls is None:
            object.__setattr__(self, "r2_public_base_urls", {
                bucket: f"https://{bucket}.example.com"
                for bucket in ("rendered-videos", "thumbnails", "subtitles", "upload-packages")
            })


def env(**extra):
    return {"CLOUD_MEDIA_RUN_ENABLED": "true", "CLOUD_RUN_EXECUTION": "pilot-run-1",
            "CLOUD_MEDIA_IMAGE_HOSTS": "assets.example.com", **extra}


def job(url="https://assets.example.com/a.jpg", job_type="video_render"):
    return {"id": "job-42", "job_type": job_type, "payload": {
        "render_plan": {"shots": [{"image_url": url, "duration_sec": 5}]}
    }}


def artifacts():
    return {key: f"https://bucket.example/{key}" for key in
            ("video_url", "thumbnail_url", "srt_url", "upload_package_url")}


class CloudMediaJobTests(unittest.TestCase):
    def test_disabled_by_default_never_claims_or_loads_credentials(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(cloud.main(), 0)
        self.assertFalse(cloud.execution_enabled({}))

    def test_validate_gate_before_claim(self):
        config = FakeConfig()
        self.assertEqual(cloud.validate_cloud_config(config, env()), frozenset({"assets.example.com"}))
        for bad_config in [replace(config, storage_backend="local"),
                           replace(config, job_types=("video_render", "sheet_sync")),
                           replace(config, web_app_base_url="http://localhost:3000"),
                           replace(config, s3_endpoint_url="http://127.0.0.1:8000"),
                           replace(config, korean_voice_provider="disabled"),
                           replace(config, r2_media_bucket="cn-wms-files"),
                           replace(config, worker_visual_binding_secret=""),
                           replace(config, korean_voice_command="/missing/tts")]:
            with self.subTest(config=bad_config):
                with self.assertRaises(cloud.CloudGateError):
                    cloud.validate_cloud_config(bad_config, env())
        with self.assertRaises(cloud.CloudGateError):
            cloud.validate_cloud_config(config, env(CLOUD_RUN_EXECUTION=""))
        with self.assertRaises(cloud.CloudGateError):
            cloud.validate_cloud_config(config, env(CLOUD_MEDIA_IMAGE_HOSTS="*.example.com"))

    def test_host_guard_rejects_private_http_redirect_like_urls(self):
        hosts = frozenset({"assets.example.com"})
        for url in ["http://assets.example.com/p.jpg", "https://127.0.0.1/a.jpg",
                    "https://localhost/a.jpg", "https://assets.example.com:8080/a.jpg",
                    "https://wrong.example.com/a.jpg", "https://x:y@assets.example.com/a.jpg"]:
            with self.subTest(url=url), self.assertRaises(cloud.CloudGateError):
                cloud._validate_input(job(url), hosts)
        self.assertEqual(cloud._validate_input(job(), hosts), "job-42")

    def test_only_one_claim_when_empty_and_when_success(self):
        api = Mock()
        heartbeat_api = Mock()
        cfg = FakeConfig()
        api.claim_job.return_value = None
        renderer = Mock(return_value=artifacts())
        self.assertEqual(cloud.process_one_job(api, heartbeat_api, cfg, Mock(), renderer,
                          frozenset({"assets.example.com"}))["status"], "no_job")
        renderer.assert_not_called()
        api.claim_job.assert_called_once()
        api.reset_mock()
        api.claim_job.return_value = job()
        result = cloud.process_one_job(api, heartbeat_api, cfg, Mock(), renderer,
                                       frozenset({"assets.example.com"}))
        self.assertEqual(result, {"status": "completed", "claimed": 1, "published": False})
        api.claim_job.assert_called_once()
        api.complete_job.assert_called_once_with("job-42", artifacts())
        api.fail_job.assert_not_called()

    def test_invalid_job_reports_safe_failure_and_never_renders(self):
        api = Mock()
        api.claim_job.return_value = job("https://internal.example/a.jpg")
        renderer = Mock()
        with self.assertRaises(cloud.CloudGateError):
            cloud.process_one_job(api, Mock(), FakeConfig(), Mock(), renderer,
                                  frozenset({"assets.example.com"}))
        api.fail_job.assert_called_once_with("job-42", "cloud_media_failure:CloudGateError")
        renderer.assert_not_called()
        api.complete_job.assert_not_called()

    def test_renderer_failure_marks_failed_without_secret_leak(self):
        api = Mock()
        api.claim_job.return_value = job()
        renderer = Mock(side_effect=RuntimeError("https://secret.example?token=TOP_SECRET"))
        with self.assertRaises(RuntimeError):
            cloud.process_one_job(api, Mock(), FakeConfig(), Mock(), renderer,
                                  frozenset({"assets.example.com"}))
        self.assertNotIn("TOP_SECRET", api.fail_job.call_args.args[1])
        api.complete_job.assert_not_called()

    def test_completion_ack_failure_does_not_mark_render_failed(self):
        api = Mock()
        api.claim_job.return_value = job()
        api.complete_job.side_effect = ConnectionError("unknown ack outcome")
        with self.assertRaises(ConnectionError):
            cloud.process_one_job(api, Mock(), FakeConfig(), Mock(), Mock(return_value=artifacts()),
                                  frozenset({"assets.example.com"}))
        api.fail_job.assert_not_called()

    def test_completion_persists_private_object_identity(self):
        api = Mock()
        api.claim_job.return_value = job()
        storage = Mock()
        storage.receipts = [{"bucket": "minz", "key": "media-factory/rendered-videos/job-42/video.mp4",
                             "sha256": "a" * 64, "readback_verified": True}]
        cloud.process_one_job(api, Mock(), FakeConfig(), storage, Mock(return_value=artifacts()),
                              frozenset({"assets.example.com"}))
        sent = api.complete_job.call_args.args[1]
        self.assertEqual(sent["private_artifacts"], storage.receipts)
        self.assertEqual(sent["video_url"], artifacts()["video_url"])

    def test_worker_id_is_unique_per_cloud_execution(self):
        config = FakeConfig()
        a = cloud.cloud_worker_identity(config, env(CLOUD_RUN_EXECUTION="first"))
        b = cloud.cloud_worker_identity(config, env(CLOUD_RUN_EXECUTION="second"))
        self.assertNotEqual(a.worker_id, b.worker_id)
        self.assertEqual(config.worker_id, "test")

    def test_periodic_heartbeat_during_blocking_render(self):
        heartbeat = Mock()
        with cloud.periodic_heartbeat(heartbeat, .01) as check:
            time.sleep(.04)
            check()
        self.assertGreaterEqual(heartbeat.call_count, 2)
        with self.assertRaises(cloud.CloudGateError):
            with cloud.periodic_heartbeat(Mock(side_effect=OSError("connection lost")), .01) as check:
                time.sleep(.03)
                check()


if __name__ == "__main__":
    unittest.main()
