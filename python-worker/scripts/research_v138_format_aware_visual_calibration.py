from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys
from time import perf_counter

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.media.format_aware_visual_calibration import (  # noqa: E402
    FormatAwareSample,
    FormatAwareScene,
    evaluate_format_aware_calibration,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Calibrate format-aware pre-render visual gates.")
    parser.add_argument("--manifest", type=Path, required=True, action="append")
    parser.add_argument("--owner-review", type=Path, required=True, action="append")
    parser.add_argument("--asset-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    started = perf_counter()
    manifest = _merge_manifests(args.manifest)
    owner_review = _merge_owner_reviews(args.owner_review)
    report_version = str(manifest.get("version", "v138"))
    asset_root = args.asset_root.resolve()
    assets = manifest.get("assets", {})
    samples = [
        _load_sample(item, owner_review, asset_root, assets)
        for item in manifest.get("samples", [])
    ]
    calibration = evaluate_format_aware_calibration(samples)
    ready = bool(calibration["all_format_profiles_promotion_ready"])
    report = {
        "version": report_version,
        "status": (
            "PASS_FORMAT_AWARE_VISUAL_CALIBRATION_PROMOTION_EVIDENCE_READY"
            if ready
            else "BLOCKED_PRODUCT_REFERENCE_REPEAT_PROMOTION_INSUFFICIENT_OWNER_PASS_DIVERSITY"
        ),
        "processing_duration_ms": round((perf_counter() - started) * 1000, 2),
        "calibration": calibration,
        "decision": (
            "FORMAT_AWARE_GATE_PROMOTION_EVIDENCE_READY_SEPARATE_INTEGRATION_REVIEW_REQUIRED"
            if ready
            else "KEEP_RESEARCH_ONLY_COLLECT_SECOND_CATEGORY_OWNER_PASS_FOR_PRODUCT_REFERENCE_REPEAT"
        ),
        "owner_review_scope": owner_review.get("scope"),
        "tts_attempted": False,
        "final_render_attempted": False,
        "upload_attempted": False,
        "SAFE_TO_UPLOAD": False,
        "SAFE_TO_PUBLIC_UPLOAD": False,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


def _load_sample(
    item: dict[str, object],
    owner_review: dict[str, object],
    asset_root: Path,
    assets: dict[str, object],
) -> FormatAwareSample:
    sample_id = str(item["sample_id"])
    review_samples = owner_review.get("samples", {})
    review = review_samples.get(sample_id) if isinstance(review_samples, dict) else None
    review_authorization = (
        review.get("_authorization") if isinstance(review, dict) else None
    ) or owner_review.get("authorization", "")
    review_scope = (
        review.get("_scope") if isinstance(review, dict) else None
    ) or owner_review.get("scope")
    review_verified = bool(
        str(review_authorization).startswith("OWNER_AUTHORIZED_V")
        and str(review_authorization).endswith("_LOCAL_RESEARCH_LABELING")
        and review_scope == "local_research_only_no_upload_authority"
        and isinstance(review, dict)
        and review.get("owner_label") == item.get("owner_label")
        and review.get("category") == item.get("category")
        and review.get("format_name") == item.get("format_name")
    )
    source_assertions_verified = all(
        _verify_source_assertion(assertion, asset_root)
        for assertion in item.get("source_assertions", [])
    )
    review_verified = review_verified and source_assertions_verified
    scenes = tuple(
        _load_scene(f"{sample_id}-{index + 1:02d}", str(asset_id), assets, asset_root)
        for index, asset_id in enumerate(item.get("scene_sequence", []))
    )
    binding = item.get("binding_evidence", {})
    return FormatAwareSample(
        sample_id=sample_id,
        category=str(item["category"]),
        format_name=str(item["format_name"]),
        owner_label=str(item["owner_label"]),
        owner_decision_verified=review_verified,
        expected_scene_category_pass=bool(item["expected_scene_category_pass"]),
        expected_binding_pass=bool(item["expected_binding_pass"]),
        expected_format_profile_pass=bool(item["expected_format_profile_pass"]),
        binding_evidence=tuple((str(key), bool(value)) for key, value in binding.items()),
        scenes=scenes,
    )


def _load_scene(
    scene_id: str,
    asset_id: str,
    assets: dict[str, object],
    asset_root: Path,
) -> FormatAwareScene:
    item = assets.get(asset_id)
    if not isinstance(item, dict):
        raise ValueError(f"unknown_scene_asset:{asset_id}")
    image_path = _resolve_under_asset_root(asset_root, str(item["image"]))
    actual_prefix = hashlib.sha256(image_path.read_bytes()).hexdigest()[:12]
    if actual_prefix != str(item["sha256_prefix"]):
        raise ValueError(f"scene_hash_mismatch:{scene_id}")
    return FormatAwareScene(
        scene_id=scene_id,
        image_path=image_path,
        category_label=str(item["category_label"]),
    )


def _resolve_under_asset_root(asset_root: Path, relative_path: str) -> Path:
    resolved = (asset_root / relative_path).resolve()
    if asset_root != resolved and asset_root not in resolved.parents:
        raise ValueError("format_aware_asset_path_outside_root")
    if not resolved.is_file():
        raise ValueError("format_aware_asset_missing")
    return resolved


def _verify_source_assertion(assertion: dict[str, object], asset_root: Path) -> bool:
    try:
        source_path = _resolve_under_asset_root(asset_root, str(assertion["file"]))
        value: object = json.loads(source_path.read_text(encoding="utf-8"))
    except (KeyError, OSError, ValueError, json.JSONDecodeError):
        return False
    for part in str(assertion["field"]).split("."):
        if not isinstance(value, dict) or part not in value:
            return False
        value = value[part]
    return value == assertion.get("equals")


def _merge_manifests(paths: list[Path]) -> dict[str, object]:
    merged: dict[str, object] = {"assets": {}, "samples": []}
    for path in paths:
        payload = json.loads(path.read_text(encoding="utf-8"))
        merged["version"] = payload.get("version", merged.get("version"))
        assets = payload.get("assets", {})
        samples = payload.get("samples", [])
        if not isinstance(assets, dict) or not isinstance(samples, list):
            raise ValueError("invalid_format_aware_manifest")
        merged["assets"].update(assets)
        merged["samples"].extend(samples)
    return merged


def _merge_owner_reviews(paths: list[Path]) -> dict[str, object]:
    merged: dict[str, object] = {"samples": {}}
    for path in paths:
        payload = json.loads(path.read_text(encoding="utf-8"))
        authorization = payload.get("authorization")
        scope = payload.get("scope")
        merged["authorization"] = authorization
        merged["scope"] = scope
        samples = payload.get("samples", {})
        if not isinstance(samples, dict):
            raise ValueError("invalid_format_aware_owner_review")
        for sample_id, sample_review in samples.items():
            if not isinstance(sample_review, dict):
                raise ValueError("invalid_format_aware_owner_review_sample")
            merged["samples"][sample_id] = {
                **sample_review,
                "_authorization": authorization,
                "_scope": scope,
            }
    return merged


if __name__ == "__main__":
    raise SystemExit(main())
