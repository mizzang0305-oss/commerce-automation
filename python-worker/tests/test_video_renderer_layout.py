from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.media.video_renderer import VIDEO_HEIGHT, VIDEO_WIDTH, build_video_filter
from src.media.thumbnail_generator import wrap_title


class VideoRendererLayoutTest(unittest.TestCase):
    def test_render_settings_target_vertical_shorts_size(self):
        self.assertEqual(VIDEO_WIDTH, 1080)
        self.assertEqual(VIDEO_HEIGHT, 1920)
        filter_graph = build_video_filter(Path("temp/job/captions.srt"))
        self.assertIn("scale=1080:1920", filter_graph)
        self.assertIn("pad=1080:1920", filter_graph)
        self.assertIn("subtitles=", filter_graph)

    def test_wrap_title_limits_long_product_names(self):
        lines = wrap_title("아주 긴 쿠팡 상품명을 쇼츠 썸네일 안에서 읽기 좋게 줄바꿈해야 합니다", max_chars=12, max_lines=3)

        self.assertLessEqual(len(lines), 3)
        self.assertTrue(all(len(line) <= 12 for line in lines))
        self.assertTrue(lines[-1].endswith("..."))


if __name__ == "__main__":
    unittest.main()
