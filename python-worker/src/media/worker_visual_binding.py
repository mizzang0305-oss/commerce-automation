from __future__ import annotations

import hashlib
import hmac
import json
from typing import Literal


WorkerVisualFormat = Literal["real_usage_storyboard", "product_reference_repeat"]
MINIMUM_SECRET_LENGTH = 32
EXPECTED_BINDING_KEYS = {
    "version",
    "issuer",
    "queue_id",
    "product_name_sha256",
    "affiliate_url_sha256",
    "script_sha256",
    "render_plan_sha256",
    "format_name",
    "target_category",
    "manifest_purpose",
    "scene_image_url_sha256",
    "scene_category_labels",
    "signature",
}


def verify_server_visual_binding(
    job: dict,
    payload: dict,
    render_plan: dict,
    secret: str,
) -> dict[str, object]:
    if len(secret.strip()) < MINIMUM_SECRET_LENGTH:
        raise ValueError("worker_visual_binding_secret_missing_or_too_short")

    binding = payload.get("server_visual_binding")
    if not isinstance(binding, dict) or set(binding) != EXPECTED_BINDING_KEYS:
        raise ValueError("server_visual_binding_schema_invalid")

    shots = render_plan.get("shots")
    if not isinstance(shots, list) or not shots or any(not isinstance(shot, dict) for shot in shots):
        raise ValueError("server_visual_binding_render_plan_invalid")

    queue_id = _required_string(payload.get("product_queue_id"), "product_queue_id")
    if _required_string(job.get("product_queue_id"), "job_product_queue_id") != queue_id:
        raise ValueError("server_visual_binding_queue_mismatch")
    if _required_string(render_plan.get("queue_id"), "render_plan_queue_id") != queue_id:
        raise ValueError("server_visual_binding_queue_mismatch")

    product_name = _required_string(render_plan.get("product_name"), "render_plan_product_name")
    affiliate_url = _required_string(payload.get("selected_affiliate_url"), "selected_affiliate_url")
    target_category = _required_string(payload.get("server_product_category"), "server_product_category")
    image_urls = [
        _required_string(shot.get("image_url"), "render_plan_shot_image_url")
        for shot in shots
    ]
    voice_lines = [
        _required_string(shot.get("voice_text"), "render_plan_shot_voice_text")
        for shot in shots
    ]
    format_name = infer_worker_visual_format(image_urls)
    scene_categories = binding.get("scene_category_labels")
    if (
        not isinstance(scene_categories, list)
        or len(scene_categories) != len(image_urls)
        or any(category != target_category for category in scene_categories)
    ):
        raise ValueError("server_visual_binding_scene_category_mismatch")

    unsigned = {
        "version": "1",
        "issuer": "commerce-web-next-batch",
        "queue_id": queue_id,
        "product_name_sha256": _sha256(product_name),
        "affiliate_url_sha256": _sha256(affiliate_url),
        "script_sha256": _sha256("\n".join(voice_lines)),
        "render_plan_sha256": _sha256(
            json.dumps(render_plan, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        ),
        "format_name": format_name,
        "target_category": target_category,
        "manifest_purpose": "worker_video_render",
        "scene_image_url_sha256": [_sha256(url) for url in image_urls],
        "scene_category_labels": [target_category for _ in image_urls],
    }
    canonical = json.dumps(unsigned, ensure_ascii=False, separators=(",", ":"))
    expected_signature = hmac.new(
        secret.strip().encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    signature = binding.get("signature")
    if not isinstance(signature, str) or not hmac.compare_digest(signature, expected_signature):
        raise ValueError("server_visual_binding_signature_invalid")
    if any(binding.get(key) != value for key, value in unsigned.items()):
        raise ValueError("server_visual_binding_payload_mismatch")

    return {
        "binding_version": "1",
        "binding_verified": True,
        "format_name": format_name,
        "target_category": target_category,
        "scene_count": len(image_urls),
        "raw_urls_in_report": False,
        "secret_exposed": False,
    }


def infer_worker_visual_format(image_urls: list[str]) -> WorkerVisualFormat:
    exact_source_count = len({value.strip() for value in image_urls})
    if 1 <= exact_source_count <= 3:
        return "product_reference_repeat"
    return "real_usage_storyboard"


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _required_string(value: object, field: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise ValueError(f"server_visual_binding_field_missing:{field}")
    return text
