from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.modules.setdefault("dotenv", SimpleNamespace(load_dotenv=lambda: None))
sys.modules.setdefault("boto3", SimpleNamespace(client=lambda *args, **kwargs: None))

from src.tasks.video_render import run_video_render
from src.media.image_downloader import ImageDownloadError


class VideoRenderValidationTest(unittest.TestCase):
    def test_missing_payload_fields_are_rejected_before_ffmpeg_check(self):
        cases = [
            ("selected_affiliate_url", "selected_affiliate_url is required"),
            ("disclosure_text", "disclosure_text is required"),
            ("script", "script is required"),
            ("image_url", "image_url or thumbnail_url is required"),
        ]

        for field, message in cases:
            with self.subTest(field=field):
                job = {"id": f"job-missing-{field}", "payload": _valid_payload() | {field: "  "}}
                with patch(
                    "src.tasks.video_render.require_ffmpeg_for_video_render",
                    side_effect=AssertionError("ffmpeg should not be checked before payload validation"),
                ) as ffmpeg_check:
                    with self.assertRaisesRegex(ValueError, message):
                        run_video_render(job, None, None, Mock())

                ffmpeg_check.assert_not_called()

    def test_thumbnail_url_can_satisfy_image_payload(self):
        storage = Mock()
        storage.upload.side_effect = lambda bucket, path, key: f"https://storage.example/{key}"
        payload = _valid_payload() | {"image_url": "", "thumbnail_url": "https://image.example/thumb.jpg"}
        job = {"id": "job-thumbnail-fallback", "payload": payload}

        with patch("src.tasks.video_render.require_ffmpeg_for_video_render", return_value="ffmpeg") as ffmpeg_check, \
            patch("src.tasks.video_render.download_image", return_value=Path("temp/job-thumbnail-fallback/product.jpg")) as download_image, \
            patch("src.tasks.video_render.create_tts_audio", return_value=Path("temp/job-thumbnail-fallback/voiceover.wav")), \
            patch("src.tasks.video_render.write_srt", return_value=Path("outputs/job-thumbnail-fallback/captions.srt")), \
            patch("src.tasks.video_render.render_vertical_video", return_value=Path("outputs/job-thumbnail-fallback/video.mp4")), \
            patch("src.tasks.video_render.create_thumbnail", return_value=Path("outputs/job-thumbnail-fallback/thumbnail.jpg")), \
            patch("src.tasks.video_render.clean_dir", side_effect=_clean_dir_for_test):
            result = run_video_render(job, None, storage, Mock())

        ffmpeg_check.assert_called_once()
        download_image.assert_called_once()
        self.assertEqual(download_image.call_args.args[0], "https://image.example/thumb.jpg")
        self.assertIn("video_url", result)

    def test_image_download_failure_does_not_upload_fake_results(self):
        storage = Mock()
        job = {"id": "job-download-failure", "payload": _valid_payload()}

        with patch("src.tasks.video_render.require_ffmpeg_for_video_render", return_value="ffmpeg"), \
            patch("src.tasks.video_render.download_image", side_effect=ImageDownloadError("상품 이미지를 다운로드하지 못했습니다.")), \
            patch("src.tasks.video_render.clean_dir", side_effect=_clean_dir_for_test):
            with self.assertRaisesRegex(ImageDownloadError, "상품 이미지를 다운로드하지 못했습니다"):
                run_video_render(job, None, storage, Mock())

        storage.upload.assert_not_called()


def _valid_payload() -> dict:
    return {
        "product_name": "테스트 상품",
        "image_url": "https://image.example/product.jpg",
        "script": "영상 대본입니다.",
        "selected_affiliate_url": "https://link.coupang.com/a/test",
        "disclosure_text": "이 콘텐츠는 제휴 링크를 포함합니다.",
    }


def _clean_dir_for_test(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


if __name__ == "__main__":
    unittest.main()
