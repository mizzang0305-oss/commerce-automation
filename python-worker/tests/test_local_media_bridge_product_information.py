"""Fail-closed product-information visual mode; no platform calls."""
from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest

from PIL import Image

BRIDGE_PATH = Path(__file__).resolve().parents[2] / "tools" / "video-automation" / "local_media_bridge.py"
SPEC = importlib.util.spec_from_file_location("local_media_bridge_product_information_test", BRIDGE_PATH)
assert SPEC and SPEC.loader
bridge = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bridge)

PRODUCT_ID = "coupang:product:100:item:200:vendor:300"


class ProductInformationBridgeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="product-information-")
        self.addCleanup(self.temp.cleanup)
        self.image = Path(self.temp.name) / "exact-product.jpg"
        Image.new("RGB", (640, 640), "white").save(self.image)

    def test_gate_proves_only_structural_image_binding(self) -> None:
        result = bridge.visual_gate_product_information({
            "product_id": PRODUCT_ID,
            "source_product_id": PRODUCT_ID,
            "image_paths": [str(self.image)],
            "allowed_root": self.temp.name,
        })
        self.assertTrue(result["gate_pass"])
        self.assertFalse(result["semantic_product_match_verified"])
        self.assertFalse(result["rights_verified"])
        self.assertFalse(result["publication_ready"])
        self.assertEqual(result["source_sha256"], [hashlib.sha256(self.image.read_bytes()).hexdigest()])

    def test_truthful_product_information_label_fits_actual_render_badge(self) -> None:
        result = bridge.layout_plan({"hook": "빨래, 왜 3가지를 확인할까요?", "usage_label": "상품 이미지 · 실사용 아님"})
        self.assertTrue(result["passed"], result["blockers"])
        self.assertEqual(result["usage_badge_box"]["width"], 560)

    def test_relabeling_other_product_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "PRODUCT_SOURCE_IDENTITY_MISMATCH"):
            bridge.visual_gate_product_information({
                "product_id": PRODUCT_ID,
                "source_product_id": "coupang:product:101:item:200:vendor:300",
                "image_paths": [str(self.image)],
                "allowed_root": self.temp.name,
            })

    def test_generic_body_cannot_enter_product_information_render(self) -> None:
        with self.assertRaisesRegex(ValueError, "PRODUCT_INFORMATION_EXACT_SCENES_REQUIRED"):
            bridge.render_v2({
                "visual_mode": "product_information",
                "output": str(Path(self.temp.name) / "output.mp4"),
                "image_paths": [str(self.image)],
                "allowed_root": self.temp.name,
                "scene_roles": ["generic_usage_example"],
            })

    def test_source_hash_mismatch_is_rejected_before_render(self) -> None:
        with self.assertRaisesRegex(ValueError, "PRODUCT_INFORMATION_SOURCE_HASH_MISMATCH"):
            bridge.render_v2({
                "visual_mode": "product_information",
                "output": str(Path(self.temp.name) / "output.mp4"),
                "image_paths": [str(self.image)],
                "allowed_root": self.temp.name,
                "scene_roles": ["product_reference"],
                "source_sha256": ["0" * 64],
            })


if __name__ == "__main__":
    unittest.main()
