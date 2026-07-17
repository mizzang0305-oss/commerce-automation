from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Literal

from src.media.pre_render_visual_evidence_gate import (
    build_scene_similarity_profile,
    summarize_scene_similarity_profile,
)


SampleLabel = Literal["pass", "block"]
BASELINE_CATEGORY = "laundry"
SIMILARITY_THRESHOLD = 0.88
MAXIMUM_LARGEST_CLUSTER_RATIO = 0.5
MINIMUM_PERCEPTUAL_CLUSTER_COUNT = 3


@dataclass(frozen=True)
class CategorySceneEvidence:
    scene_id: str
    image_path: Path
    owner_category_label: str


@dataclass(frozen=True)
class CrossCategorySample:
    sample_id: str
    expected_category: str
    owner_label: SampleLabel
    owner_decision_verified: bool
    scenes: tuple[CategorySceneEvidence, ...]


def evaluate_cross_category_samples(
    samples: Iterable[CrossCategorySample],
    baseline_category: str = BASELINE_CATEGORY,
) -> dict[str, object]:
    sample_list = list(samples)
    if not sample_list:
        raise ValueError("cross_category_validation_requires_samples")
    if any(not sample.owner_decision_verified for sample in sample_list):
        raise ValueError("cross_category_validation_requires_verified_owner_decisions")
    if any(len(sample.scenes) < 5 for sample in sample_list):
        raise ValueError("cross_category_validation_requires_at_least_five_scenes_per_sample")

    non_baseline_categories = sorted({
        sample.expected_category
        for sample in sample_list
        if sample.expected_category != baseline_category
    })
    if len(non_baseline_categories) < 2:
        raise ValueError("cross_category_validation_requires_two_non_baseline_categories")
    if {sample.owner_label for sample in sample_list} != {"pass", "block"}:
        raise ValueError("cross_category_validation_requires_pass_and_block_owner_labels")

    rows: list[dict[str, object]] = []
    for sample in sample_list:
        semantic = evaluate_semantic_category_binding(sample)
        summary = summarize_scene_similarity_profile(
            build_scene_similarity_profile(scene.image_path for scene in sample.scenes),
            SIMILARITY_THRESHOLD,
        )
        pixel_gate_pass = bool(
            int(summary["perceptual_cluster_count"]) >= MINIMUM_PERCEPTUAL_CLUSTER_COUNT
            and float(summary["largest_cluster_ratio"]) <= MAXIMUM_LARGEST_CLUSTER_RATIO
        )
        semantic_gate_pass = bool(semantic["gate_pass"])
        combined_gate_pass = pixel_gate_pass and semantic_gate_pass
        rows.append({
            "sample_id": sample.sample_id,
            "expected_category": sample.expected_category,
            "owner_label": sample.owner_label,
            "scene_count": len(sample.scenes),
            "owner_labeled_scene_count": len(sample.scenes),
            "pixel_gate_label": "pass" if pixel_gate_pass else "block",
            "semantic_gate_label": "pass" if semantic_gate_pass else "block",
            "combined_gate_label": "pass" if combined_gate_pass else "block",
            "semantic_mismatch_count": semantic["mismatch_count"],
            "semantic_mismatch_scene_ids": semantic["mismatch_scene_ids"],
            "perceptual_cluster_count": summary["perceptual_cluster_count"],
            "largest_cluster_ratio": summary["largest_cluster_ratio"],
            "average_pair_similarity": summary["average_pair_similarity"],
        })

    pixel_evaluation = _evaluate_predictions(rows, "pixel_gate_label")
    semantic_evaluation = _evaluate_predictions(rows, "semantic_gate_label")
    combined_evaluation = _evaluate_predictions(rows, "combined_gate_label")
    category_label_sets = {
        category: sorted({
            sample.owner_label for sample in sample_list
            if sample.expected_category == category
        })
        for category in non_baseline_categories
    }
    category_balance_ready = all(labels == ["block", "pass"] for labels in category_label_sets.values())

    return {
        "validation_version": "v137",
        "baseline_category": baseline_category,
        "sample_count": len(sample_list),
        "owner_labeled_scene_count": sum(len(sample.scenes) for sample in sample_list),
        "non_baseline_category_count": len(non_baseline_categories),
        "non_baseline_categories": non_baseline_categories,
        "category_owner_label_sets": category_label_sets,
        "category_balance_ready": category_balance_ready,
        "pixel_gate_evaluation": pixel_evaluation,
        "semantic_gate_evaluation": semantic_evaluation,
        "combined_gate_evaluation": combined_evaluation,
        "samples": rows,
        "pixel_gate_cross_category_ready": (
            pixel_evaluation["unsafe_false_pass_count"] == 0
            and pixel_evaluation["false_block_count"] == 0
        ),
        "semantic_guard_ready": semantic_evaluation["unsafe_false_pass_count"] == 0,
        "recommended_execution_order": [
            "scene_category_binding",
            "script_product_manifest_binding",
            "format_profile_selection",
            "pixel_diversity_gate",
        ],
        "raw_paths_in_report": False,
        "external_api_called": False,
        "upload_attempted": False,
    }


def evaluate_semantic_category_binding(sample: CrossCategorySample) -> dict[str, object]:
    allowed_categories = {sample.expected_category, "exact_product"}
    mismatched_scenes = [
        scene.scene_id
        for scene in sample.scenes
        if scene.owner_category_label not in allowed_categories
    ]
    return {
        "sample_id": sample.sample_id,
        "gate_pass": not mismatched_scenes,
        "mismatch_count": len(mismatched_scenes),
        "mismatch_scene_ids": mismatched_scenes,
        "raw_paths_in_report": False,
    }


def _evaluate_predictions(
    rows: list[dict[str, object]],
    prediction_key: str,
) -> dict[str, object]:
    pass_rows = [row for row in rows if row["owner_label"] == "pass"]
    block_rows = [row for row in rows if row["owner_label"] == "block"]
    true_pass = sum(row[prediction_key] == "pass" for row in pass_rows)
    true_block = sum(row[prediction_key] == "block" for row in block_rows)
    false_block = len(pass_rows) - true_pass
    unsafe_false_pass = len(block_rows) - true_block
    pass_recall = true_pass / len(pass_rows) if pass_rows else 0.0
    block_recall = true_block / len(block_rows) if block_rows else 0.0
    return {
        "accuracy": round((true_pass + true_block) / len(rows), 4),
        "balanced_accuracy": round((pass_recall + block_recall) / 2, 4),
        "pass_recall": round(pass_recall, 4),
        "block_recall": round(block_recall, 4),
        "true_pass_count": true_pass,
        "true_block_count": true_block,
        "false_block_count": false_block,
        "unsafe_false_pass_count": unsafe_false_pass,
    }
