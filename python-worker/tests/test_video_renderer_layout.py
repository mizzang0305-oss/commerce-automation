from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.media.subtitle_generator import wrap_caption, write_srt
from src.media.thumbnail_generator import create_thumbnail, load_font, wrap_title
from src.media.video_renderer import (
    HOOK_FONT_SIZE,
    TYPOGRAPHY_STYLE,
    VIDEO_HEIGHT,
    VIDEO_WIDTH,
    build_render_quality_metadata,
    build_shot_layout_config,
    build_video_filter,
)


class VideoRendererLayoutTest(unittest.TestCase):
    def test_render_settings_target_vertical_shorts_size(self):
        self.assertEqual(VIDEO_WIDTH, 1080)
        self.assertEqual(VIDEO_HEIGHT, 1920)
        filter_graph = build_video_filter(
            Path("temp/job/captions.srt"),
            subtitle_text="Line one\nLine two",
            shot_durations=[3, 5],
        )
        self.assertIn("scale=936:1100", filter_graph)
        self.assertIn("pad=1080:1920", filter_graph)
        self.assertIn("drawtext=", filter_graph)
        self.assertIn("fontsize=44", filter_graph)
        self.assertIn("y=h-240-text_h", filter_graph)

    def test_first_cue_uses_existing_commerce_bold_hook_box_style(self):
        with patch("src.media.video_renderer.Path.exists", return_value=True):
            filter_graph = build_video_filter(
                Path("temp/job/captions.srt"),
                subtitle_text="차 안 수납, 이거부터 보세요\n컵홀더부터 티슈 수납까지",
                shot_durations=[3, 5],
            )

        self.assertIn("drawbox=x=64:y=118:w=952:h=270:color=black@0.78:t=fill", filter_graph)
        self.assertIn("drawbox=x=64:y=118:w=952:h=10:color=0xfacc15@1:t=fill", filter_graph)
        self.assertIn("drawbox=x=64:y=378:w=952:h=10:color=0xfacc15@1:t=fill", filter_graph)
        self.assertIn("malgunbd.ttf", filter_graph)
        self.assertIn(f"fontsize={HOOK_FONT_SIZE}", filter_graph)
        self.assertIn("y=168", filter_graph)
        self.assertIn("enable='between(t,0.000,3.000)'", filter_graph)
        self.assertIn("fontsize=44", filter_graph)
        self.assertIn("y=h-240-text_h", filter_graph)

    def test_video_filter_reserves_bottom_subtitle_safe_area(self):
        filter_graph = build_video_filter(
            Path("temp/job/captions.srt"),
            subtitle_text="Test subtitle line one\nTest line two",
            shot_durations=[3, 5],
        )

        self.assertIn("scale=936:1100:force_original_aspect_ratio=decrease", filter_graph)
        self.assertIn("pad=1080:1920:(ow-iw)/2:260:color=0x0f172a", filter_graph)
        self.assertIn("fontsize=44", filter_graph)
        self.assertIn("y=h-240-text_h", filter_graph)
        self.assertIn("box=1", filter_graph)
        self.assertIn("boxcolor=black@0.42", filter_graph)
        self.assertIn("enable='between(t,0.000,3.000)'", filter_graph)
        self.assertIn("enable='between(t,3.000,8.000)'", filter_graph)

    def test_drawtext_subtitle_files_wrap_to_compact_lines(self):
        target = Path("temp/test-drawtext-filter/captions.srt")
        subtitle_dir = target.parent / "drawtext"
        if subtitle_dir.exists():
            for child in subtitle_dir.iterdir():
                child.unlink()

        build_video_filter(
            target,
            subtitle_text="ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZ",
            shot_durations=[4],
            subtitle_dir=subtitle_dir,
        )

        line_files = sorted(subtitle_dir.glob("subtitle-cue-001-line-*.txt"))
        self.assertEqual(len(line_files), 2)
        lines = [path.read_text(encoding="utf-8") for path in line_files]
        self.assertLessEqual(len(lines), 2)
        self.assertTrue(all(len(line) <= 24 for line in lines))

    def test_hook_copy_wraps_to_two_short_safe_lines(self):
        target = Path("temp/test-hook-filter/captions.srt")
        subtitle_dir = target.parent / "drawtext"
        if subtitle_dir.exists():
            for child in subtitle_dir.iterdir():
                child.unlink()

        build_video_filter(
            target,
            subtitle_text="차량 뒷좌석 수납을 한 번에 정리하고 싶다면 먼저 확인하세요",
            shot_durations=[4],
            subtitle_dir=subtitle_dir,
        )

        line_files = sorted(subtitle_dir.glob("subtitle-cue-001-line-*.txt"))
        self.assertLessEqual(len(line_files), 2)
        self.assertTrue(all(len(path.read_text(encoding="utf-8")) <= 12 for path in line_files))

    def test_render_metadata_records_typography_only_adoption(self):
        metadata = build_render_quality_metadata(
            render_plan_used=True,
            shot_count=6,
            total_duration_sec=23,
        )

        self.assertEqual(metadata["typography_style"], TYPOGRAPHY_STYLE)
        self.assertEqual(metadata["hook_box_style"], "bold_upper_high_contrast")

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
                self.assertLessEqual(config["caption_box"][3], VIDEO_HEIGHT - 240)
                self.assertLess(config["image_box"][3], config["caption_box"][1])

    def test_caption_wrapping_limits_dense_text(self):
        lines = wrap_caption(
            "구매 전 확인해야 할 포인트가 길어도 화면 하단 안전 영역 안에서 읽히도록 줄바꿈합니다",
            max_chars=16,
            max_lines=2,
        )

        self.assertLessEqual(len(lines), 2)
        self.assertTrue(all(len(line) <= 16 for line in lines))
        self.assertTrue(lines[-1].endswith("..."))

    def test_caption_default_wrapping_stays_compact_for_subtitle_box(self):
        lines = wrap_caption(
            "ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZ",
        )

        self.assertLessEqual(len(lines), 2)
        self.assertTrue(all(len(line) <= 24 for line in lines))
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
