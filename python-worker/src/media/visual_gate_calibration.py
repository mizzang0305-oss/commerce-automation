from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Literal

from src.media.pre_render_visual_evidence_gate import (
    SceneSimilarityProfile,
    build_scene_similarity_profile,
    summarize_scene_similarity_profile,
)


SampleLabel = Literal["pass", "block"]
SIMILARITY_THRESHOLDS = (0.82, 0.84, 0.86, 0.88, 0.9, 0.92, 0.94)
MAX_CLUSTER_RATIOS = (0.4, 0.5, 0.6)
MIN_CLUSTER_COUNTS = (3, 4)
BASELINE_CONFIG = (0.88, 0.5, 3)


@dataclass(frozen=True)
class VisualCalibrationSample:
    sample_id: str
    label: SampleLabel
    image_paths: tuple[Path, ...]


@dataclass(frozen=True)
class PreparedCalibrationSample:
    sample_id: str
    label: SampleLabel
    profile: SceneSimilarityProfile


@dataclass(frozen=True)
class VisualGateConfig:
    similarity_threshold: float
    maximum_largest_cluster_ratio: float
    minimum_perceptual_cluster_count: int


def prepare_calibration_samples(
    samples: Iterable[VisualCalibrationSample],
) -> list[PreparedCalibrationSample]:
    return [
        PreparedCalibrationSample(
            sample_id=sample.sample_id,
            label=sample.label,
            profile=build_scene_similarity_profile(sample.image_paths),
        )
        for sample in samples
    ]


def calibrate_visual_gate(samples: Iterable[PreparedCalibrationSample]) -> dict[str, object]:
    sample_list = list(samples)
    if len(sample_list) < 4:
        raise ValueError("visual_gate_calibration_requires_at_least_four_samples")
    labels = {sample.label for sample in sample_list}
    if labels != {"pass", "block"}:
        raise ValueError("visual_gate_calibration_requires_pass_and_block_labels")

    configs = [
        VisualGateConfig(similarity_threshold, maximum_ratio, minimum_clusters)
        for similarity_threshold in SIMILARITY_THRESHOLDS
        for maximum_ratio in MAX_CLUSTER_RATIOS
        for minimum_clusters in MIN_CLUSTER_COUNTS
    ]
    profile_summaries = {
        sample.sample_id: {
            threshold: summarize_scene_similarity_profile(sample.profile, threshold)
            for threshold in SIMILARITY_THRESHOLDS
        }
        for sample in sample_list
    }
    selected = _select_config(sample_list, configs, profile_summaries)
    full_evaluation = _evaluate_config(sample_list, selected, profile_summaries)
    evaluated_configs = [
        (config, _evaluate_config(sample_list, config, profile_summaries))
        for config in configs
    ]
    perfect_configs = [
        config
        for config, evaluation in evaluated_configs
        if evaluation["accuracy"] == 1.0 and evaluation["unsafe_false_pass_count"] == 0
    ]

    leave_one_out_predictions = []
    for holdout in sample_list:
        training = [sample for sample in sample_list if sample.sample_id != holdout.sample_id]
        fold_config = _select_config(training, configs, profile_summaries)
        predicted_pass = _predict(
            profile_summaries[holdout.sample_id][fold_config.similarity_threshold],
            fold_config,
        )
        leave_one_out_predictions.append({
            "sample_id": holdout.sample_id,
            "expected_label": holdout.label,
            "predicted_label": "pass" if predicted_pass else "block",
            "correct": predicted_pass == (holdout.label == "pass"),
            "selected_config": _config_dict(fold_config),
        })

    correct_folds = sum(item["correct"] is True for item in leave_one_out_predictions)
    selected_rows = []
    for sample in sample_list:
        summary = profile_summaries[sample.sample_id][selected.similarity_threshold]
        predicted_pass = _predict(summary, selected)
        selected_rows.append({
            "sample_id": sample.sample_id,
            "expected_label": sample.label,
            "predicted_label": "pass" if predicted_pass else "block",
            "correct": predicted_pass == (sample.label == "pass"),
            "scene_count": summary["scene_count"],
            "perceptual_cluster_count": summary["perceptual_cluster_count"],
            "largest_cluster_ratio": summary["largest_cluster_ratio"],
            "average_pair_similarity": summary["average_pair_similarity"],
        })

    return {
        "calibration_version": "v136",
        "sample_count": len(sample_list),
        "pass_sample_count": sum(sample.label == "pass" for sample in sample_list),
        "block_sample_count": sum(sample.label == "block" for sample in sample_list),
        "candidate_config_count": len(configs),
        "selected_config": _config_dict(selected),
        "robustness": {
            "perfect_config_count": len(perfect_configs),
            "perfect_similarity_threshold_range": _range(
                config.similarity_threshold for config in perfect_configs
            ),
            "perfect_maximum_cluster_ratio_range": _range(
                config.maximum_largest_cluster_ratio for config in perfect_configs
            ),
            "perfect_minimum_cluster_counts": sorted({
                config.minimum_perceptual_cluster_count for config in perfect_configs
            }),
            "block_ratio_margin_from_selected_threshold": round(
                min(
                    float(profile_summaries[sample.sample_id][selected.similarity_threshold]["largest_cluster_ratio"])
                    for sample in sample_list if sample.label == "block"
                ) - selected.maximum_largest_cluster_ratio,
                4,
            ),
            "pass_ratio_margin_from_selected_threshold": round(
                selected.maximum_largest_cluster_ratio - max(
                    float(profile_summaries[sample.sample_id][selected.similarity_threshold]["largest_cluster_ratio"])
                    for sample in sample_list if sample.label == "pass"
                ),
                4,
            ),
        },
        "full_corpus_evaluation": full_evaluation,
        "leave_one_out": {
            "fold_count": len(sample_list),
            "correct_count": correct_folds,
            "accuracy": round(correct_folds / len(sample_list), 4),
            "predictions": leave_one_out_predictions,
        },
        "samples": selected_rows,
        "stage_1_pixel_gate_ready": full_evaluation["accuracy"] == 1.0 and correct_folds == len(sample_list),
        "stage_2_provenance_gate_still_required": True,
        "raw_paths_in_report": False,
        "external_api_called": False,
        "upload_attempted": False,
    }


def _select_config(
    samples: list[PreparedCalibrationSample],
    configs: list[VisualGateConfig],
    summaries: dict[str, dict[float, dict[str, object]]],
) -> VisualGateConfig:
    return max(
        configs,
        key=lambda config: _selection_key(
            config,
            _evaluate_config(samples, config, summaries),
        ),
    )


def _selection_key(config: VisualGateConfig, evaluation: dict[str, object]) -> tuple[float, ...]:
    baseline_distance = (
        abs(config.similarity_threshold - BASELINE_CONFIG[0]) +
        abs(config.maximum_largest_cluster_ratio - BASELINE_CONFIG[1]) +
        abs(config.minimum_perceptual_cluster_count - BASELINE_CONFIG[2])
    )
    return (
        float(evaluation["safety_weighted_score"]),
        float(evaluation["balanced_accuracy"]),
        -float(evaluation["unsafe_false_pass_count"]),
        -float(evaluation["false_block_count"]),
        -baseline_distance,
    )


def _evaluate_config(
    samples: list[PreparedCalibrationSample],
    config: VisualGateConfig,
    summaries: dict[str, dict[float, dict[str, object]]],
) -> dict[str, object]:
    pass_samples = [sample for sample in samples if sample.label == "pass"]
    block_samples = [sample for sample in samples if sample.label == "block"]
    true_pass = sum(
        _predict(summaries[sample.sample_id][config.similarity_threshold], config)
        for sample in pass_samples
    )
    true_block = sum(
        not _predict(summaries[sample.sample_id][config.similarity_threshold], config)
        for sample in block_samples
    )
    false_block = len(pass_samples) - true_pass
    unsafe_false_pass = len(block_samples) - true_block
    pass_recall = true_pass / len(pass_samples) if pass_samples else 0.0
    block_recall = true_block / len(block_samples) if block_samples else 0.0
    accuracy = (true_pass + true_block) / len(samples) if samples else 0.0
    return {
        "accuracy": round(accuracy, 4),
        "balanced_accuracy": round((pass_recall + block_recall) / 2, 4),
        "pass_recall": round(pass_recall, 4),
        "block_recall": round(block_recall, 4),
        "safety_weighted_score": round((pass_recall * 0.35) + (block_recall * 0.65), 4),
        "true_pass_count": true_pass,
        "true_block_count": true_block,
        "false_block_count": false_block,
        "unsafe_false_pass_count": unsafe_false_pass,
    }


def _predict(summary: dict[str, object], config: VisualGateConfig) -> bool:
    return bool(
        int(summary["perceptual_cluster_count"]) >= config.minimum_perceptual_cluster_count and
        float(summary["largest_cluster_ratio"]) <= config.maximum_largest_cluster_ratio
    )


def _config_dict(config: VisualGateConfig) -> dict[str, object]:
    return {
        "similarity_threshold": config.similarity_threshold,
        "maximum_largest_cluster_ratio": config.maximum_largest_cluster_ratio,
        "minimum_perceptual_cluster_count": config.minimum_perceptual_cluster_count,
    }


def _range(values: Iterable[float]) -> list[float]:
    value_list = list(values)
    return [min(value_list), max(value_list)] if value_list else []
