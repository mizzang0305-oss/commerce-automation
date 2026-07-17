from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.media.format_aware_visual_calibration import (  # noqa: E402
    FormatAwareSample,
    FormatAwareScene,
    evaluate_format_aware_calibration,
)


class FormatAwareVisualCalibrationTest(unittest.TestCase):
    def test_binding_and_format_profiles_are_independent(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            vehicle_story = _diverse_scenes(root / "vehicle", "vehicle")
            cable_story = _diverse_scenes(root / "cable", "cable")
            food_repeat = _repeat_scenes(root / "food", "food", 2)
            samples = [
                _sample("vehicle-pass", "vehicle", "real_usage_storyboard", "pass", True, True, True, vehicle_story),
                _sample("vehicle-binding-block", "vehicle", "real_usage_storyboard", "block", True, False, True, vehicle_story),
                _sample("vehicle-format-block", "vehicle", "real_usage_storyboard", "block", True, True, False, _repeat_scenes(root / "vehicle-repeat", "vehicle", 1)),
                _sample("cable-pass", "cable", "real_usage_storyboard", "pass", True, True, True, cable_story),
                _sample("cable-binding-block", "cable", "real_usage_storyboard", "block", True, False, True, cable_story),
                _sample("food-story-block", "food", "real_usage_storyboard", "block", True, True, False, food_repeat),
                _sample("food-repeat-pass", "food", "product_reference_repeat", "pass", True, True, True, food_repeat),
                _sample("food-repeat-category-block", "food", "product_reference_repeat", "block", False, False, True, _repeat_scenes(root / "wrong", "vehicle", 2)),
                _sample("cable-repeat-format-block", "cable", "product_reference_repeat", "block", True, False, False, cable_story),
            ]

            report = evaluate_format_aware_calibration(samples)

            self.assertTrue(report["category_balance_ready"])
            self.assertEqual(report["overall_owner_decision_metrics"]["accuracy"], 1.0)
            self.assertTrue(report["formats"]["real_usage_storyboard"]["promotion_ready"])
            self.assertTrue(report["formats"]["real_usage_storyboard"]["profile_rule_calibrated"])
            self.assertFalse(report["formats"]["product_reference_repeat"]["promotion_ready"])
            self.assertTrue(report["formats"]["product_reference_repeat"]["profile_rule_calibrated"])
            self.assertFalse(report["all_format_profiles_promotion_ready"])
            self.assertFalse(report["integration_review_ready"])
            self.assertFalse(report["safe_to_integrate"])
            self.assertFalse(report["raw_paths_in_report"])

    def test_requires_pass_and_block_for_every_category(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            scenes = _diverse_scenes(root / "vehicle", "vehicle")
            samples = [
                _sample("vehicle-pass", "vehicle", "real_usage_storyboard", "pass", True, True, True, scenes),
                _sample("food-block", "food", "product_reference_repeat", "block", False, False, True, _repeat_scenes(root / "food", "vehicle", 2)),
            ]
            with self.assertRaisesRegex(ValueError, "pass_and_block_per_category"):
                evaluate_format_aware_calibration(samples)


def _sample(
    sample_id: str,
    category: str,
    format_name: str,
    label: str,
    scene_pass: bool,
    binding_pass: bool,
    format_pass: bool,
    scenes: tuple[FormatAwareScene, ...],
) -> FormatAwareSample:
    binding = {
        "selected_product_matches_target": binding_pass,
        "script_matches_product": binding_pass,
        "manifest_purpose_matches_product": binding_pass,
        "scene_source_authorized": binding_pass,
        "exact_product_identity_verified": binding_pass,
    }
    return FormatAwareSample(
        sample_id,
        category,
        format_name,
        label,
        True,
        scene_pass,
        binding_pass,
        format_pass,
        tuple(binding.items()),
        scenes,
    )


def _diverse_scenes(root: Path, category: str) -> tuple[FormatAwareScene, ...]:
    root.mkdir()
    scenes = []
    for index in range(6):
        path = root / f"scene-{index}.png"
        image = Image.new("RGB", (180, 300), (30 + index * 25, 60, 170 - index * 18))
        draw = ImageDraw.Draw(image)
        if index % 3 == 0:
            for x in range(10, 170, 18):
                draw.line((x, 15, 175 - x // 2, 285), fill="white", width=4)
        elif index % 3 == 1:
            for y in range(15, 285, 24):
                draw.ellipse((20, y, 160, min(299, y + 18)), outline="white", width=4)
        else:
            for step in range(8):
                draw.rectangle((12 + step * 9, 20 + step * 30, 168 - step * 8, 35 + step * 30), fill="white")
        image.save(path)
        scenes.append(FormatAwareScene(f"scene-{index}", path, category))
    return tuple(scenes)


def _repeat_scenes(root: Path, category: str, source_count: int) -> tuple[FormatAwareScene, ...]:
    root.mkdir()
    paths = []
    for index in range(source_count):
        path = root / f"source-{index}.png"
        image = Image.new("RGB", (180, 300), (210, 180 - index * 35, 140))
        draw = ImageDraw.Draw(image)
        draw.rectangle((45, 70, 135, 240), outline="black", width=5)
        if index:
            draw.ellipse((65, 110, 115, 180), fill="black")
        image.save(path)
        paths.append(path)
    return tuple(
        FormatAwareScene(f"scene-{index}", paths[index % source_count], category)
        for index in range(6)
    )
