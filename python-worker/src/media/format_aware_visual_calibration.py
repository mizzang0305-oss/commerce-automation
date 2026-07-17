from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Literal

from src.media.pre_render_visual_evidence_gate import (
    build_scene_similarity_profile,
    summarize_scene_similarity_profile,
)


SampleLabel = Literal["pass", "block"]
FormatName = Literal["real_usage_storyboard", "product_reference_repeat"]
SIMILARITY_THRESHOLD = 0.88
MAXIMUM_STORYBOARD_CLUSTER_RATIO = 0.5
MINIMUM_STORYBOARD_CLUSTER_COUNT = 3
MINIMUM_SCENE_COUNT = 5
MAXIMUM_REPEAT_SOURCE_COUNT = 3


@dataclass(frozen=True)
class FormatAwareScene:
    scene_id: str
    image_path: Path
    category_label: str


@dataclass(frozen=True)
class FormatAwareSample:
    sample_id: str
    category: str
    format_name: FormatName
    owner_label: SampleLabel
    owner_decision_verified: bool
    expected_scene_category_pass: bool
    expected_binding_pass: bool
    expected_format_profile_pass: bool
    binding_evidence: tuple[tuple[str, bool], ...]
    scenes: tuple[FormatAwareScene, ...]


def evaluate_format_aware_calibration(
    samples: Iterable[FormatAwareSample],
) -> dict[str, object]:
    sample_list = list(samples)
    if not sample_list:
        raise ValueError("format_aware_calibration_requires_samples")
    if any(not sample.owner_decision_verified for sample in sample_list):
        raise ValueError("format_aware_calibration_requires_verified_owner_decisions")
    if any(len(sample.scenes) < MINIMUM_SCENE_COUNT for sample in sample_list):
        raise ValueError("format_aware_calibration_requires_five_scenes_per_sample")

    categories = sorted({sample.category for sample in sample_list})
    category_label_sets = {
        category: sorted({sample.owner_label for sample in sample_list if sample.category == category})
        for category in categories
    }
    if any(labels != ["block", "pass"] for labels in category_label_sets.values()):
        raise ValueError("format_aware_calibration_requires_pass_and_block_per_category")

    rows: list[dict[str, object]] = []
    for sample in sample_list:
        expected_owner_pass = bool(
            sample.expected_scene_category_pass
            and sample.expected_binding_pass
            and sample.expected_format_profile_pass
        )
        if expected_owner_pass != (sample.owner_label == "pass"):
            raise ValueError("owner_label_does_not_match_expected_component_outcomes")

        summary = summarize_scene_similarity_profile(
            build_scene_similarity_profile(scene.image_path for scene in sample.scenes),
            SIMILARITY_THRESHOLD,
        )
        mismatched_scene_ids = [
            scene.scene_id for scene in sample.scenes
            if scene.category_label not in {sample.category, "exact_product"}
        ]
        scene_category_pass = not mismatched_scene_ids
        required_binding_keys = {
            "selected_product_matches_target",
            "script_matches_product",
            "manifest_purpose_matches_product",
            "scene_source_authorized",
        }
        if sample.format_name == "product_reference_repeat":
            required_binding_keys.add("exact_product_identity_verified")
        evidence = dict(sample.binding_evidence)
        missing_keys = sorted(required_binding_keys - evidence.keys())
        if missing_keys:
            raise ValueError(f"binding_evidence_missing:{','.join(missing_keys)}")
        binding_failures = sorted(key for key in required_binding_keys if not evidence[key])
        binding_pass = not binding_failures
        format_profile_pass = _format_profile_pass(sample.format_name, summary)
        combined_pass = scene_category_pass and binding_pass and format_profile_pass
        rows.append({
            "sample_id": sample.sample_id,
            "category": sample.category,
            "format_name": sample.format_name,
            "owner_label": sample.owner_label,
            "scene_count": len(sample.scenes),
            "expected_scene_category_pass": sample.expected_scene_category_pass,
            "actual_scene_category_pass": scene_category_pass,
            "expected_binding_pass": sample.expected_binding_pass,
            "actual_binding_pass": binding_pass,
            "expected_format_profile_pass": sample.expected_format_profile_pass,
            "actual_format_profile_pass": format_profile_pass,
            "combined_label": "pass" if combined_pass else "block",
            "scene_category_mismatch_count": len(mismatched_scene_ids),
            "scene_category_mismatch_ids": mismatched_scene_ids,
            "binding_failures": binding_failures,
            "exact_file_hash_count": summary["exact_file_hash_count"],
            "perceptual_cluster_count": summary["perceptual_cluster_count"],
            "largest_cluster_ratio": summary["largest_cluster_ratio"],
            "average_pair_similarity": summary["average_pair_similarity"],
        })

    formats: dict[str, object] = {}
    for format_name in ("real_usage_storyboard", "product_reference_repeat"):
        format_rows = [row for row in rows if row["format_name"] == format_name]
        if not format_rows:
            raise ValueError(f"format_aware_calibration_missing_format:{format_name}")
        owner_metrics = _label_metrics(
            [row["owner_label"] == "pass" for row in format_rows],
            [row["combined_label"] == "pass" for row in format_rows],
        )
        profile_metrics = _label_metrics(
            [bool(row["expected_format_profile_pass"]) for row in format_rows],
            [bool(row["actual_format_profile_pass"]) for row in format_rows],
        )
        format_categories = sorted({str(row["category"]) for row in format_rows})
        owner_pass_count = sum(row["owner_label"] == "pass" for row in format_rows)
        owner_block_count = len(format_rows) - owner_pass_count
        expected_profile_pass_count = sum(bool(row["expected_format_profile_pass"]) for row in format_rows)
        expected_profile_block_count = len(format_rows) - expected_profile_pass_count
        promotion_ready = bool(
            len(format_rows) >= 4
            and len(format_categories) >= 2
            and owner_pass_count >= 2
            and owner_block_count >= 2
            and expected_profile_pass_count >= 2
            and expected_profile_block_count >= 2
            and owner_metrics["accuracy"] == 1.0
            and profile_metrics["accuracy"] == 1.0
        )
        formats[format_name] = {
            "sample_count": len(format_rows),
            "categories": format_categories,
            "owner_pass_count": owner_pass_count,
            "owner_block_count": owner_block_count,
            "expected_profile_pass_count": expected_profile_pass_count,
            "expected_profile_block_count": expected_profile_block_count,
            "owner_decision_metrics": owner_metrics,
            "format_profile_metrics": profile_metrics,
            "profile_rule_calibrated": profile_metrics["accuracy"] == 1.0,
            "promotion_ready": promotion_ready,
            "profile": _profile_contract(format_name),
        }

    overall_metrics = _label_metrics(
        [row["owner_label"] == "pass" for row in rows],
        [row["combined_label"] == "pass" for row in rows],
    )
    all_formats_ready = all(bool(value["promotion_ready"]) for value in formats.values())
    return {
        "calibration_version": "v138",
        "sample_count": len(sample_list),
        "category_count": len(categories),
        "categories": categories,
        "category_owner_label_sets": category_label_sets,
        "category_balance_ready": True,
        "overall_owner_decision_metrics": overall_metrics,
        "formats": formats,
        "samples": rows,
        "all_format_profiles_promotion_ready": all_formats_ready,
        "integration_review_ready": all_formats_ready and overall_metrics["accuracy"] == 1.0,
        "safe_to_integrate": False,
        "required_gate_order": [
            "scene_category_binding",
            "script_product_manifest_binding",
            "format_profile_selection",
            "format_specific_pixel_gate",
        ],
        "raw_paths_in_report": False,
        "external_api_called": False,
        "upload_attempted": False,
    }


def _format_profile_pass(format_name: FormatName, summary: dict[str, object]) -> bool:
    if format_name == "real_usage_storyboard":
        return bool(
            int(summary["scene_count"]) >= MINIMUM_SCENE_COUNT
            and int(summary["perceptual_cluster_count"]) >= MINIMUM_STORYBOARD_CLUSTER_COUNT
            and float(summary["largest_cluster_ratio"]) <= MAXIMUM_STORYBOARD_CLUSTER_RATIO
        )
    if format_name == "product_reference_repeat":
        return bool(
            int(summary["scene_count"]) >= MINIMUM_SCENE_COUNT
            and 1 <= int(summary["exact_file_hash_count"]) <= MAXIMUM_REPEAT_SOURCE_COUNT
        )
    raise ValueError(f"unsupported_format:{format_name}")


def evaluate_runtime_format_profile(
    format_name: FormatName,
    image_paths: Iterable[Path],
) -> dict[str, object]:
    paths = tuple(image_paths)
    blockers: list[str] = []
    try:
        summary = summarize_scene_similarity_profile(
            build_scene_similarity_profile(paths),
            SIMILARITY_THRESHOLD,
        )
    except (OSError, ValueError):
        return {
            "gate_version": "v140",
            "gate_pass": False,
            "format_name": format_name,
            "blockers": ["SCENE_IMAGE_UNREADABLE"],
            "scene_count": len(paths),
            "raw_paths_in_report": False,
            "external_api_called": False,
            "upload_attempted": False,
        }

    if len(paths) < MINIMUM_SCENE_COUNT:
        blockers.append("SCENE_COUNT_BELOW_MINIMUM")
    if format_name == "real_usage_storyboard":
        if int(summary["perceptual_cluster_count"]) < MINIMUM_STORYBOARD_CLUSTER_COUNT:
            blockers.append("VISUAL_CLUSTER_COUNT_BELOW_MINIMUM")
        if float(summary["largest_cluster_ratio"]) > MAXIMUM_STORYBOARD_CLUSTER_RATIO:
            blockers.append("REPEATED_VISUAL_CLUSTER")
    elif format_name == "product_reference_repeat":
        if not 1 <= int(summary["exact_file_hash_count"]) <= MAXIMUM_REPEAT_SOURCE_COUNT:
            blockers.append("EXACT_SOURCE_COUNT_OUTSIDE_PROFILE")
    else:
        raise ValueError(f"unsupported_format:{format_name}")

    return {
        "gate_version": "v140",
        "gate_pass": not blockers,
        "format_name": format_name,
        "blockers": blockers,
        "scene_count": len(paths),
        "exact_file_hash_count": summary["exact_file_hash_count"],
        "perceptual_cluster_count": summary["perceptual_cluster_count"],
        "largest_cluster_ratio": summary["largest_cluster_ratio"],
        "raw_paths_in_report": False,
        "external_api_called": False,
        "upload_attempted": False,
    }


def _profile_contract(format_name: str) -> dict[str, object]:
    if format_name == "real_usage_storyboard":
        return {
            "minimum_scene_count": MINIMUM_SCENE_COUNT,
            "minimum_perceptual_cluster_count": MINIMUM_STORYBOARD_CLUSTER_COUNT,
            "maximum_largest_cluster_ratio": MAXIMUM_STORYBOARD_CLUSTER_RATIO,
            "perceptual_similarity_threshold": SIMILARITY_THRESHOLD,
        }
    return {
        "minimum_scene_count": MINIMUM_SCENE_COUNT,
        "minimum_exact_source_count": 1,
        "maximum_exact_source_count": MAXIMUM_REPEAT_SOURCE_COUNT,
        "pixel_diversity_minimum_not_applied": True,
        "exact_product_identity_binding_required": True,
    }


def _label_metrics(expected: list[bool], predicted: list[bool]) -> dict[str, object]:
    true_pass = sum(want and got for want, got in zip(expected, predicted))
    true_block = sum((not want) and (not got) for want, got in zip(expected, predicted))
    false_block = sum(want and (not got) for want, got in zip(expected, predicted))
    unsafe_false_pass = sum((not want) and got for want, got in zip(expected, predicted))
    return {
        "accuracy": round((true_pass + true_block) / len(expected), 4),
        "true_pass_count": true_pass,
        "true_block_count": true_block,
        "false_block_count": false_block,
        "unsafe_false_pass_count": unsafe_false_pass,
    }
