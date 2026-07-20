from pathlib import Path
import hashlib
import hmac
import json
import sys
from tempfile import TemporaryDirectory
import unittest

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.media.format_aware_visual_calibration import evaluate_runtime_format_profile
from src.media.worker_visual_binding import verify_server_visual_binding


SECRET = "v140-test-secret-0123456789abcdef"
EXPECTED_SIGNATURE = "74ca7a4c1c3db3b2ffddd3659fd15366f1b020c3a7abc287fe325d3223c540cf"


class WorkerVisualBindingTest(unittest.TestCase):
    def test_cross_runtime_signature_vector_and_verified_binding(self):
        job, payload, render_plan = _signed_fixture()
        self.assertEqual(payload["server_visual_binding"]["signature"], EXPECTED_SIGNATURE)

        verified = verify_server_visual_binding(job, payload, render_plan, SECRET)

        self.assertTrue(verified["binding_verified"])
        self.assertEqual(verified["format_name"], "product_reference_repeat")
        self.assertEqual(verified["scene_count"], 5)
        self.assertFalse(verified["raw_urls_in_report"])
        self.assertFalse(verified["secret_exposed"])

    def test_rejects_product_script_image_category_and_queue_spoofing(self):
        mutations = {
            "product": lambda job, payload, plan: plan.update(product_name="Spoofed product"),
            "script": lambda job, payload, plan: plan["shots"][0].update(voice_text="Spoofed script"),
            "caption": lambda job, payload, plan: plan["shots"][0].update(caption="Spoofed caption"),
            "duration": lambda job, payload, plan: plan["shots"][0].update(duration_sec=8),
            "image": lambda job, payload, plan: plan["shots"][0].update(image_url="https://evil.invalid/image.jpg"),
            "disclosure": lambda job, payload, plan: plan.update(disclosure_text="Spoofed disclosure"),
            "creative_policy": lambda job, payload, plan: plan["creative_policy"].update(
                real_usage_scene_present=True,
                usage_source_role="generic_usage_example",
            ),
            "category": lambda job, payload, plan: payload.update(server_product_category="food"),
            "queue": lambda job, payload, plan: job.update(product_queue_id="queue-spoofed"),
        }
        for name, mutate in mutations.items():
            with self.subTest(name=name):
                job, payload, render_plan = _signed_fixture()
                mutate(job, payload, render_plan)
                with self.assertRaisesRegex(ValueError, "server_visual_binding"):
                    verify_server_visual_binding(job, payload, render_plan, SECRET)

    def test_rejects_missing_or_short_secret_and_unsigned_payload(self):
        job, payload, render_plan = _signed_fixture()
        with self.assertRaisesRegex(ValueError, "secret_missing_or_too_short"):
            verify_server_visual_binding(job, payload, render_plan, "short")
        payload.pop("server_visual_binding")
        with self.assertRaisesRegex(ValueError, "schema_invalid"):
            verify_server_visual_binding(job, payload, render_plan, SECRET)

    def test_runtime_repeat_profile_passes_one_source_and_blocks_four_sources(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            paths = []
            for index, color in enumerate(("red", "green", "blue", "yellow"), start=1):
                path = root / f"scene-{index}.png"
                Image.new("RGB", (108, 192), color).save(path)
                paths.append(path)

            identity_locked = evaluate_runtime_format_profile(
                "product_reference_repeat",
                [paths[0]] * 5,
            )
            identity_drift = evaluate_runtime_format_profile(
                "product_reference_repeat",
                [paths[0], paths[1], paths[2], paths[3], paths[0]],
            )

        self.assertTrue(identity_locked["gate_pass"])
        self.assertEqual(identity_locked["exact_file_hash_count"], 1)
        self.assertFalse(identity_drift["gate_pass"])
        self.assertIn("EXACT_SOURCE_COUNT_OUTSIDE_PROFILE", identity_drift["blockers"])


def _signed_fixture():
    image_url = "https://image.example/product.jpg"
    voice_lines = ["Line one", "Line two", "Line three", "Line four", "Line five"]
    render_plan = {
        "version": "1",
        "queue_id": "queue-visual-001",
        "product_name": "Rear seat organizer",
        "source": "storyboard_template",
        "disclosure_text": "Affiliate disclosure",
        "creative_policy": {
            "real_usage_scene_present": False,
            "usage_source_role": "product_reference_still",
            "usage_label_present": False,
            "exact_product_identity_claim": False,
            "exact_product_identity_verified": False,
            "actor_nationality_claim": None,
            "actor_nationality_verified": False,
        },
        "shots": [
            {
                "shot_id": f"shot-{index}",
                "duration_sec": 4,
                "layout": "detail_check",
                "image_role": "product",
                "image_url": image_url,
                "caption": f"Caption {index}",
                "voice_text": voice,
                "safe_area": "center_focus",
                "metadata": {"source": "template", "sequence": index},
            }
            for index, voice in enumerate(voice_lines, start=1)
        ],
        "render_target": {"width": 1080, "height": 1920, "fps": 30, "aspect_ratio": "9:16"},
        "safety": {
            "external_api_call": False,
            "platform_upload": False,
            "vimax_dependency": False,
            "worker_jobs_created": False,
        },
    }
    unsigned = {
        "version": "1",
        "issuer": "commerce-web-next-batch",
        "queue_id": "queue-visual-001",
        "product_name_sha256": _sha256("Rear seat organizer"),
        "affiliate_url_sha256": _sha256("https://link.coupang.com/a/visual"),
        "script_sha256": _sha256("\n".join(voice_lines)),
        "render_plan_sha256": _sha256(
            json.dumps(render_plan, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        ),
        "format_name": "product_reference_repeat",
        "target_category": "vehicle",
        "manifest_purpose": "worker_video_render",
        "scene_image_url_sha256": [_sha256(image_url)] * 5,
        "scene_category_labels": ["vehicle"] * 5,
    }
    canonical = json.dumps(unsigned, ensure_ascii=False, separators=(",", ":"))
    binding = {
        **unsigned,
        "signature": hmac.new(SECRET.encode(), canonical.encode(), hashlib.sha256).hexdigest(),
    }
    payload = {
        "product_queue_id": "queue-visual-001",
        "product_name": "Rear seat organizer",
        "selected_affiliate_url": "https://link.coupang.com/a/visual",
        "server_product_category": "vehicle",
        "server_visual_binding": binding,
        "render_plan": render_plan,
    }
    job = {"id": "job-visual-001", "product_queue_id": "queue-visual-001", "payload": payload}
    return job, payload, render_plan


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


if __name__ == "__main__":
    unittest.main()
