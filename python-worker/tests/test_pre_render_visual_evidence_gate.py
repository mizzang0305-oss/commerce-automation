from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.media.pre_render_visual_evidence_gate import (  # noqa: E402
    SceneVisualEvidence,
    evaluate_pre_render_visual_evidence,
)


class PreRenderVisualEvidenceGateTest(unittest.TestCase):
    def test_blocks_repeated_product_photo_despite_border_and_caption_variation(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            scenes = []
            for index in range(8):
                image_path = root / f"repeated-{index}.png"
                _make_repeated_product_card(image_path, index)
                scenes.append(SceneVisualEvidence(
                    scene_id=f"scene-{index + 1:02d}",
                    image_path=image_path,
                    provenance="reviewed_generated_real_usage",
                    usage_label_present=True,
                ))

            report = evaluate_pre_render_visual_evidence(scenes)

            self.assertFalse(report["gate_pass"])
            self.assertIn("REPEATED_VISUAL_CLUSTER", report["blockers"])
            self.assertIn("EXACT_PRODUCT_SCENE_MISSING", report["blockers"])
            self.assertGreater(report["largest_cluster_ratio"], 0.5)

    def test_passes_diverse_usage_context_with_exact_product_identity_scenes(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            scenes = []
            for index in range(6):
                image_path = root / f"diverse-{index}.png"
                if index in {2, 4, 5}:
                    _make_product_identity_scene(image_path, index)
                    provenance = "exact_product_image"
                    usage_label_present = False
                else:
                    _make_usage_scene(image_path, index)
                    provenance = "stock_real_usage"
                    usage_label_present = True
                scenes.append(SceneVisualEvidence(
                    scene_id=f"scene-{index + 1:02d}",
                    image_path=image_path,
                    provenance=provenance,
                    usage_label_present=usage_label_present,
                ))

            report = evaluate_pre_render_visual_evidence(scenes)

            self.assertTrue(report["gate_pass"])
            self.assertEqual(report["blockers"], [])
            self.assertGreaterEqual(report["perceptual_cluster_count"], 3)
            self.assertEqual(report["verified_usage_scene_count"], 3)
            self.assertEqual(report["exact_product_scene_count"], 3)

    def test_blocks_unknown_provenance_even_when_images_are_visually_distinct(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            scenes = []
            for index in range(5):
                image_path = root / f"unknown-{index}.png"
                _make_usage_scene(image_path, index)
                scenes.append(SceneVisualEvidence(
                    scene_id=f"scene-{index + 1:02d}",
                    image_path=image_path,
                    provenance="unknown",
                ))

            report = evaluate_pre_render_visual_evidence(scenes)

            self.assertFalse(report["gate_pass"])
            self.assertIn("UNVERIFIED_SCENE_PROVENANCE", report["blockers"])
            self.assertIn("VERIFIED_USAGE_SCENE_COUNT_BELOW_MINIMUM", report["blockers"])

    def test_blocks_missing_scene_without_fake_success(self):
        missing = Path("missing-v135-scene.png")
        scenes = [
            SceneVisualEvidence(
                scene_id=f"scene-{index + 1:02d}",
                image_path=missing,
                provenance="stock_real_usage",
                usage_label_present=True,
            )
            for index in range(5)
        ]

        report = evaluate_pre_render_visual_evidence(scenes)

        self.assertFalse(report["gate_pass"])
        self.assertIn("SCENE_IMAGE_UNREADABLE", report["blockers"])
        self.assertIn("SCENE_SET_INCOMPLETE", report["blockers"])
        self.assertEqual(report["readable_scene_count"], 0)


def _canvas(color: tuple[int, int, int]) -> Image.Image:
    return Image.new("RGB", (240, 400), color)


def _draw_product(draw: ImageDraw.ImageDraw, offset: int = 0) -> None:
    draw.rectangle((72 + offset, 105, 168 + offset, 295), fill="white", outline="black", width=4)
    for y in (135, 185, 235, 280):
        draw.line((78 + offset, y, 162 + offset, y), fill="black", width=4)
    draw.ellipse((65 + offset, 290, 85 + offset, 310), fill="black")
    draw.ellipse((155 + offset, 290, 175 + offset, 310), fill="black")


def _make_repeated_product_card(path: Path, index: int) -> None:
    image = _canvas(((index * 29) % 255, (index * 47) % 255, (index * 71) % 255))
    draw = ImageDraw.Draw(image)
    _draw_product(draw)
    draw.rectangle((15, 340, 225, 385), fill=(index * 17 % 255, 20, 20))
    image.save(path)


def _make_product_identity_scene(path: Path, index: int) -> None:
    image = _canvas((235, 228 - index * 8, 210 + index * 5))
    draw = ImageDraw.Draw(image)
    _draw_product(draw, offset=(index - 4) * 5)
    draw.line((0, 80 + index * 8, 240, 25 + index * 6), fill="gray", width=6)
    image.save(path)


def _make_usage_scene(path: Path, index: int) -> None:
    image = _canvas((30 + index * 25, 80 + index * 15, 145 - index * 10))
    draw = ImageDraw.Draw(image)
    if index % 3 == 0:
        for x in range(10, 230, 24):
            draw.line((x, 30, 230 - x // 2, 360), fill="white", width=5)
    elif index % 3 == 1:
        for y in range(20, 380, 32):
            draw.ellipse((30, y, 210, min(399, y + 26)), outline="white", width=5)
    else:
        for step in range(8):
            draw.rectangle((20 + step * 12, 35 + step * 35, 220 - step * 10, 55 + step * 35), fill="white")
    image.save(path)
