from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.media.subtitle_generator import wrap_caption, write_srt
from src.media.thumbnail_generator import create_thumbnail, load_font, wrap_title
from src.media.video_renderer import (
    VIDEO_HEIGHT,
    VIDEO_WIDTH,
    build_shot_layout_config,
    build_video_filter,
)


class VideoRendererLayoutTest(unittest.TestCase):
    def test_render_settings_target_vertical_shorts_size(self):
        self.assertEqual(VIDEO_WIDTH, 1080)
        self.assertEqual(VIDEO_HEIGHT, 1920)
        filter_graph = build_video_filter(Path("temp/job/captions.srt"))
        self.assertIn("scale=1080:1920", filter_graph)
        self.assertIn("pad=1080:1920", filter_graph)
        self.assertIn("subtitles=", filter_graph)
        self.assertIn("FontSize=12", filter_graph)
        self.assertIn("MarginV=180", filter_graph)

    def test_wrap_title_limits_long_product_names(self):
        lines = wrap_title(
            "Very long Coupang product name that needs safe thumbnail wrapping for short-form video",
            max_chars=12,
            max_lines=3,
        )

        self.assertLessEqual(len(lines), 3)
        self.assertTrue(all(len(line) <= 12 for line in lines))
        self.assertTrue(lines[-1].endswith("..."))

    def test_layout_presets_stay_inside_vertical_safe_area(self):
        for layout in ["hook", "product_focus", "benefit", "caution", "manual_cta", "unknown_layout"]:
            with self.subTest(layout=layout):
                config = build_shot_layout_config(layout)

                self.assertIn(config["layout"], {"hook", "product_focus", "benefit", "caution", "manual_cta"})
                for box_name in ["image_box", "caption_box"]:
                    x1, y1, x2, y2 = config[box_name]
                    self.assertGreaterEqual(x1, 0)
                    self.assertGreaterEqual(y1, 0)
                    self.assertLessEqual(x2, VIDEO_WIDTH)
                    self.assertLessEqual(y2, VIDEO_HEIGHT)
                    self.assertGreater(x2, x1)
                    self.assertGreater(y2, y1)

    def test_caption_wrapping_limits_dense_text(self):
        lines = wrap_caption(
            "구매 전 확인해야 할 포인트가 길어도 화면 하단 안전 영역 안에서 읽히도록 줄바꿈합니다",
            max_chars=16,
            max_lines=2,
        )

        self.assertLessEqual(len(lines), 2)
        self.assertTrue(all(len(line) <= 16 for line in lines))
        self.assertTrue(lines[-1].endswith("..."))

    def test_srt_timing_can_follow_render_plan_shot_durations(self):
        target = Path("temp/test-shot-duration/captions.srt")
        target.unlink(missing_ok=True)

        write_srt("첫 장면 훅\n두 번째 장면 설명\n마지막 확인", target, shot_durations=[2.5, 4, 3.5])
        text = target.read_text(encoding="utf-8")

        self.assertIn("00:00:00,000 --> 00:00:02,500", text)
        self.assertIn("00:00:02,500 --> 00:00:06,500", text)
        self.assertIn("00:00:06,500 --> 00:00:10,000", text)

    def test_thumbnail_creation_uses_font_fallback_and_writes_output(self):
        source = Path("temp/test-thumbnail/source.jpg")
        target = Path("temp/test-thumbnail/thumbnail.jpg")
        source.parent.mkdir(parents=True, exist_ok=True)
        target.unlink(missing_ok=True)

        from PIL import Image

        Image.new("RGB", (500, 700), (80, 120, 160)).save(source)
        font = load_font(48, font_path="C:/missing/font/file.ttf")
        output = create_thumbnail(
            source,
            target,
            "긴 상품명도 썸네일 카드 안에서 안전하게 줄바꿈되어야 합니다",
            font_path="C:/missing/font/file.ttf",
        )

        self.assertIsNotNone(font)
        self.assertEqual(output, target)
        self.assertTrue(target.exists())
        self.assertGreater(target.stat().st_size, 0)


if __name__ == "__main__":
    unittest.main()
