from __future__ import annotations

from dataclasses import dataclass
import hashlib
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageFilter


MIN_SCENE_COUNT = 5
MIN_PERCEPTUAL_CLUSTER_COUNT = 3
MIN_VERIFIED_USAGE_SCENE_COUNT = 2
MIN_USAGE_LABEL_COUNT = 2
MAX_LARGEST_CLUSTER_RATIO = 0.5
MAX_EXACT_PRODUCT_SCENE_RATIO = 0.5
PERCEPTUAL_SIMILARITY_THRESHOLD = 0.88
HASH_WIDTH = 16
HASH_HEIGHT = 16

VERIFIED_USAGE_PROVENANCE = {
    "stock_real_usage",
    "owner_supplied_real_usage",
    "reviewed_generated_real_usage",
}
EXACT_PRODUCT_PROVENANCE = {"exact_product_image"}
ALLOWED_PROVENANCE = VERIFIED_USAGE_PROVENANCE | EXACT_PRODUCT_PROVENANCE


@dataclass(frozen=True)
class SceneVisualEvidence:
    scene_id: str
    image_path: Path
    provenance: str
    usage_label_present: bool = False


@dataclass(frozen=True)
class SceneSimilarityProfile:
    perceptual_hashes: tuple[int, ...]
    exact_file_hash_count: int
    dimensions: tuple[tuple[int, int], ...]


def build_scene_similarity_profile(image_paths: Iterable[Path]) -> SceneSimilarityProfile:
    perceptual_hashes: list[int] = []
    exact_hashes: list[str] = []
    dimensions: list[tuple[int, int]] = []
    for image_path in image_paths:
        with Image.open(image_path) as image:
            image.load()
            dimensions.append(image.size)
        perceptual_hashes.append(_central_edge_difference_hash(image_path))
        exact_hashes.append(hashlib.sha256(image_path.read_bytes()).hexdigest())
    return SceneSimilarityProfile(
        perceptual_hashes=tuple(perceptual_hashes),
        exact_file_hash_count=len(set(exact_hashes)),
        dimensions=tuple(dimensions),
    )


def summarize_scene_similarity_profile(
    profile: SceneSimilarityProfile,
    similarity_threshold: float = PERCEPTUAL_SIMILARITY_THRESHOLD,
) -> dict[str, object]:
    hashes = list(profile.perceptual_hashes)
    clusters = _build_similarity_clusters(hashes, similarity_threshold)
    cluster_sizes = sorted((len(cluster) for cluster in clusters), reverse=True)
    largest_cluster_scene_count = cluster_sizes[0] if cluster_sizes else 0
    pair_similarities = _pair_similarities(hashes)
    scene_count = len(hashes)
    return {
        "scene_count": scene_count,
        "exact_file_hash_count": profile.exact_file_hash_count,
        "perceptual_cluster_count": len(clusters),
        "perceptual_cluster_sizes": cluster_sizes,
        "largest_cluster_scene_count": largest_cluster_scene_count,
        "largest_cluster_ratio": _ratio(largest_cluster_scene_count, scene_count),
        "average_pair_similarity": _average(pair_similarities),
        "maximum_pair_similarity": max(pair_similarities, default=0.0),
        "dimensions_consistent": len(set(profile.dimensions)) <= 1,
        "portrait_scene_count": sum(width < height for width, height in profile.dimensions),
        "similarity_threshold": similarity_threshold,
    }


def evaluate_pre_render_visual_evidence(
    scenes: Iterable[SceneVisualEvidence],
) -> dict[str, object]:
    scene_list = list(scenes)
    blockers: list[str] = []
    readable_scenes: list[SceneVisualEvidence] = []
    perceptual_hashes: list[int] = []
    exact_hashes: list[str] = []
    dimensions: list[tuple[int, int]] = []

    for scene in scene_list:
        try:
            with Image.open(scene.image_path) as image:
                image.load()
                dimensions.append(image.size)
            perceptual_hashes.append(_central_edge_difference_hash(scene.image_path))
            exact_hashes.append(hashlib.sha256(scene.image_path.read_bytes()).hexdigest())
            readable_scenes.append(scene)
        except (OSError, ValueError):
            blockers.append("SCENE_IMAGE_UNREADABLE")

    scene_count = len(scene_list)
    verified_usage_scene_count = sum(
        scene.provenance in VERIFIED_USAGE_PROVENANCE for scene in readable_scenes
    )
    usage_label_count = sum(
        scene.provenance in VERIFIED_USAGE_PROVENANCE and scene.usage_label_present
        for scene in readable_scenes
    )
    exact_product_scene_count = sum(
        scene.provenance in EXACT_PRODUCT_PROVENANCE for scene in readable_scenes
    )
    unverified_provenance_scene_count = sum(
        scene.provenance not in ALLOWED_PROVENANCE for scene in readable_scenes
    )
    exact_product_scene_ratio = _ratio(exact_product_scene_count, scene_count)
    dimensions_consistent = len(set(dimensions)) <= 1
    portrait_scene_count = sum(width < height for width, height in dimensions)

    similarity = summarize_scene_similarity_profile(
        SceneSimilarityProfile(
            perceptual_hashes=tuple(perceptual_hashes),
            exact_file_hash_count=len(set(exact_hashes)),
            dimensions=tuple(dimensions),
        )
    )
    cluster_sizes = similarity["perceptual_cluster_sizes"]
    largest_cluster_scene_count = similarity["largest_cluster_scene_count"]
    largest_cluster_ratio = similarity["largest_cluster_ratio"]

    if scene_count < MIN_SCENE_COUNT:
        blockers.append("SCENE_COUNT_BELOW_MINIMUM")
    if len(readable_scenes) != scene_count:
        blockers.append("SCENE_SET_INCOMPLETE")
    if not dimensions_consistent:
        blockers.append("SCENE_DIMENSIONS_INCONSISTENT")
    if portrait_scene_count != len(readable_scenes):
        blockers.append("NON_PORTRAIT_SCENE_PRESENT")
    if similarity["perceptual_cluster_count"] < MIN_PERCEPTUAL_CLUSTER_COUNT:
        blockers.append("VISUAL_CLUSTER_COUNT_BELOW_MINIMUM")
    if largest_cluster_ratio > MAX_LARGEST_CLUSTER_RATIO:
        blockers.append("REPEATED_VISUAL_CLUSTER")
    if verified_usage_scene_count < MIN_VERIFIED_USAGE_SCENE_COUNT:
        blockers.append("VERIFIED_USAGE_SCENE_COUNT_BELOW_MINIMUM")
    if usage_label_count < MIN_USAGE_LABEL_COUNT:
        blockers.append("USAGE_EXAMPLE_LABEL_COUNT_BELOW_MINIMUM")
    if exact_product_scene_count < 1:
        blockers.append("EXACT_PRODUCT_SCENE_MISSING")
    if exact_product_scene_ratio > MAX_EXACT_PRODUCT_SCENE_RATIO:
        blockers.append("EXACT_PRODUCT_SCENE_RATIO_TOO_HIGH")
    if unverified_provenance_scene_count > 0:
        blockers.append("UNVERIFIED_SCENE_PROVENANCE")

    unique_blockers = list(dict.fromkeys(blockers))
    return {
        "gate_version": "v135",
        "gate_pass": not unique_blockers,
        "blockers": unique_blockers,
        "scene_count": scene_count,
        "readable_scene_count": len(readable_scenes),
        "exact_file_hash_count": similarity["exact_file_hash_count"],
        "perceptual_cluster_count": similarity["perceptual_cluster_count"],
        "perceptual_cluster_sizes": cluster_sizes,
        "largest_cluster_scene_count": largest_cluster_scene_count,
        "largest_cluster_ratio": largest_cluster_ratio,
        "average_pair_similarity": similarity["average_pair_similarity"],
        "maximum_pair_similarity": similarity["maximum_pair_similarity"],
        "verified_usage_scene_count": verified_usage_scene_count,
        "usage_label_count": usage_label_count,
        "exact_product_scene_count": exact_product_scene_count,
        "exact_product_scene_ratio": exact_product_scene_ratio,
        "unverified_provenance_scene_count": unverified_provenance_scene_count,
        "dimensions_consistent": dimensions_consistent,
        "portrait_scene_count": portrait_scene_count,
        "thresholds": {
            "minimum_scene_count": MIN_SCENE_COUNT,
            "minimum_perceptual_cluster_count": MIN_PERCEPTUAL_CLUSTER_COUNT,
            "minimum_verified_usage_scene_count": MIN_VERIFIED_USAGE_SCENE_COUNT,
            "minimum_usage_label_count": MIN_USAGE_LABEL_COUNT,
            "maximum_largest_cluster_ratio": MAX_LARGEST_CLUSTER_RATIO,
            "maximum_exact_product_scene_ratio": MAX_EXACT_PRODUCT_SCENE_RATIO,
            "perceptual_similarity_threshold": PERCEPTUAL_SIMILARITY_THRESHOLD,
        },
        "scene_ids": [scene.scene_id for scene in scene_list],
        "raw_paths_in_report": False,
        "external_api_called": False,
        "upload_attempted": False,
    }


def _central_edge_difference_hash(image_path: Path) -> int:
    with Image.open(image_path) as source:
        image = source.convert("L")
        width, height = image.size
        crop_width = max(1, round(width * 0.7))
        crop_height = max(1, round(height * 0.7))
        left = (width - crop_width) // 2
        top = (height - crop_height) // 2
        image = image.crop((left, top, left + crop_width, top + crop_height))
        image = image.filter(ImageFilter.FIND_EDGES)
        image = image.resize((HASH_WIDTH + 1, HASH_HEIGHT), Image.Resampling.LANCZOS)
        pixels = list(image.get_flattened_data())

    result = 0
    for row in range(HASH_HEIGHT):
        offset = row * (HASH_WIDTH + 1)
        for column in range(HASH_WIDTH):
            result = (result << 1) | int(pixels[offset + column + 1] > pixels[offset + column])
    return result


def _build_similarity_clusters(
    hashes: list[int],
    similarity_threshold: float = PERCEPTUAL_SIMILARITY_THRESHOLD,
) -> list[list[int]]:
    clusters: list[list[int]] = []
    for index, image_hash in enumerate(hashes):
        matching_cluster = next(
            (
                cluster
                for cluster in clusters
                if all(
                    _hash_similarity(image_hash, hashes[member]) >= similarity_threshold
                    for member in cluster
                )
            ),
            None,
        )
        if matching_cluster is None:
            clusters.append([index])
        else:
            matching_cluster.append(index)
    return clusters


def _pair_similarities(hashes: list[int]) -> list[float]:
    return [
        _hash_similarity(hashes[left], hashes[right])
        for left in range(len(hashes))
        for right in range(left + 1, len(hashes))
    ]


def _hash_similarity(left: int, right: int) -> float:
    bit_count = HASH_WIDTH * HASH_HEIGHT
    return round(1 - ((left ^ right).bit_count() / bit_count), 4)


def _ratio(numerator: int, denominator: int) -> float:
    return round(numerator / denominator, 4) if denominator else 0.0


def _average(values: list[float]) -> float:
    return round(sum(values) / len(values), 4) if values else 0.0
