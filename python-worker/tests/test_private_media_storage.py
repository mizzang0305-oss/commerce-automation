from hashlib import sha256
from io import BytesIO
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

from botocore.exceptions import ClientError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.private_media_storage import PrivateMediaStorage


def configuration(**values):
    return SimpleNamespace(storage_backend="r2", r2_media_bucket=values.get("bucket", "minz"),
        r2_review_url_ttl_seconds=values.get("ttl", 900),
        s3_endpoint_url=values.get("endpoint", "https://" + "a" * 32 + ".r2.cloudflarestorage.com"))


class PrivateMediaStorageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "test.mp4"
        self.data = bytes([0, 1, 127, 128, 254, 255])
        self.path.write_bytes(self.data)
        self.client = Mock()
        self.client.generate_presigned_url.return_value = "https://private.example/video?signature=TEST"
        self.client.get_object.return_value = self.remote(self.data)

    def remote(self, data):
        return {"Body": BytesIO(data), "ContentLength": len(data),
            "Metadata": {"sha256": sha256(data).hexdigest()}, "ContentType": "video/mp4"}

    def test_private_write_readback_and_short_review_url(self):
        storage = PrivateMediaStorage(configuration(), client=self.client)
        url = storage.upload("video", self.path, "pilot-1/video.mp4")
        args = self.client.put_object.call_args.kwargs
        self.assertEqual(args["Bucket"], "minz")
        self.assertEqual(args["Key"], "media-factory/rendered-videos/pilot-1/video.mp4")
        self.assertEqual(args["IfNoneMatch"], "*")
        self.assertEqual(args["Body"], self.data)
        self.assertTrue(storage.receipts[0]["readback_verified"])
        self.assertNotIn("signature", str(storage.receipts))
        self.assertTrue(url.startswith("https://"))
        self.assertEqual(self.client.generate_presigned_url.call_args.kwargs["ExpiresIn"], 900)

    def test_company_bucket_and_wrong_endpoint_rejected_before_write(self):
        for cfg in [configuration(bucket="cn-wms-files"), configuration(bucket="rendered-videos"),
                    configuration(endpoint="https://attacker.example"),
                    configuration(endpoint="https://" + "a" * 32 + ".r2.cloudflarestorage.com/path"),
                    configuration(ttl=86400)]:
            with self.assertRaises(ValueError):
                PrivateMediaStorage(cfg, client=self.client)
        self.client.put_object.assert_not_called()

    def test_key_traversal_and_empty_file_rejected(self):
        storage = PrivateMediaStorage(configuration(), client=self.client)
        for key in ("../video.mp4", "pilot/../video.mp4", "/pilot/video.mp4", "pilot\\video.mp4"):
            with self.assertRaises(ValueError):
                storage.upload("video", self.path, key)
        self.path.write_bytes(b"")
        with self.assertRaises(ValueError):
            storage.upload("video", self.path, "pilot/video.mp4")
        self.client.put_object.assert_not_called()

    def test_corrupt_readback_never_returns_review_url(self):
        self.client.get_object.return_value = self.remote(b"broken")
        storage = PrivateMediaStorage(configuration(), client=self.client)
        with self.assertRaisesRegex(ValueError, "INTEGRITY"):
            storage.upload("video", self.path, "pilot/video.mp4")
        self.assertEqual(storage.receipts, [])
        self.client.generate_presigned_url.assert_not_called()

    def test_existing_identical_object_reconciles_without_overwrite(self):
        self.client.put_object.side_effect = ClientError(
            {"Error": {"Code": "PreconditionFailed"}, "ResponseMetadata": {"HTTPStatusCode": 412}}, "PutObject")
        storage = PrivateMediaStorage(configuration(), client=self.client)
        storage.upload("video", self.path, "pilot/video.mp4")
        self.assertTrue(storage.receipts[0]["reused"])
        self.client.put_object.assert_called_once()

    def test_unknown_put_ack_does_not_retry_or_report_success(self):
        self.client.put_object.side_effect = TimeoutError("ambiguous ack")
        storage = PrivateMediaStorage(configuration(), client=self.client)
        with self.assertRaises(TimeoutError):
            storage.upload("video", self.path, "pilot/video.mp4")
        self.client.put_object.assert_called_once()
        self.client.get_object.assert_not_called()
        self.client.generate_presigned_url.assert_not_called()


if __name__ == "__main__":
    unittest.main()
