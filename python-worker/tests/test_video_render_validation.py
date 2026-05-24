from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.modules.setdefault("dotenv", SimpleNamespace(load_dotenv=lambda: None))
sys.modules.setdefault("boto3", SimpleNamespace(client=lambda *args, **kwargs: None))

from src.tasks.video_render import run_video_render


class VideoRenderValidationTest(unittest.TestCase):
    def test_missing_payload_fields_are_rejected_before_ffmpeg_check(self):
        cases = [
            ("selected_affiliate_url", "selected_affiliate_url is required"),
            ("disclosure_text", "disclosure_text is required"),
            ("script", "script is required"),
            ("image_url", "image_url is required"),
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


def _valid_payload() -> dict:
    return {
        "product_name": "테스트 상품",
        "image_url": "https://image.example/product.jpg",
        "script": "영상 대본입니다.",
        "selected_affiliate_url": "https://link.coupang.com/a/test",
        "disclosure_text": "이 콘텐츠는 제휴 링크를 포함합니다.",
    }


if __name__ == "__main__":
    unittest.main()
