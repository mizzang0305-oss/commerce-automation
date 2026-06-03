from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.media.image_downloader import ImageDownloadError, download_image


class ImageDownloaderTest(unittest.TestCase):
    def test_downloads_http_200_image_content(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            target = Path(temp_dir) / "job-1" / "product.jpg"
            response = _response(
                status_code=200,
                headers={"Content-Type": "image/jpeg"},
                content=b"\xff\xd8\xff\xe0image-bytes",
            )

            with patch("src.media.image_downloader.requests.get", return_value=response) as get:
                result = download_image("https://image.example.com/product.jpg", target)

            self.assertEqual(result, target)
            self.assertEqual(target.read_bytes(), b"\xff\xd8\xff\xe0image-bytes")
            get.assert_called_once()
            self.assertEqual(get.call_args.kwargs["timeout"], 20)

    def test_rejects_non_200_response_with_safe_message(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch(
                "src.media.image_downloader.requests.get",
                return_value=_response(status_code=404, headers={"Content-Type": "image/jpeg"}, content=b"missing"),
            ):
                with self.assertRaisesRegex(ImageDownloadError, "상품 이미지를 다운로드하지 못했습니다"):
                    download_image("https://image.example.com/product.jpg?token=SECRET_VALUE", Path(temp_dir) / "x.jpg")

    def test_rejects_non_image_content_type(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch(
                "src.media.image_downloader.requests.get",
                return_value=_response(status_code=200, headers={"Content-Type": "text/html"}, content=b"<html>"),
            ):
                with self.assertRaisesRegex(ImageDownloadError, "상품 이미지를 다운로드하지 못했습니다"):
                    download_image("https://image.example.com/product.jpg", Path(temp_dir) / "x.jpg")

    def test_rejects_empty_image_body(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch(
                "src.media.image_downloader.requests.get",
                return_value=_response(status_code=200, headers={"Content-Type": "image/png"}, content=b""),
            ):
                with self.assertRaisesRegex(ImageDownloadError, "상품 이미지를 다운로드하지 못했습니다"):
                    download_image("https://image.example.com/product.png", Path(temp_dir) / "x.png")

    def test_timeout_raises_safe_message_without_secret_query(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch(
                "src.media.image_downloader.requests.get",
                side_effect=requests.Timeout("token=SECRET_VALUE"),
            ):
                with self.assertRaises(ImageDownloadError) as context:
                    download_image(
                        "https://image.example.com/product.jpg?token=SECRET_VALUE",
                        Path(temp_dir) / "x.jpg",
                    )

            message = str(context.exception)
            self.assertIn("상품 이미지를 다운로드하지 못했습니다", message)
            self.assertNotIn("SECRET_VALUE", message)
            self.assertNotIn("token=", message)


def _response(status_code: int, headers: dict[str, str], content: bytes):
    response = Mock()
    response.status_code = status_code
    response.headers = headers
    response.content = content
    return response


if __name__ == "__main__":
    unittest.main()
