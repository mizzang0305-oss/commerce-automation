from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.media.cross_category_visual_validation import (  # noqa: E402
    CategorySceneEvidence,
    CrossCategorySample,
    evaluate_cross_category_samples,
)


class CrossCategoryVisualValidationTest(unittest.TestCase):
    def test_separates_semantic_safety_from_pixel_diversity(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            vehicle = _diverse_sample(root, "vehicle", "block", "laundry")
            cable = _diverse_sample(root, "cable", "block", "laundry")
            food = _repeated_sample(root, "food", "pass", "food")

            report = evaluate_cross_category_samples([vehicle, cable, food])

            self.assertEqual(report["non_baseline_category_count"], 3)
            self.assertEqual(report["owner_labeled_scene_count"], 21)
            self.assertEqual(report["pixel_gate_evaluation"]["accuracy"], 0.0)
            self.assertEqual(report["pixel_gate_evaluation"]["unsafe_false_pass_count"], 2)
            self.assertEqual(report["pixel_gate_evaluation"]["false_block_count"], 1)
            self.assertEqual(report["semantic_gate_evaluation"]["accuracy"], 1.0)
            self.assertEqual(report["semantic_gate_evaluation"]["unsafe_false_pass_count"], 0)
            self.assertFalse(report["pixel_gate_cross_category_ready"])
            self.assertTrue(report["semantic_guard_ready"])
            self.assertFalse(report["category_balance_ready"])
            self.assertFalse(report["raw_paths_in_report"])

    def test_requires_two_non_baseline_categories(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            samples = [
                _diverse_sample(root, "vehicle", "block", "laundry"),
                _repeated_sample(root, "vehicle-pass", "pass", "vehicle", expected_category="vehicle"),
            ]
            with self.assertRaisesRegex(ValueError, "two_non_baseline_categories"):
                evaluate_cross_category_samples(samples)

    def test_rejects_unverified_owner_decision(self):
        with TemporaryDirectory() as temp_dir:
            sample = _diverse_sample(Path(temp_dir), "vehicle", "block", "laundry")
            unverified = CrossCategorySample(
                sample_id=sample.sample_id,
                expected_category=sample.expected_category,
                owner_label=sample.owner_label,
                owner_decision_verified=False,
                scenes=sample.scenes,
            )
            with self.assertRaisesRegex(ValueError, "verified_owner_decisions"):
                evaluate_cross_category_samples([unverified])


def _diverse_sample(root: Path, category: str, label: str, scene_category: str) -> CrossCategorySample:
    scene_dir = root / category
    scene_dir.mkdir()
    scenes = []
    for index in range(8):
        path = scene_dir / f"scene-{index}.png"
        image = Image.new("RGB", (180, 300), (20 + index * 20, 70, 150 - index * 12))
        draw = ImageDraw.Draw(image)
        mode = index % 3
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
        scenes.append(CategorySceneEvidence(f"scene-{index}", path, scene_category))
    return CrossCategorySample(category, category, label, True, tuple(scenes))


def _repeated_sample(
    root: Path,
    sample_id: str,
    label: str,
    scene_category: str,
    expected_category: str | None = None,
) -> CrossCategorySample:
    scene_dir = root / sample_id
    scene_dir.mkdir()
    paths = []
    for source_index in range(2):
        path = scene_dir / f"source-{source_index}.png"
        image = Image.new("RGB", (180, 300), (220, 210 - source_index * 40, 180))
        draw = ImageDraw.Draw(image)
        draw.rectangle((45, 70, 135, 240), outline="black", width=5)
        if source_index:
            draw.ellipse((65, 110, 115, 180), fill="black")
        image.save(path)
        paths.append(path)
    scenes = tuple(
        CategorySceneEvidence(f"scene-{index}", paths[index % 2], scene_category)
        for index in range(5)
    )
    return CrossCategorySample(sample_id, expected_category or sample_id, label, True, scenes)
