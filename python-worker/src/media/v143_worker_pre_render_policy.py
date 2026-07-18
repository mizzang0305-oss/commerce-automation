from __future__ import annotations

import math
from typing import Literal

from .subtitle_generator import wrap_caption
from .video_renderer import (
    HOOK_ACCENT_COLOR,
    HOOK_BOX_COLOR,
    HOOK_FONT_SIZE,
    HOOK_MAX_CHARS,
)


V143UsageSourceRole = Literal[
    "exact_product_use",
    "generic_usage_example",
    "product_reference_still",
]

MIN_HOOK_FONT_PX = 100
MAX_HOOK_LINES = 2
MAX_HOOK_VISIBLE_SECONDS = 1
MIN_MERCHANT_TTS_SPEED = 1.2
MAX_MERCHANT_TTS_SPEED = 1.3
REQUIRED_TTS_DELIVERY = "brisk_confident_sales"
ALLOWED_USAGE_SOURCE_ROLES = {
    "exact_product_use",
    "generic_usage_example",
    "product_reference_still",
}
EXPECTED_PLAN_EVIDENCE_KEYS = {
    "real_usage_scene_present",
    "usage_source_role",
    "usage_label_present",
    "exact_product_identity_claim",
    "exact_product_identity_verified",
    "actor_nationality_claim",
    "actor_nationality_verified",
}


def evaluate_v143_creative_policy(evidence: dict[str, object]) -> dict[str, object]:
    blockers: list[str] = []
    raw_usage_source_role = evidence.get("usage_source_role")
    usage_source_role = (
        raw_usage_source_role if raw_usage_source_role in ALLOWED_USAGE_SOURCE_ROLES else None
    )
    nationality_claim = str(evidence.get("actor_nationality_claim") or "").strip()
    hook_readable = (
        _finite_at_least(evidence.get("hook_font_px"), MIN_HOOK_FONT_PX)
        and _finite_between(evidence.get("hook_max_lines"), 1, MAX_HOOK_LINES)
        and _finite_between(
            evidence.get("hook_visible_within_seconds"),
            0,
            MAX_HOOK_VISIBLE_SECONDS,
        )
        and evidence.get("hook_high_contrast") is True
    )

    if not hook_readable:
        blockers.append("V143_HOOK_READABILITY_REQUIRED")
    if evidence.get("real_usage_scene_present") is not True:
        blockers.append("V143_REAL_USAGE_SCENE_REQUIRED")
    if usage_source_role is None:
        blockers.append("V143_USAGE_SOURCE_ROLE_REQUIRED")
    if usage_source_role == "product_reference_still":
        blockers.append("V143_REAL_USAGE_SOURCE_REQUIRED")
    if (
        evidence.get("real_usage_scene_present") is True
        and evidence.get("usage_label_present") is not True
    ):
        blockers.append("V143_USAGE_LABEL_REQUIRED")

    exact_product_use_role = usage_source_role == "exact_product_use"
    exact_product_use_claim_allowed = (
        exact_product_use_role
        and evidence.get("exact_product_identity_claim") is True
        and evidence.get("exact_product_identity_verified") is True
    )
    if exact_product_use_role and evidence.get("exact_product_identity_verified") is not True:
        blockers.append("V143_EXACT_PRODUCT_IDENTITY_VERIFICATION_REQUIRED")
    if (
        usage_source_role == "generic_usage_example"
        and evidence.get("exact_product_identity_claim") is True
    ):
        blockers.append("V143_GENERIC_USAGE_EXACT_PRODUCT_OVERCLAIM")

    nationality_claim_allowed = (
        not nationality_claim or evidence.get("actor_nationality_verified") is True
    )
    if not nationality_claim_allowed:
        blockers.append("V143_NATIONALITY_CLAIM_UNVERIFIED")
    if evidence.get("product_identity_binding_verified") is not True:
        blockers.append("V143_PRODUCT_IDENTITY_BINDING_REQUIRED")

    approved_korean_merchant_tts = (
        evidence.get("tts_provider_approved") is True
        and str(evidence.get("tts_language") or "").strip().lower().startswith("ko")
        and str(evidence.get("tts_delivery_style") or "").strip()
        == REQUIRED_TTS_DELIVERY
    )
    if not approved_korean_merchant_tts:
        blockers.append("V143_APPROVED_KOREAN_MERCHANT_TTS_REQUIRED")
    merchant_tts_speed_pass = _finite_between(
        evidence.get("tts_speed_multiplier"),
        MIN_MERCHANT_TTS_SPEED,
        MAX_MERCHANT_TTS_SPEED,
    )
    if not merchant_tts_speed_pass:
        blockers.append("V143_MERCHANT_TTS_SPEED_OUT_OF_RANGE")

    if (
        evidence.get("safe_to_upload") is True
        or evidence.get("safe_to_public_upload") is True
    ):
        blockers.append("V143_UPLOAD_DEFAULT_MUST_REMAIN_BLOCKED")

    unique_blockers = list(dict.fromkeys(blockers))
    return {
        "version": "v143",
        "passed": not unique_blockers,
        "blockers": unique_blockers,
        "usage_source_role": usage_source_role,
        "exact_product_use_claim_allowed": exact_product_use_claim_allowed,
        "nationality_claim_allowed": nationality_claim_allowed,
        "merchant_tts_pass": approved_korean_merchant_tts and merchant_tts_speed_pass,
        "SAFE_TO_UPLOAD": False,
        "SAFE_TO_PUBLIC_UPLOAD": False,
    }


def evaluate_v143_worker_pre_render_policy(
    render_plan: dict,
    verified_binding: dict[str, object],
    config: object,
) -> dict[str, object]:
    plan_evidence = render_plan.get("creative_policy")
    if not isinstance(plan_evidence, dict) or set(plan_evidence) != EXPECTED_PLAN_EVIDENCE_KEYS:
        return _worker_blocked_result(
            "V143_WORKER_EVIDENCE_REQUIRED",
            binding_verified=verified_binding.get("binding_verified") is True,
        )

    usage_source_role = plan_evidence.get("usage_source_role")
    format_name = verified_binding.get("format_name")
    format_evidence_matches = (
        format_name == "product_reference_repeat"
        and usage_source_role == "product_reference_still"
    ) or (
        format_name == "real_usage_storyboard"
        and usage_source_role in {"exact_product_use", "generic_usage_example"}
    )
    if not format_evidence_matches:
        return _worker_blocked_result(
            "V143_WORKER_EVIDENCE_FORMAT_MISMATCH",
            binding_verified=verified_binding.get("binding_verified") is True,
        )

    shots = render_plan.get("shots")
    first_shot = shots[0] if isinstance(shots, list) and shots and isinstance(shots[0], dict) else {}
    hook_lines = wrap_caption(
        str(first_shot.get("caption") or ""),
        max_chars=HOOK_MAX_CHARS,
        max_lines=MAX_HOOK_LINES,
    )
    evidence = {
        "hook_font_px": HOOK_FONT_SIZE,
        "hook_max_lines": len(hook_lines),
        "hook_visible_within_seconds": (
            0.0 if str(first_shot.get("shot_id") or "").strip() == "hook" else math.inf
        ),
        "hook_high_contrast": (
            HOOK_BOX_COLOR == "black@0.78" and HOOK_ACCENT_COLOR == "0xfacc15@1"
        ),
        **plan_evidence,
        "product_identity_binding_verified": verified_binding.get("binding_verified") is True,
        "tts_provider_approved": getattr(config, "korean_voice_provider_approved", False),
        "tts_language": getattr(config, "korean_voice_language", ""),
        "tts_speed_multiplier": getattr(config, "korean_voice_speed", 1.14),
        "tts_delivery_style": getattr(config, "korean_voice_delivery_style", ""),
        "safe_to_upload": False,
        "safe_to_public_upload": False,
    }
    policy = evaluate_v143_creative_policy(evidence)
    return {
        "gate_version": "v143",
        "gate_pass": policy["passed"],
        "blockers": policy["blockers"],
        "usage_source_role": policy["usage_source_role"],
        "binding_verified": verified_binding.get("binding_verified") is True,
        "raw_evidence_in_report": False,
        "external_api_called": False,
        "upload_attempted": False,
        "SAFE_TO_UPLOAD": False,
        "SAFE_TO_PUBLIC_UPLOAD": False,
    }


def _worker_blocked_result(blocker: str, *, binding_verified: bool) -> dict[str, object]:
    return {
        "gate_version": "v143",
        "gate_pass": False,
        "blockers": [blocker],
        "usage_source_role": None,
        "binding_verified": binding_verified,
        "raw_evidence_in_report": False,
        "external_api_called": False,
        "upload_attempted": False,
        "SAFE_TO_UPLOAD": False,
        "SAFE_TO_PUBLIC_UPLOAD": False,
    }


def _finite_at_least(value: object, minimum: float) -> bool:
    return _finite_number(value) and float(value) >= minimum


def _finite_between(value: object, minimum: float, maximum: float) -> bool:
    return _finite_number(value) and minimum <= float(value) <= maximum


def _finite_number(value: object) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(float(value))
    )
