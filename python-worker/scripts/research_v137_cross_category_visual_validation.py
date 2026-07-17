from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from time import perf_counter

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.media.cross_category_visual_validation import (  # noqa: E402
    CategorySceneEvidence,
    CrossCategorySample,
    evaluate_cross_category_samples,
    evaluate_semantic_category_binding,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate the V135 pixel gate on owner-labeled categories.")
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--asset-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    started = perf_counter()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    samples = [_load_sample(item, args.asset_root.resolve()) for item in manifest.get("samples", [])]
    semantic_started = perf_counter()
    semantic_precheck = [evaluate_semantic_category_binding(sample) for sample in samples]
    semantic_duration_ms = round((perf_counter() - semantic_started) * 1000, 4)
    validation = evaluate_cross_category_samples(samples)
    pixel_ready = bool(validation["pixel_gate_cross_category_ready"])
    report = {
        "version": "v137",
        "status": (
            "PASS_CROSS_CATEGORY_PIXEL_GENERALIZATION"
            if pixel_ready
            else "BLOCKED_CROSS_CATEGORY_PIXEL_GENERALIZATION"
        ),
        "processing_duration_ms": round((perf_counter() - started) * 1000, 2),
        "semantic_precheck_processing_duration_ms": semantic_duration_ms,
        "semantic_precheck_block_count": sum(not item["gate_pass"] for item in semantic_precheck),
        "validation": validation,
        "decision": (
            "KEEP_V135_PIXEL_THRESHOLDS_AS_UNIVERSAL_GATE"
            if pixel_ready
            else "ADD_FULL_BINDING_GUARD_AND_CALIBRATE_FORMAT_SPECIFIC_PIXEL_PROFILES"
        ),
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


def _load_sample(item: dict[str, object], asset_root: Path) -> CrossCategorySample:
    assertions = item.get("owner_evidence", [])
    owner_decision_verified = bool(assertions) and all(
        _verify_assertion(asset_root, assertion)
        for assertion in assertions
    )
    scenes = tuple(
        CategorySceneEvidence(
            scene_id=str(scene["scene_id"]),
            image_path=_resolve_under_asset_root(asset_root, str(scene["image"])),
            owner_category_label=str(scene["owner_category_label"]),
        )
        for scene in item.get("scenes", [])
    )
    return CrossCategorySample(
        sample_id=str(item["sample_id"]),
        expected_category=str(item["expected_category"]),
        owner_label=str(item["owner_label"]),
        owner_decision_verified=owner_decision_verified,
        scenes=scenes,
    )


def _verify_assertion(asset_root: Path, assertion: dict[str, object]) -> bool:
    try:
        evidence_path = _resolve_under_asset_root(asset_root, str(assertion["file"]))
    except ValueError:
        return False
    if not evidence_path.is_file():
        return False
    payload = json.loads(evidence_path.read_text(encoding="utf-8"))
    value: object = payload
    for part in str(assertion["field"]).split("."):
        if not isinstance(value, dict) or part not in value:
            return False
        value = value[part]
    expected = assertion["equals"]
    if isinstance(value, list) and assertion.get("operator") == "contains":
        return expected in value
    return value == expected


def _resolve_under_asset_root(asset_root: Path, relative_path: str) -> Path:
    resolved = (asset_root / relative_path).resolve()
    if asset_root != resolved and asset_root not in resolved.parents:
        raise ValueError("cross_category_asset_path_outside_root")
    return resolved


if __name__ == "__main__":
    raise SystemExit(main())
