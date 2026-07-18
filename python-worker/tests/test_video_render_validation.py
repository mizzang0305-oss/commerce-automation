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
    def setUp(self):
        self.binding_patch = patch(
            "src.tasks.video_render.verify_server_visual_binding",
            return_value={
                "binding_verified": True,
                "format_name": "product_reference_repeat",
                "target_category": "test",
                "scene_count": 2,
            },
        )
        self.gate_patch = patch(
            "src.tasks.video_render.evaluate_runtime_format_profile",
            return_value={
                "gate_version": "v140",
                "gate_pass": True,
                "format_name": "product_reference_repeat",
                "blockers": [],
                "scene_count": 2,
                "exact_file_hash_count": 2,
                "perceptual_cluster_count": 2,
                "largest_cluster_ratio": 0.5,
                "raw_paths_in_report": False,
                "external_api_called": False,
                "upload_attempted": False,
            },
        )
        self.v143_gate_patch = patch(
            "src.tasks.video_render.evaluate_v143_worker_pre_render_policy",
            return_value={
                "gate_version": "v143",
                "gate_pass": True,
                "blockers": [],
                "binding_verified": True,
                "raw_evidence_in_report": False,
                "external_api_called": False,
                "upload_attempted": False,
                "SAFE_TO_UPLOAD": False,
                "SAFE_TO_PUBLIC_UPLOAD": False,
            },
        )
        self.binding_patch.start()
        self.gate_patch.start()
        self.v143_gate_patch.start()
        self.addCleanup(self.binding_patch.stop)
        self.addCleanup(self.gate_patch.stop)
        self.addCleanup(self.v143_gate_patch.stop)

    def test_missing_payload_fields_are_rejected_before_ffmpeg_check(self):
        missing_affiliate = _valid_payload() | {"selected_affiliate_url": "  "}
        missing_disclosure = _valid_payload()
        missing_disclosure["disclosure_text"] = ""
        missing_disclosure["render_plan"]["disclosure_text"] = ""
        missing_script = _valid_payload()
        missing_script["render_plan"]["shots"][0]["voice_text"] = ""
        missing_image = _valid_payload()
        missing_image["render_plan"]["shots"][0]["image_url"] = ""
        cases = [
            ("selected_affiliate_url", missing_affiliate, "selected_affiliate_url is required"),
            ("disclosure_text", missing_disclosure, "render_plan.disclosure_text is required"),
            ("script", missing_script, "render_plan.shots.voice_text is required"),
            ("image_url", missing_image, "render_plan.shots.image_url is required"),
        ]

        for field, payload, message in cases:
            with self.subTest(field=field):
                job = {"id": f"job-missing-{field}", "payload": payload}
                with patch(
                    "src.tasks.video_render.require_ffmpeg_for_video_render",
                    side_effect=AssertionError("ffmpeg should not be checked before payload validation"),
                ) as ffmpeg_check:
                    with self.assertRaisesRegex(ValueError, message):
                        run_video_render(job, None, None, Mock())

                ffmpeg_check.assert_not_called()

    def test_render_plan_is_required_before_ffmpeg_check(self):
        payload = _valid_payload()
        payload.pop("render_plan")
        with patch(
            "src.tasks.video_render.require_ffmpeg_for_video_render",
            side_effect=AssertionError("ffmpeg must not run for an unsigned legacy payload"),
        ) as ffmpeg_check:
            with self.assertRaisesRegex(ValueError, "render_plan is required for server-bound video_render"):
                run_video_render({"id": "job-no-render-plan", "payload": payload}, None, None, Mock())
        ffmpeg_check.assert_not_called()

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
            patch("src.tasks.video_render.download_image", side_effect=_download_to_target) as download_image, \
            patch("src.tasks.video_render.create_tts_audio", return_value=Path("temp/job-render-plan/voiceover.wav")) as tts, \
            patch("src.tasks.video_render.write_srt", return_value=Path("outputs/job-render-plan/captions.srt")) as srt, \
            patch("src.tasks.video_render.render_vertical_video", return_value=Path("outputs/job-render-plan/video.mp4")) as render, \
            patch("src.tasks.video_render.create_thumbnail", return_value=Path("outputs/job-render-plan/thumbnail.jpg")) as thumbnail, \
            patch("src.tasks.video_render.clean_dir", side_effect=_clean_dir_for_test):
            result = run_video_render(job, None, storage, Mock())

        self.assertEqual(download_image.call_count, 2)
        self.assertEqual(
            [call.args[0] for call in download_image.call_args_list],
            ["https://image.example/shot-hook.jpg", "https://image.example/shot-detail.jpg"],
        )
        self.assertEqual(
            [call.args[1] for call in download_image.call_args_list],
            [Path("temp/job-render-plan/shot-001.jpg"), Path("temp/job-render-plan/shot-002.jpg")],
        )
        self.assertEqual(tts.call_args.args[0], "Hook voice text\nDetail voice text")
        self.assertNotIn("legacy script should not drive render plan mode", tts.call_args.args[0])
        self.assertNotIn("Hook caption", tts.call_args.args[0])
        self.assertEqual(tts.call_args.kwargs["duration_seconds"], 8)
        self.assertEqual(len(tts.call_args.args[0].splitlines()), 2)
        self.assertEqual(srt.call_args.args[0], "Hook caption\nsecond line\nDetail caption")
        self.assertEqual(srt.call_args.kwargs["shot_durations"], [3, 5])
        self.assertEqual(srt.call_args.kwargs["shot_captions"], ["Hook caption\nsecond line", "Detail caption"])
        self.assertEqual(render.call_args.args[4], "Render plan product")
        self.assertEqual(render.call_args.kwargs["subtitle_text"], srt.call_args.args[0])
        self.assertEqual(render.call_args.kwargs["shot_durations"], [3, 5])
        self.assertEqual(render.call_args.kwargs["shot_captions"], srt.call_args.kwargs["shot_captions"])
        self.assertEqual(
            render.call_args.kwargs["shot_image_paths"],
            [Path("temp/job-render-plan/shot-001.jpg"), Path("temp/job-render-plan/shot-002.jpg")],
        )
        self.assertEqual(thumbnail.call_args.args[0], Path("temp/job-render-plan/shot-001.jpg"))
        self.assertIn("video_url", result)

    def test_render_plan_deduplicates_repeated_image_downloads(self):
        storage = Mock()
        storage.upload.side_effect = lambda bucket, path, key: f"https://storage.example/{key}"
        render_plan = _valid_render_plan()
        render_plan["shots"][1]["image_url"] = render_plan["shots"][0]["image_url"]
        job = {"id": "job-render-plan-dedup", "payload": _valid_payload() | {"render_plan": render_plan}}

        with patch("src.tasks.video_render.require_ffmpeg_for_video_render", return_value="ffmpeg"), \
            patch("src.tasks.video_render.download_image", side_effect=_download_to_target) as download_image, \
            patch("src.tasks.video_render.create_tts_audio", return_value=Path("temp/job-render-plan-dedup/voiceover.wav")), \
            patch("src.tasks.video_render.write_srt", return_value=Path("outputs/job-render-plan-dedup/captions.srt")), \
            patch("src.tasks.video_render.render_vertical_video", return_value=Path("outputs/job-render-plan-dedup/video.mp4")) as render, \
            patch("src.tasks.video_render.create_thumbnail", return_value=Path("outputs/job-render-plan-dedup/thumbnail.jpg")), \
            patch("src.tasks.video_render.clean_dir", side_effect=_clean_dir_for_test):
            run_video_render(job, None, storage, Mock())

        download_image.assert_called_once()
        self.assertEqual(
            render.call_args.kwargs["shot_image_paths"],
            [
                Path("temp/job-render-plan-dedup/shot-001.jpg"),
                Path("temp/job-render-plan-dedup/shot-001.jpg"),
            ],
        )

    def test_repeated_image_render_plan_reports_sequence_metadata(self):
        storage = Mock()
        storage.upload.side_effect = lambda bucket, path, key: f"https://storage.example/{key}"
        render_plan = _valid_render_plan()
        render_plan["shots"][1]["image_url"] = render_plan["shots"][0]["image_url"]
        job = {"id": "job-render-plan-dedup-metadata", "payload": _valid_payload() | {"render_plan": render_plan}}
        package_path = Path("outputs/job-render-plan-dedup-metadata/upload_package.txt")
        package_path.unlink(missing_ok=True)

        with patch("src.tasks.video_render.require_ffmpeg_for_video_render", return_value="ffmpeg"), \
            patch("src.tasks.video_render.download_image", side_effect=_download_to_target), \
            patch("src.tasks.video_render.create_tts_audio", return_value=Path("temp/job-render-plan-dedup-metadata/voiceover.wav")), \
            patch("src.tasks.video_render.write_srt", return_value=Path("outputs/job-render-plan-dedup-metadata/captions.srt")), \
            patch("src.tasks.video_render.render_vertical_video", return_value=Path("outputs/job-render-plan-dedup-metadata/video.mp4")), \
            patch("src.tasks.video_render.create_thumbnail", return_value=Path("outputs/job-render-plan-dedup-metadata/thumbnail.jpg")), \
            patch("src.tasks.video_render.clean_dir", side_effect=_clean_dir_for_test):
            run_video_render(job, None, storage, Mock())

        package_text = package_path.read_text(encoding="utf-8")
        self.assertIn("image_sequence_used: true", package_text)
        self.assertIn("unique_image_count: 1", package_text)
        self.assertIn("shot_count: 2", package_text)
        self.assertIn("visual_binding_verified: true", package_text)
        self.assertIn("pre_render_visual_gate_pass: true", package_text)
        self.assertIn("v143_creative_policy_gate_pass: true", package_text)

    def test_upload_package_includes_visual_quality_metadata(self):
        storage = Mock()
        storage.upload.side_effect = lambda bucket, path, key: f"https://storage.example/{key}"
        payload = _valid_payload() | {"render_plan": _valid_render_plan()}
        job = {"id": "job-render-quality-metadata", "payload": payload}
        package_path = Path("outputs/job-render-quality-metadata/upload_package.txt")
        package_path.unlink(missing_ok=True)

        with patch("src.tasks.video_render.require_ffmpeg_for_video_render", return_value="ffmpeg"), \
            patch("src.tasks.video_render.download_image", side_effect=_download_to_target), \
            patch("src.tasks.video_render.create_tts_audio", return_value=Path("temp/job-render-quality-metadata/voiceover.wav")), \
            patch("src.tasks.video_render.write_srt", return_value=Path("outputs/job-render-quality-metadata/captions.srt")), \
            patch("src.tasks.video_render.render_vertical_video", return_value=Path("outputs/job-render-quality-metadata/video.mp4")), \
            patch("src.tasks.video_render.create_thumbnail", return_value=Path("outputs/job-render-quality-metadata/thumbnail.jpg")), \
            patch("src.tasks.video_render.clean_dir", side_effect=_clean_dir_for_test):
            run_video_render(job, None, storage, Mock())

        package_text = package_path.read_text(encoding="utf-8")
        self.assertIn("render_layout_version: v4-legacy-commerce-typography", package_text)
        self.assertIn("subtitle_style: compact_safe_area", package_text)
        self.assertIn("typography_style: legacy_commerce_hook_box_v1", package_text)
        self.assertIn("hook_box_style: bold_upper_high_contrast", package_text)
        self.assertIn("render_plan_used: true", package_text)
        self.assertIn("image_sequence_used: true", package_text)
        self.assertIn("caption_voice_separated: true", package_text)
        self.assertIn("unique_image_count: 2", package_text)
        self.assertIn("shot_count: 2", package_text)

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

    def test_render_plan_rejects_missing_caption_before_ffmpeg_check(self):
        render_plan = _valid_render_plan()
        render_plan["shots"][0]["caption"] = "  "
        payload = _valid_payload() | {"render_plan": render_plan}
        job = {"id": "job-bad-render-plan-caption", "payload": payload}

        with patch(
            "src.tasks.video_render.require_ffmpeg_for_video_render",
            side_effect=AssertionError("ffmpeg should not be checked before render_plan validation"),
        ) as ffmpeg_check:
            with self.assertRaisesRegex(ValueError, "render_plan.shots.caption is required"):
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

    def test_visual_gate_block_stops_before_tts_render_and_upload(self):
        storage = Mock()
        job = {"id": "job-visual-block", "payload": _valid_payload()}
        with patch("src.tasks.video_render.require_ffmpeg_for_video_render", return_value="ffmpeg"), \
            patch("src.tasks.video_render.download_image", side_effect=_download_to_target), \
            patch(
                "src.tasks.video_render.evaluate_runtime_format_profile",
                return_value={
                    "gate_version": "v140",
                    "gate_pass": False,
                    "format_name": "product_reference_repeat",
                    "blockers": ["SCENE_COUNT_BELOW_MINIMUM"],
                },
            ), \
            patch("src.tasks.video_render.create_tts_audio") as tts, \
            patch("src.tasks.video_render.render_vertical_video") as render, \
            patch("src.tasks.video_render.clean_dir", side_effect=_clean_dir_for_test):
            with self.assertRaisesRegex(ValueError, "pre_render_visual_gate_blocked"):
                run_video_render(job, None, storage, Mock())
        tts.assert_not_called()
        render.assert_not_called()
        storage.upload.assert_not_called()

    def test_v143_gate_block_stops_before_ffmpeg_download_tts_render_and_upload(self):
        storage = Mock()
        job = {"id": "job-v143-block", "payload": _valid_payload()}
        with patch(
            "src.tasks.video_render.evaluate_v143_worker_pre_render_policy",
            return_value={
                "gate_version": "v143",
                "gate_pass": False,
                "blockers": ["V143_REAL_USAGE_SOURCE_REQUIRED"],
                "SAFE_TO_UPLOAD": False,
                "SAFE_TO_PUBLIC_UPLOAD": False,
            },
        ), patch("src.tasks.video_render.require_ffmpeg_for_video_render") as ffmpeg_check, patch(
            "src.tasks.video_render.download_image"
        ) as download, patch("src.tasks.video_render.create_tts_audio") as tts, patch(
            "src.tasks.video_render.render_vertical_video"
        ) as render:
            with self.assertRaisesRegex(ValueError, "v143_creative_policy_blocked"):
                run_video_render(job, None, storage, Mock())

        ffmpeg_check.assert_not_called()
        download.assert_not_called()
        tts.assert_not_called()
        render.assert_not_called()
        storage.upload.assert_not_called()


def _valid_payload() -> dict:
    return {
        "product_name": "테스트 상품",
        "image_url": "https://image.example/product.jpg",
        "script": "영상 대본입니다.",
        "selected_affiliate_url": "https://link.coupang.com/a/test",
        "render_plan": _valid_render_plan(),
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
                "caption": "Hook caption\nsecond line",
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


def _download_to_target(_url: str, target: Path) -> Path:
    return target


if __name__ == "__main__":
    unittest.main()
