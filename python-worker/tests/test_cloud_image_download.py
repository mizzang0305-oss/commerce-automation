from pathlib import Path
import os
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
# No third-party packages are needed for the cloud adapter's own tests.
# Existing image_downloader tests run in the repository's Python environment.
try:
    from src.media.image_downloader import download_image, ImageDownloadError
except ImportError:
    download_image = None


class CloudImageDownloadTests(unittest.TestCase):
    @unittest.skipIf(download_image is None, "requires repository requests dependency")
    def test_cloud_mode_is_redirect_blocking_and_bounded(self):
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.status_code = 200
        response.headers = {"Content-Type": "image/jpeg", "Content-Length": "5"}
        response.iter_content.return_value = [b"hello"]
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {
            "CLOUD_MEDIA_RUN_ENABLED": "true", "CLOUD_MEDIA_IMAGE_HOSTS": "assets.example.com"
        }), patch("src.media.image_downloader.requests.get", return_value=response) as request:
            out = download_image("https://assets.example.com/img.jpg", Path(folder) / "img.jpg")
            self.assertEqual(out.read_bytes(), b"hello")
            self.assertFalse(request.call_args.kwargs["allow_redirects"])
            response.status_code = 302
            with self.assertRaises(ImageDownloadError):
                download_image("https://assets.example.com/img.jpg", Path(folder) / "redirect.jpg")
            request.assert_called()

    @unittest.skipIf(download_image is None, "requires repository requests dependency")
    def test_cloud_mode_denies_nonallowed_source_before_network(self):
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {
            "CLOUD_MEDIA_RUN_ENABLED": "true", "CLOUD_MEDIA_IMAGE_HOSTS": "assets.example.com"
        }), patch("src.media.image_downloader.requests.get") as request:
            with self.assertRaises(ImageDownloadError):
                download_image("https://metadata.google.internal/test", Path(folder) / "img.jpg")
            request.assert_not_called()


if __name__ == "__main__":
    unittest.main()
