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

    def test_valid_render_plan_supplies_shot_image_and_voice_text(self):
        storage = Mock()
        storage.upload.side_effect = lambda bucket, path, key: f"https://storage.example/{key}"
        payload = _valid_payload() | {
            "image_url": "https://image.example/legacy.jpg",
            "script": "legacy script should not drive render plan mode",
            "render_plan": _valid_render_plan(),
        }
        job = {"id": "job-render-plan", "payload": payload}

        with patch("src.tasks.video_render.require_ffmpeg_for_video_render", return_value="ffmpeg"), \
            patch("src.tasks.video_render.download_image", return_value=Path("temp/job-render-plan/product.jpg")) as download_image, \
            patch("src.tasks.video_render.create_tts_audio", return_value=Path("temp/job-render-plan/voiceover.wav")) as tts, \
            patch("src.tasks.video_render.write_srt", return_value=Path("outputs/job-render-plan/captions.srt")) as srt, \
            patch("src.tasks.video_render.render_vertical_video", return_value=Path("outputs/job-render-plan/video.mp4")) as render, \
            patch("src.tasks.video_render.create_thumbnail", return_value=Path("outputs/job-render-plan/thumbnail.jpg")), \
            patch("src.tasks.video_render.clean_dir", side_effect=_clean_dir_for_test):
            result = run_video_render(job, None, storage, Mock())

        self.assertEqual(download_image.call_args.args[0], "https://image.example/shot-hook.jpg")
        self.assertIn("Hook voice text", tts.call_args.args[0])
        self.assertIn("Detail voice text", tts.call_args.args[0])
        self.assertNotIn("legacy script should not drive render plan mode", tts.call_args.args[0])
        self.assertEqual(tts.call_args.args[0], srt.call_args.args[0])
        self.assertEqual(len(tts.call_args.args[0].splitlines()), 2)
        self.assertEqual(srt.call_args.kwargs["shot_durations"], [3, 5])
        self.assertEqual(render.call_args.args[4], "Render plan product")
        self.assertIn("video_url", result)

    def test_malformed_render_plan_fails_before_ffmpeg_check(self):
        payload = _valid_payload() | {
            "render_plan": {
                "version": "1",
                "shots": [],
            }
        }
        job = {"id": "job-bad-render-plan", "payload": payload}

        with patch(
            "src.tasks.video_render.require_ffmpeg_for_video_render",
            side_effect=AssertionError("ffmpeg should not be checked before render_plan validation"),
        ) as ffmpeg_check:
            with self.assertRaisesRegex(ValueError, "render_plan.shots is required"):
                run_video_render(job, None, None, Mock())

        ffmpeg_check.assert_not_called()

    def test_render_plan_rejects_invalid_duration_before_ffmpeg_check(self):
        render_plan = _valid_render_plan()
        render_plan["shots"][0]["duration_sec"] = True
        payload = _valid_payload() | {"render_plan": render_plan}
        job = {"id": "job-bad-render-plan-duration", "payload": payload}

        with patch(
            "src.tasks.video_render.require_ffmpeg_for_video_render",
            side_effect=AssertionError("ffmpeg should not be checked before render_plan validation"),
        ) as ffmpeg_check:
            with self.assertRaisesRegex(ValueError, "render_plan.shots.duration_sec must be positive"):
                run_video_render(job, None, None, Mock())

        ffmpeg_check.assert_not_called()

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


def _valid_render_plan() -> dict:
    return {
        "version": "1",
        "queue_id": "queue-render-plan-001",
        "product_name": "Render plan product",
        "source": "storyboard_template",
        "disclosure_text": "This content contains affiliate links.",
        "shots": [
            {
                "shot_id": "hook",
                "duration_sec": 3,
                "layout": "title_card",
                "image_role": "product",
                "image_url": "https://image.example/shot-hook.jpg",
                "caption": "Hook caption",
                "voice_text": "Hook voice text",
                "safe_area": "top_title",
            },
            {
                "shot_id": "detail",
                "duration_sec": 5,
                "layout": "detail_check",
                "image_role": "product",
                "image_url": "https://image.example/shot-detail.jpg",
                "caption": "Detail caption",
                "voice_text": "Detail voice text",
                "safe_area": "bottom_caption",
            },
        ],
        "render_target": {
            "width": 1080,
            "height": 1920,
            "fps": 30,
            "aspect_ratio": "9:16",
        },
    }


def _clean_dir_for_test(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


if __name__ == "__main__":
    unittest.main()
