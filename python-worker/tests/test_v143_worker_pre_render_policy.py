from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.media.v143_worker_pre_render_policy import (
    evaluate_v143_creative_policy,
    evaluate_v143_worker_pre_render_policy,
)


class V143CreativePolicyTest(unittest.TestCase):
    def test_cross_runtime_pass_vector_keeps_upload_disabled(self):
        result = evaluate_v143_creative_policy(_valid_evidence())

        self.assertTrue(result["passed"])
        self.assertEqual(result["blockers"], [])
        self.assertFalse(result["SAFE_TO_UPLOAD"])
        self.assertFalse(result["SAFE_TO_PUBLIC_UPLOAD"])

    def test_product_reference_still_cannot_pass_as_real_usage(self):
        result = evaluate_v143_creative_policy(
            {**_valid_evidence(), "usage_source_role": "product_reference_still"}
        )

        self.assertFalse(result["passed"])
        self.assertIn("V143_REAL_USAGE_SOURCE_REQUIRED", result["blockers"])

    def test_worker_gate_uses_signed_plan_and_actual_renderer_tts_contract(self):
        render_plan = _render_plan(
            {
                "real_usage_scene_present": True,
                "usage_source_role": "generic_usage_example",
                "usage_label_present": True,
                "exact_product_identity_claim": False,
                "exact_product_identity_verified": False,
                "actor_nationality_claim": None,
                "actor_nationality_verified": False,
            }
        )
        config = SimpleNamespace(
            korean_voice_provider="local_command",
            korean_voice_provider_approved=True,
            korean_voice_language="ko-KR",
            korean_voice_speed=1.25,
            korean_voice_delivery_style="brisk_confident_sales",
        )

        result = evaluate_v143_worker_pre_render_policy(
            render_plan,
            {"binding_verified": True, "format_name": "real_usage_storyboard"},
            config,
        )

        self.assertTrue(result["gate_pass"])
        self.assertTrue(result["binding_verified"])
        self.assertFalse(result["raw_evidence_in_report"])
        self.assertFalse(result["external_api_called"])
        self.assertFalse(result["upload_attempted"])

    def test_signed_usage_label_flag_without_renderable_label_is_blocked(self):
        render_plan = _render_plan(
            {
                "real_usage_scene_present": True,
                "usage_source_role": "generic_usage_example",
                "usage_label_present": True,
                "exact_product_identity_claim": False,
                "exact_product_identity_verified": False,
                "actor_nationality_claim": None,
                "actor_nationality_verified": False,
            }
        )
        render_plan["shots"][0].pop("usage_label")

        with patch("src.media.v143_worker_pre_render_policy.HOOK_FONT_SIZE", 110):
            result = evaluate_v143_worker_pre_render_policy(
                render_plan,
                {"binding_verified": True, "format_name": "real_usage_storyboard"},
                _valid_config(),
            )

        self.assertFalse(result["gate_pass"])
        self.assertEqual(result["blockers"], ["V143_USAGE_LABEL_REQUIRED"])

    def test_long_usage_label_does_not_consume_the_hook_caption(self):
        render_plan = _render_plan(
            {
                "real_usage_scene_present": True,
                "usage_source_role": "generic_usage_example",
                "usage_label_present": True,
                "exact_product_identity_claim": False,
                "exact_product_identity_verified": False,
                "actor_nationality_claim": None,
                "actor_nationality_verified": False,
            }
        )
        render_plan["shots"][0]["usage_label"] = (
            "Extended generic usage example label"
        )

        result = evaluate_v143_worker_pre_render_policy(
            render_plan,
            {"binding_verified": True, "format_name": "real_usage_storyboard"},
            _valid_config(),
        )

        self.assertTrue(result["gate_pass"])
        self.assertEqual(result["blockers"], [])

    def test_usage_label_that_exceeds_its_separate_badge_is_blocked(self):
        render_plan = _render_plan(
            {
                "real_usage_scene_present": True,
                "usage_source_role": "generic_usage_example",
                "usage_label_present": True,
                "exact_product_identity_claim": False,
                "exact_product_identity_verified": False,
                "actor_nationality_claim": None,
                "actor_nationality_verified": False,
            }
        )
        render_plan["shots"][0]["usage_label"] = (
            "This usage disclosure is deliberately too long to survive the separate "
            "two line usage badge in full"
        )

        result = evaluate_v143_worker_pre_render_policy(
            render_plan,
            {"binding_verified": True, "format_name": "real_usage_storyboard"},
            _valid_config(),
        )

        self.assertFalse(result["gate_pass"])
        self.assertEqual(result["blockers"], ["V143_USAGE_LABEL_REQUIRED"])

    def test_usage_label_without_renderable_hook_caption_is_blocked(self):
        render_plan = _render_plan(
            {
                "real_usage_scene_present": True,
                "usage_source_role": "generic_usage_example",
                "usage_label_present": True,
                "exact_product_identity_claim": False,
                "exact_product_identity_verified": False,
                "actor_nationality_claim": None,
                "actor_nationality_verified": False,
            }
        )
        render_plan["shots"][0]["caption"] = ""

        result = evaluate_v143_worker_pre_render_policy(
            render_plan,
            {"binding_verified": True, "format_name": "real_usage_storyboard"},
            _valid_config(),
        )

        self.assertFalse(result["gate_pass"])
        self.assertIn("V143_HOOK_READABILITY_REQUIRED", result["blockers"])

    def test_partially_rendered_or_ellipsized_hook_caption_is_blocked(self):
        for caption in (
            "This hook caption is far too long to survive in the two line hook area",
            "Readable hook text followed by content that forces an ellipsis",
        ):
            with self.subTest(caption=caption):
                render_plan = _render_plan(
                    {
                        "real_usage_scene_present": True,
                        "usage_source_role": "generic_usage_example",
                        "usage_label_present": True,
                        "exact_product_identity_claim": False,
                        "exact_product_identity_verified": False,
                        "actor_nationality_claim": None,
                        "actor_nationality_verified": False,
                    }
                )
                render_plan["shots"][0]["caption"] = caption

                result = evaluate_v143_worker_pre_render_policy(
                    render_plan,
                    {"binding_verified": True, "format_name": "real_usage_storyboard"},
                    _valid_config(),
                )

                self.assertFalse(result["gate_pass"])
                self.assertIn("V143_HOOK_READABILITY_REQUIRED", result["blockers"])

    def test_first_rendered_shot_is_hook_regardless_of_shot_id(self):
        for shot_id in ("intro", "scene-1"):
            with self.subTest(shot_id=shot_id):
                render_plan = _render_plan(
                    {
                        "real_usage_scene_present": True,
                        "usage_source_role": "generic_usage_example",
                        "usage_label_present": True,
                        "exact_product_identity_claim": False,
                        "exact_product_identity_verified": False,
                        "actor_nationality_claim": None,
                        "actor_nationality_verified": False,
                    }
                )
                render_plan["shots"][0]["shot_id"] = shot_id

                result = evaluate_v143_worker_pre_render_policy(
                    render_plan,
                    {"binding_verified": True, "format_name": "real_usage_storyboard"},
                    _valid_config(),
                )

                self.assertTrue(result["gate_pass"])

    def test_placeholder_provider_cannot_pass_merchant_tts_gate(self):
        config = SimpleNamespace(
            korean_voice_provider="placeholder",
            korean_voice_provider_approved=True,
            korean_voice_language="ko-KR",
            korean_voice_speed=1.25,
            korean_voice_delivery_style="brisk_confident_sales",
        )

        with patch("src.media.v143_worker_pre_render_policy.HOOK_FONT_SIZE", 110):
            result = evaluate_v143_worker_pre_render_policy(
                _render_plan(
                    {
                        "real_usage_scene_present": True,
                        "usage_source_role": "generic_usage_example",
                        "usage_label_present": True,
                        "exact_product_identity_claim": False,
                        "exact_product_identity_verified": False,
                        "actor_nationality_claim": None,
                        "actor_nationality_verified": False,
                    }
                ),
                {"binding_verified": True, "format_name": "real_usage_storyboard"},
                config,
            )

        self.assertFalse(result["gate_pass"])
        self.assertEqual(
            result["blockers"],
            ["V143_APPROVED_KOREAN_MERCHANT_TTS_REQUIRED"],
        )

    def test_current_product_still_contract_fails_closed(self):
        config = SimpleNamespace(
            korean_voice_provider_approved=False,
            korean_voice_language="ko",
            korean_voice_speed=1.14,
            korean_voice_delivery_style="",
        )
        result = evaluate_v143_worker_pre_render_policy(
            _render_plan(
                {
                    "real_usage_scene_present": False,
                    "usage_source_role": "product_reference_still",
                    "usage_label_present": False,
                    "exact_product_identity_claim": False,
                    "exact_product_identity_verified": False,
                    "actor_nationality_claim": None,
                    "actor_nationality_verified": False,
                }
            ),
            {"binding_verified": True, "format_name": "product_reference_repeat"},
            config,
        )

        self.assertFalse(result["gate_pass"])
        self.assertIn("V143_REAL_USAGE_SCENE_REQUIRED", result["blockers"])
        self.assertIn("V143_REAL_USAGE_SOURCE_REQUIRED", result["blockers"])
        self.assertIn("V143_APPROVED_KOREAN_MERCHANT_TTS_REQUIRED", result["blockers"])
        self.assertIn("V143_MERCHANT_TTS_SPEED_OUT_OF_RANGE", result["blockers"])

    def test_missing_signed_creative_evidence_is_blocked(self):
        result = evaluate_v143_worker_pre_render_policy(
            _render_plan(None),
            {"binding_verified": True, "format_name": "real_usage_storyboard"},
            SimpleNamespace(),
        )

        self.assertFalse(result["gate_pass"])
        self.assertEqual(result["blockers"], ["V143_WORKER_EVIDENCE_REQUIRED"])
        self.assertTrue(result["binding_verified"])

    def test_unknown_verified_format_is_blocked(self):
        result = evaluate_v143_worker_pre_render_policy(
            _render_plan(
                {
                    "real_usage_scene_present": True,
                    "usage_source_role": "generic_usage_example",
                    "usage_label_present": True,
                    "exact_product_identity_claim": False,
                    "exact_product_identity_verified": False,
                    "actor_nationality_claim": None,
                    "actor_nationality_verified": False,
                }
            ),
            {"binding_verified": True, "format_name": "unknown"},
            SimpleNamespace(),
        )

        self.assertFalse(result["gate_pass"])
        self.assertEqual(result["blockers"], ["V143_WORKER_EVIDENCE_FORMAT_MISMATCH"])
        self.assertTrue(result["binding_verified"])


def _valid_evidence() -> dict:
    return {
        "hook_font_px": 110,
        "hook_max_lines": 2,
        "hook_visible_within_seconds": 0.0,
        "hook_high_contrast": True,
        "real_usage_scene_present": True,
        "usage_source_role": "generic_usage_example",
        "usage_label_present": True,
        "exact_product_identity_claim": False,
        "exact_product_identity_verified": False,
        "actor_nationality_claim": None,
        "actor_nationality_verified": False,
        "product_identity_binding_verified": True,
        "tts_provider": "local_command",
        "tts_provider_approved": True,
        "tts_language": "ko-KR",
        "tts_speed_multiplier": 1.25,
        "tts_delivery_style": "brisk_confident_sales",
        "safe_to_upload": False,
        "safe_to_public_upload": False,
    }


def _valid_config() -> SimpleNamespace:
    return SimpleNamespace(
        korean_voice_provider="local_command",
        korean_voice_provider_approved=True,
        korean_voice_language="ko-KR",
        korean_voice_speed=1.25,
        korean_voice_delivery_style="brisk_confident_sales",
    )


def _render_plan(creative_policy: dict | None) -> dict:
    plan = {
        "shots": [
            {
                "shot_id": "hook",
                "usage_label": "Usage example",
                "caption": "Readable hook",
                "duration_sec": 3,
            }
        ]
    }
    if creative_policy is not None:
        plan["creative_policy"] = creative_policy
    return plan


if __name__ == "__main__":
    unittest.main()
