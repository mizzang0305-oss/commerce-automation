from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.media.visual_gate_calibration import (  # noqa: E402
    VisualCalibrationSample,
    calibrate_visual_gate,
    prepare_calibration_samples,
)


class VisualGateCalibrationTest(unittest.TestCase):
    def test_leave_one_out_separates_repeated_and_diverse_samples(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            samples = []
            for sample_index in range(3):
                block_dir = root / f"block-{sample_index}"
                block_dir.mkdir()
                block_paths = tuple(
                    _make_repeated_scene(block_dir / f"scene-{scene_index}.png", sample_index, scene_index)
                    for scene_index in range(8)
                )
                samples.append(VisualCalibrationSample(f"block-{sample_index}", "block", block_paths))

                pass_dir = root / f"pass-{sample_index}"
                pass_dir.mkdir()
                pass_paths = tuple(
                    _make_diverse_scene(pass_dir / f"scene-{scene_index}.png", sample_index, scene_index)
                    for scene_index in range(6)
                )
                samples.append(VisualCalibrationSample(f"pass-{sample_index}", "pass", pass_paths))

            report = calibrate_visual_gate(prepare_calibration_samples(samples))

            self.assertTrue(report["stage_1_pixel_gate_ready"])
            self.assertEqual(report["full_corpus_evaluation"]["accuracy"], 1.0)
            self.assertEqual(report["leave_one_out"]["accuracy"], 1.0)
            self.assertEqual(report["selected_config"], {
                "similarity_threshold": 0.88,
                "maximum_largest_cluster_ratio": 0.5,
                "minimum_perceptual_cluster_count": 3,
            })
            self.assertGreaterEqual(report["robustness"]["perfect_config_count"], 1)
            self.assertGreater(report["robustness"]["block_ratio_margin_from_selected_threshold"], 0)
            self.assertGreater(report["robustness"]["pass_ratio_margin_from_selected_threshold"], 0)
            self.assertFalse(report["raw_paths_in_report"])

    def test_rejects_single_label_corpus(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            image_path = _make_diverse_scene(root / "scene.png", 0, 0)
            samples = [VisualCalibrationSample("pass-only", "pass", (image_path,)) for _ in range(4)]
            with self.assertRaisesRegex(ValueError, "pass_and_block"):
                calibrate_visual_gate(prepare_calibration_samples(samples))


def _make_repeated_scene(path: Path, sample_index: int, scene_index: int) -> Path:
    image = Image.new("RGB", (180, 300), ((scene_index * 37) % 255, 40 + sample_index * 20, 80))
    draw = ImageDraw.Draw(image)
    draw.rectangle((52, 70, 128, 235), fill="white", outline="black", width=3)
    for y in (95, 135, 175, 215):
        draw.line((58, y, 122, y), fill="black", width=3)
    draw.rectangle((5, 270, 175, 295), fill=(20, scene_index * 19 % 255, 20))
    image.save(path)
    return path


def _make_diverse_scene(path: Path, sample_index: int, scene_index: int) -> Path:
    image = Image.new("RGB", (180, 300), (20 + scene_index * 20, 70 + sample_index * 25, 150 - scene_index * 12))
    draw = ImageDraw.Draw(image)
    mode = scene_index % 3
    if mode == 0:
        for x in range(8, 175, 18):
            draw.line((x, 15, 175 - x // 2, 285), fill="white", width=4)
    elif mode == 1:
        for y in range(15, 285, 24):
            draw.ellipse((20, y, 160, min(299, y + 18)), outline="white", width=4)
    else:
        for step in range(8):
            draw.rectangle((12 + step * 9, 20 + step * 30, 168 - step * 8, 35 + step * 30), fill="white")
    image.save(path)
    return path
