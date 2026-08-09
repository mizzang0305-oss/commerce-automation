#!/usr/bin/env python3
"""Build reviewed local-only motion clips and V3 usage packs. Never uploads or renders final product video."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import shutil
import subprocess
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


CATEGORY_RULES = {
    "desk": (["생활", "문구", "가전", "디지털", "컴퓨터", "가구"], ["식품", "건강기능"]),
    "laundry": (["생활", "홈", "가구", "스포츠", "캠핑"], ["식품", "건강기능"]),
}
ROLE_BY_INDEX = ("problem", "usage", "hand_interaction", "after")


def run(command: list[str], *, capture: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        check=True,
        capture_output=capture,
        text=True,
        encoding="utf-8",
        errors="replace",
    )


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ffprobe(path: Path) -> dict[str, Any]:
    completed = run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=codec_name,width,height,r_frame_rate,avg_frame_rate",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            str(path),
        ],
        capture=True,
    )
    payload = json.loads(completed.stdout)
    stream = payload.get("streams", [{}])[0]
    duration = float(payload.get("format", {}).get("duration", 0))
    return {
        "durationSeconds": round(duration, 3),
        "codec": stream.get("codec_name", ""),
        "width": int(stream.get("width", 0)),
        "height": int(stream.get("height", 0)),
        "fps": stream.get("avg_frame_rate") or stream.get("r_frame_rate") or "",
        "videoStreamPresent": bool(stream),
    }


def decode_pass(path: Path) -> bool:
    completed = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-map", "0:v:0", "-f", "null", "NUL"],
        capture_output=True,
    )
    return completed.returncode == 0


def detect_scene_boundaries(path: Path, threshold: float) -> list[float]:
    completed = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-i",
            str(path),
            "-vf",
            f"select='gt(scene,{threshold})',showinfo",
            "-an",
            "-f",
            "null",
            "NUL",
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return sorted({round(float(value), 3) for value in re.findall(r"pts_time:([0-9.]+)", completed.stderr)})


def extract_frame(video: Path, timestamp: float, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-ss",
            f"{timestamp:.3f}",
            "-i",
            str(video),
            "-frames:v",
            "1",
            "-q:v",
            "3",
            str(output),
        ]
    )


def make_sheet(items: list[tuple[Path, str]], output: Path, title: str, columns: int = 4) -> None:
    if not items:
        return
    width, height = 360, 640
    label_height = 58
    rows = math.ceil(len(items) / columns)
    canvas = Image.new("RGB", (columns * width, 54 + rows * (height + label_height)), "white")
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()
    draw.text((12, 18), title, fill="black", font=font)
    for index, (path, label) in enumerate(items):
        image = Image.open(path).convert("RGB")
        image.thumbnail((width, height), Image.Resampling.LANCZOS)
        x = (index % columns) * width + (width - image.width) // 2
        y = 54 + (index // columns) * (height + label_height)
        canvas.paste(image, (x, y))
        draw.text(((index % columns) * width + 8, y + height + 8), label[:52], fill="black", font=font)
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, quality=88)


def dhash(path: Path) -> str:
    image = Image.open(path).convert("L").resize((9, 8), Image.Resampling.LANCZOS)
    pixels = np.asarray(image, dtype=np.int16)
    bits = pixels[:, 1:] > pixels[:, :-1]
    value = 0
    for bit in bits.flatten():
        value = (value << 1) | int(bit)
    return f"{value:016x}"


def hamming(left: str, right: str) -> int:
    return (int(left, 16) ^ int(right, 16)).bit_count()


def temporal_distance(left: list[str], right: list[str]) -> float:
    pairs = list(zip(left, right))
    return sum(hamming(first, second) for first, second in pairs) / max(1, len(pairs))


def standardized_clip(source: Path, output: Path, start: float, duration: float, fps: int) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-ss",
            f"{start:.3f}",
            "-i",
            str(source),
            "-t",
            f"{duration:.3f}",
            "-map",
            "0:v:0",
            "-an",
            "-vf",
            f"fps={fps},scale='min(1080,iw)':-2:flags=lanczos",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(output),
        ]
    )


def sampled_frames(clip: Path, output_dir: Path) -> list[Path]:
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(clip),
            "-vf",
            "fps=5",
            "-q:v",
            "3",
            str(output_dir / "frame-%03d.jpg"),
        ]
    )
    return sorted(output_dir.glob("frame-*.jpg"))


def motion_qa(clip: Path, frame_dir: Path, config: dict[str, Any]) -> dict[str, Any]:
    probe = ffprobe(clip)
    frames = sampled_frames(clip, frame_dir)
    if len(frames) < 3:
        return {"status": "fail", "blockCodes": ["USAGE_CLIP_DECODE_FAILED"], "frames": frames}
    arrays = [
        np.asarray(Image.open(path).convert("L").resize((160, 90), Image.Resampling.BILINEAR), dtype=np.float32)
        for path in frames
    ]
    changes = [float(np.mean(np.abs(second - first)) / 255.0) for first, second in zip(arrays, arrays[1:])]
    freeze_flags = [value < 0.001 for value in changes]
    longest = 0
    current = 0
    for frozen in freeze_flags:
        current = current + 1 if frozen else 0
        longest = max(longest, current)
    black_ratios = [float(np.mean(array < 10)) for array in arrays]
    edge_scores = [
        float(np.var(np.asarray(Image.open(path).convert("L").resize((320, 180)).filter(ImageFilter.FIND_EDGES))))
        for path in frames
    ]
    freeze_ratio = sum(freeze_flags) / max(1, len(freeze_flags))
    visual_change = sum(changes) / max(1, len(changes))
    black_ratio = sum(black_ratios) / len(black_ratios)
    motion_present = visual_change >= float(config["minimumVisualChangeRatio"]) and freeze_ratio <= float(config["maximumFreezeRatio"])
    block_codes: list[str] = []
    if not decode_pass(clip):
        block_codes.append("USAGE_CLIP_DECODE_FAILED")
    if probe["durationSeconds"] < float(config["minimumDurationSeconds"]):
        block_codes.append("USAGE_CLIP_TOO_SHORT")
    if freeze_ratio > float(config["maximumFreezeRatio"]):
        block_codes.append("USAGE_CLIP_FREEZE_HIGH")
    if black_ratio > float(config["maximumBlackFrameRatio"]):
        block_codes.append("USAGE_CLIP_BLACK_FRAME")
    if not motion_present:
        block_codes.append("USAGE_CLIP_NO_MOTION")
    return {
        "status": "pass" if not block_codes else "fail",
        "blockCodes": block_codes,
        "durationSeconds": probe["durationSeconds"],
        "freezeRatio": round(freeze_ratio, 5),
        "longestFreezeSeconds": round(longest / 5.0, 3),
        "visualChangeRatio": round(visual_change, 6),
        "blackFrameRatio": round(black_ratio, 6),
        "blurScore": round(sum(edge_scores) / len(edge_scores), 3),
        "frameFill": 1.0,
        "motionPresent": motion_present,
        "decodePassed": "USAGE_CLIP_DECODE_FAILED" not in block_codes,
        "textContaminationIndicator": "review_required",
        "frames": frames,
        "frameHashes": [dhash(path) for path in frames],
    }


def clip_windows(
    duration: float,
    boundaries: list[float],
    clip_duration: float,
    clips_per_source: int,
) -> list[tuple[float, float, str]]:
    if clips_per_source < 3 or clips_per_source > len(ROLE_BY_INDEX):
        raise ValueError("USAGE_CLIP_COUNT_NOT_SUPPORTED")
    points = [0.0, *[value for value in boundaries if 0 < value < duration], duration]
    segments = [(points[index], points[index + 1]) for index in range(len(points) - 1)]
    windows: list[tuple[float, float, str]] = []
    ratios = (0.2, 0.5, 0.8) if clips_per_source == 3 else (0.15, 0.4, 0.65, 0.85)
    for target_ratio in ratios:
        target = duration * target_ratio
        segment = next((value for value in segments if value[0] <= target <= value[1]), None)
        operation = "ffmpeg_scene_detected_h264_motion_clip"
        if segment is None or segment[1] - segment[0] < 1.0:
            start = max(0.0, min(duration - clip_duration, target - clip_duration / 2))
            operation = "ffmpeg_scene_detection_fallback_h264_motion_clip"
        else:
            available = min(clip_duration, segment[1] - segment[0])
            start = max(segment[0], min(segment[1] - available, target - available / 2))
            clip_duration_for_window = available
            windows.append((round(start, 3), round(start + clip_duration_for_window, 3), operation))
            continue
        windows.append((round(start, 3), round(min(duration, start + clip_duration), 3), operation))
    return windows


def load_json(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def review_pass(record: dict[str, Any]) -> bool:
    return record.get("status") == "pass" and len(record.get("notes", [])) >= 2


def choose_assets(values: list[dict[str, Any]], count: int, offset: int) -> list[dict[str, Any]]:
    if len(values) < count:
        return []
    ordered = sorted(values, key=lambda item: (item["sourceId"], item["assetId"]))
    return [ordered[(offset + index) % len(ordered)] for index in range(count)]


def append_unique_assets(target: list[dict[str, Any]], candidates: list[dict[str, Any]], count: int) -> None:
    selected_ids = {item["assetId"] for item in target}
    for candidate in candidates:
        if candidate["assetId"] in selected_ids:
            continue
        target.append(candidate)
        selected_ids.add(candidate["assetId"])
        if len(target) >= count:
            return


def build_packs(
    assets: list[dict[str, Any]],
    target_counts: dict[str, int],
    output_root: Path,
    primary_limit: int,
) -> list[dict[str, Any]]:
    packs: list[dict[str, Any]] = []
    primary_counts: Counter[str] = Counter()
    for use_case, pack_count in target_counts.items():
        compatible = [asset for asset in assets if use_case in asset["useCases"]]
        problem = [asset for asset in compatible if any(role in asset["sceneRoles"] for role in ("problem", "before"))]
        usage = [asset for asset in compatible if any(role in asset["sceneRoles"] for role in ("usage", "hand_interaction", "organization", "storage", "folding"))]
        after = [asset for asset in compatible if "after" in asset["sceneRoles"]]
        if len(problem) < 2 or len(usage) < 3 or len(after) < 2:
            continue
        for index in range(pack_count):
            primary_candidates = sorted(compatible, key=lambda item: (primary_counts[item["sourceId"]], item["sourceId"], item["assetId"]))
            primary = next((item for item in primary_candidates if primary_counts[item["sourceId"]] < primary_limit), None)
            if primary is None:
                break
            problem_assets = [primary, *[item for item in choose_assets(problem, len(problem), index + 1) if item["assetId"] != primary["assetId"]][:1]]
            if not any(role in primary["sceneRoles"] for role in ("problem", "before")):
                problem_assets = choose_assets(problem, 2, index)
            usage_assets = choose_assets(usage, 3, index * 2)
            after_assets = choose_assets(after, 2, index * 2 + 1)
            selected: list[dict[str, Any]] = []
            append_unique_assets(selected, [*problem_assets, *usage_assets, *after_assets], 7)
            rotated_compatible = choose_assets(compatible, len(compatible), index * 3)
            append_unique_assets(selected, rotated_compatible, 7)
            if len(selected) < 7:
                continue
            selected_by_id = {item["assetId"]: item for item in selected}
            source_ids = {item["sourceId"] for item in selected}
            if len(source_ids) < 2:
                continue
            primary_counts[primary["sourceId"]] += 1
            pack_id = f"{use_case}-v3-pack-{index + 1:02d}"
            sequence = hashlib.sha256(f"{use_case}:{index + 1}:{':'.join(selected_by_id)}".encode("utf-8")).hexdigest()[:24]
            pack = {
                "packId": pack_id,
                "useCase": use_case,
                "subUseCase": use_case,
                "assetIds": list(selected_by_id),
                "problemAssetIds": [item["assetId"] for item in problem_assets],
                "usageAssetIds": [item["assetId"] for item in usage_assets],
                "actionAssetIds": [item["assetId"] for item in usage_assets],
                "afterAssetIds": [item["assetId"] for item in after_assets],
                "categoryAllowlist": selected[0]["categoryAllowlist"],
                "categoryBlocklist": selected[0]["categoryBlocklist"],
                "dailyReuseLimit": 5,
                "consecutiveReuseLimit": 2,
                "sequenceFingerprint": sequence,
                "noUploadAutomationEligible": True,
                "publishEligible": False,
                "packGeneration": "v3_motion",
                "trustTier": "HUMAN_REVIEWED_SOURCE_DERIVED" if all(item["trustTier"] == "HUMAN_REVIEWED_SOURCE_DERIVED" for item in selected) else "CODEX_REVIEWED_LOCAL_ONLY",
                "primarySourceId": primary["sourceId"],
            }
            packs.append(pack)
            sheet_items = []
            for asset in selected:
                frame_path = Path(asset["reviewMiddleFrame"])
                role = ",".join(asset["sceneRoles"])
                sheet_items.append((frame_path, f"{role} | {asset['sourceId']}"))
            make_sheet(sheet_items, output_root / "packs" / pack_id / "contact-sheet.jpg", pack_id, columns=4)
            (output_root / "packs" / pack_id / "manifest.json").write_text(json.dumps(pack, ensure_ascii=False, indent=2), encoding="utf-8")
    return packs


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--asset-root", required=True)
    parser.add_argument("--existing-registry", required=True)
    parser.add_argument("--plan", required=True)
    parser.add_argument("--output-root", required=True)
    args = parser.parse_args()

    started = time.perf_counter()
    asset_root = Path(args.asset_root).resolve()
    existing_registry = load_json(Path(args.existing_registry).resolve())
    plan = load_json(Path(args.plan).resolve())
    output_root = Path(args.output_root).resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    extraction = plan["extraction"]
    review = load_json(output_root / "reviews" / "codex-review.json")
    reviewed_at = review.get("reviewedAt", "")

    source_records: list[dict[str, Any]] = []
    clip_candidates: list[dict[str, Any]] = []
    existing_fingerprints = [asset["visualFingerprint"] for asset in existing_registry.get("assets", [])]
    accepted_visual_fingerprints = list(existing_fingerprints)
    accepted_temporal_hashes: list[list[str]] = []
    duplicates_removed = 0
    machine_failures = 0
    extraction_started = time.perf_counter()

    for source in plan["sanitizedVideoPools"]:
        source_path = asset_root / source["relativePath"]
        evidence_path = asset_root / source["reviewEvidenceRelativeReference"]
        source_record: dict[str, Any] = {
            "sourceId": source["sourceId"],
            "poolId": source["poolId"],
            "sourceType": "sanitized_local_video",
            "group": source["group"],
            "relativeReference": source["relativePath"],
            "reviewEvidenceRelativeReference": source["reviewEvidenceRelativeReference"],
            "sourceHumanReviewStatus": source["sourceHumanReviewStatus"],
            "rightsBasis": source["rightsBasis"],
            "privacyReviewRequired": source["privacyReviewRequired"],
            "allowedUseCases": source["allowedUseCases"],
            "assetRootStored": False,
            "existingAssetCount": sum(1 for asset in existing_registry.get("assets", []) if asset.get("sourceRelativeReference") == source["relativePath"]),
            "existingPackCount": sum(1 for pack in existing_registry.get("packs", []) if any(asset.get("sourceRelativeReference") == source["relativePath"] for asset in existing_registry.get("assets", []) if asset.get("assetId") in pack.get("assetIds", []))),
        }
        if not source_path.is_file() or not evidence_path.is_file():
            source_record.update({"eligibleForReview": False, "blockCodes": ["USAGE_SOURCE_INVENTORY_EMPTY"]})
            source_records.append(source_record)
            continue
        probe = ffprobe(source_path)
        boundaries = detect_scene_boundaries(source_path, float(extraction["sceneThreshold"]))
        decoded = decode_pass(source_path)
        source_hash = sha256(source_path)
        source_frames_dir = output_root / "sources" / source["sourceId"] / "frames"
        source_frame_items: list[tuple[Path, str]] = []
        for frame_index in range(12):
            timestamp = probe["durationSeconds"] * (frame_index + 0.5) / 12
            frame_path = source_frames_dir / f"frame-{frame_index + 1:02d}.jpg"
            extract_frame(source_path, timestamp, frame_path)
            source_frame_items.append((frame_path, f"{timestamp:.2f}s"))
        source_sheet = output_root / "sources" / source["sourceId"] / "source-contact-sheet.jpg"
        make_sheet(source_frame_items, source_sheet, source["sourceId"], columns=4)
        source_record.update(
            {
                **probe,
                "sourceSha256": source_hash,
                "decodePassed": decoded,
                "sceneBoundaryCount": len(boundaries),
                "sceneBoundaries": boundaries,
                "sourceContactSheet": source_sheet.relative_to(output_root).as_posix(),
                "eligibleForReview": probe["videoStreamPresent"] and probe["durationSeconds"] >= 2 and decoded,
                "blockCodes": [] if probe["videoStreamPresent"] and probe["durationSeconds"] >= 2 and decoded else ["USAGE_CLIP_DECODE_FAILED"],
            }
        )
        source_records.append(source_record)
        if not source_record["eligibleForReview"]:
            continue

        planned_windows = [
            (*window, ROLE_BY_INDEX[index])
            for index, window in enumerate(clip_windows(
                probe["durationSeconds"],
                boundaries,
                float(extraction["clipDurationSeconds"]),
                int(extraction["clipsPerSource"]),
            ))
        ]
        for supplemental in extraction.get("supplementalSceneWindows", []):
            if supplemental.get("sourceId") != source["sourceId"]:
                continue
            supplemental_start = float(supplemental["startSeconds"])
            supplemental_duration = float(supplemental["durationSeconds"])
            if not any(abs(supplemental_start - boundary) <= 0.01 for boundary in boundaries):
                raise ValueError("USAGE_SUPPLEMENTAL_WINDOW_NOT_SCENE_BOUNDARY")
            planned_windows.append(
                (
                    round(supplemental_start, 3),
                    round(min(probe["durationSeconds"], supplemental_start + supplemental_duration), 3),
                    "ffmpeg_scene_boundary_supplemental_h264_motion_clip",
                    str(supplemental["role"]),
                )
            )

        for clip_start, clip_end, operation, role in planned_windows:
            clip_id = f"{source['sourceId']}-{role}"
            clip_path = output_root / "clips" / source["sourceId"] / f"{role}.mp4"
            standardized_clip(source_path, clip_path, clip_start, clip_end - clip_start, int(extraction["targetFps"]))
            qa = motion_qa(clip_path, output_root / "clips" / source["sourceId"] / f"{role}-qa", extraction)
            frames = qa.pop("frames")
            temporal_hashes = qa.pop("frameHashes", [])
            if not frames:
                machine_failures += 1
                continue
            first_frame, middle_frame, last_frame = frames[0], frames[len(frames) // 2], frames[-1]
            visual_fingerprint = dhash(middle_frame)
            temporal_fingerprint = hashlib.sha256(":".join(temporal_hashes).encode("utf-8")).hexdigest()
            near_static = any(hamming(visual_fingerprint, value) <= int(existing_registry.get("nearDuplicateHammingThreshold", 6)) for value in accepted_visual_fingerprints)
            near_temporal = any(temporal_distance(temporal_hashes, value) <= float(extraction["temporalDuplicateAverageHamming"]) for value in accepted_temporal_hashes)
            if near_static or near_temporal:
                qa["status"] = "fail"
                qa["blockCodes"] = list(dict.fromkeys([*qa.get("blockCodes", []), "USAGE_CLIP_NEAR_DUPLICATE"]))
                duplicates_removed += 1
            elif qa["status"] == "pass":
                accepted_visual_fingerprints.append(visual_fingerprint)
                accepted_temporal_hashes.append(temporal_hashes)
            else:
                machine_failures += 1
            motion_sheet = output_root / "clips" / source["sourceId"] / f"{role}-motion-strip.jpg"
            make_sheet([(path, f"frame {index + 1}") for index, path in enumerate(frames)], motion_sheet, clip_id, columns=4)
            derived_hash = sha256(clip_path)
            asset_id = f"uev3-{source['group']}-{derived_hash[:16]}"
            clip_candidates.append(
                {
                    "clipId": clip_id,
                    "assetId": asset_id,
                    "sourceId": source["sourceId"],
                    "poolId": source["poolId"],
                    "group": source["group"],
                    "sourceRelativeReference": source["relativePath"],
                    "sourceSha256": source_hash,
                    "sourceHumanReviewStatus": source["sourceHumanReviewStatus"],
                    "trustTier": "HUMAN_REVIEWED_SOURCE_DERIVED" if source["sourceHumanReviewStatus"] == "pass" else "CODEX_REVIEWED_LOCAL_ONLY",
                    "rightsBasis": source["rightsBasis"],
                    "allowedUseCases": source["allowedUseCases"],
                    "machineSuggestedRole": role,
                    "clipStartSeconds": clip_start,
                    "clipEndSeconds": clip_end,
                    "derivationOperation": operation,
                    "derivedSha256": derived_hash,
                    "visualFingerprint": visual_fingerprint,
                    "temporalFingerprint": temporal_fingerprint,
                    "motionQa": qa,
                    "clipRelativeReference": clip_path.relative_to(output_root).as_posix(),
                    "firstFrame": first_frame.relative_to(output_root).as_posix(),
                    "middleFrame": middle_frame.relative_to(output_root).as_posix(),
                    "lastFrame": last_frame.relative_to(output_root).as_posix(),
                    "motionStrip": motion_sheet.relative_to(output_root).as_posix(),
                }
            )

    for source_record in source_records:
        source_clips = [item for item in clip_candidates if item["sourceId"] == source_record["sourceId"]]
        source_record["machineRoleCoverage"] = sorted(
            {
                item["machineSuggestedRole"]
                for item in source_clips
                if item["motionQa"]["status"] == "pass"
            }
        )
        source_record["machineQaPassingClipCount"] = sum(
            1 for item in source_clips if item["motionQa"]["status"] == "pass"
        )
        source_record["currentSourceDailyPressure"] = 0
        used_ranges = sorted(
            (float(item["clipStartSeconds"]), float(item["clipEndSeconds"]))
            for item in source_clips
            if item["motionQa"]["status"] == "pass"
        )
        cursor = 0.0
        unused_ranges: list[dict[str, float]] = []
        for start, end in used_ranges:
            if start - cursor >= 1.0:
                unused_ranges.append({"startSeconds": round(cursor, 3), "endSeconds": round(start, 3)})
            cursor = max(cursor, end)
        duration = float(source_record.get("durationSeconds", 0))
        if duration - cursor >= 1.0:
            unused_ranges.append({"startSeconds": round(cursor, 3), "endSeconds": round(duration, 3)})
        source_record["unusedTimeRanges"] = unused_ranges

    source_opportunity = {
        "schemaVersion": "usage-evidence-source-opportunity-v3",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "assetRootStored": False,
        "existingRegistryValidSources": existing_registry.get("sourceInventory", {}).get("validSources", 0),
        "configuredCandidateSourcesScanned": len(source_records),
        "validSourcesScanned": sum(1 for item in source_records if item.get("eligibleForReview")),
        "unusedSourceVideos": sum(1 for item in source_records if item.get("existingAssetCount") == 0),
        "frameOnlySources": sum(1 for item in source_records if item.get("existingAssetCount", 0) > 0),
        "clipCapableSources": sum(1 for item in source_records if item.get("eligibleForReview")),
        "privacyBlocked": 0,
        "rightsBlocked": 0,
        "sources": source_records,
    }
    (output_root / "analysis").mkdir(parents=True, exist_ok=True)
    (output_root / "analysis" / "source-opportunity-report.json").write_text(json.dumps(source_opportunity, ensure_ascii=False, indent=2), encoding="utf-8")
    (output_root / "reviews").mkdir(parents=True, exist_ok=True)
    (output_root / "reviews" / "review-candidates.json").write_text(json.dumps({"sources": source_records, "clips": clip_candidates}, ensure_ascii=False, indent=2), encoding="utf-8")

    reviewed_sources = {source_id for source_id, value in review.get("sources", {}).items() if review_pass(value)}
    reviewed_assets: list[dict[str, Any]] = []
    for candidate in clip_candidates:
        clip_review = review.get("clips", {}).get(candidate["assetId"], {})
        if candidate["sourceId"] not in reviewed_sources or not review_pass(clip_review) or candidate["motionQa"]["status"] != "pass":
            continue
        roles = clip_review.get("sceneRoles", [candidate["machineSuggestedRole"]])
        allowlist, blocklist = CATEGORY_RULES[candidate["group"]]
        reviewed_assets.append(
            {
                "assetId": candidate["assetId"],
                "sourceId": candidate["sourceId"],
                "sourceKind": "derived_clip",
                "sourceRelativeReference": candidate["sourceRelativeReference"],
                "sourceSha256": candidate["sourceSha256"],
                "derivedSha256": candidate["derivedSha256"],
                "derivationOperation": candidate["derivationOperation"],
                "clipStartSeconds": candidate["clipStartSeconds"],
                "clipEndSeconds": candidate["clipEndSeconds"],
                "useCases": candidate["allowedUseCases"],
                "sceneRoles": roles,
                "categoryAllowlist": allowlist,
                "categoryBlocklist": blocklist,
                "identityType": "generic_usage_example",
                "trustTier": candidate["trustTier"],
                "sourceHumanReviewStatus": candidate["sourceHumanReviewStatus"],
                "derivedMachineQaStatus": "pass",
                "derivedCodexVisualReviewStatus": "pass",
                "humanOwnerReviewStatus": "not_requested",
                "noUploadAutomationEligible": True,
                "publishEligible": False,
                "visualFingerprint": candidate["visualFingerprint"],
                "temporalFingerprint": candidate["temporalFingerprint"],
                "motionQa": {key: value for key, value in candidate["motionQa"].items() if key not in ("status", "blockCodes")},
                "sourceFingerprint": candidate["sourceSha256"][:16],
                "dailyReuseLimit": 5,
                "consecutiveReuseLimit": 2,
                "createdAt": review.get("createdAt", reviewed_at),
                "reviewedAt": reviewed_at,
                "safeReviewNotes": clip_review["notes"],
                "blockCodes": [],
                "reviewMiddleFrame": str(output_root / candidate["middleFrame"]),
            }
        )

    new_packs = build_packs(reviewed_assets, plan["targetPackCounts"], output_root, int(plan["sourceLimits"]["maxPrimaryPacksPerSource"]))
    final_assets = [{key: value for key, value in asset.items() if key != "reviewMiddleFrame"} for asset in reviewed_assets]
    review_complete = len(reviewed_sources) >= int(plan["sourceLimits"]["minimumDistinctNewSourceIds"])
    required_clips = int(plan["sourceLimits"]["minimumNewDerivedMotionClips"])
    review_complete = review_complete and len(final_assets) >= required_clips and len(new_packs) >= sum(plan["targetPackCounts"].values())
    registry = None
    if review_complete:
        registry = {
            **existing_registry,
            "generatedAt": reviewed_at,
            "visualReviewExecuted": True,
            "assets": [*existing_registry["assets"], *final_assets],
            "packs": [*existing_registry["packs"], *new_packs],
            "sourceInventory": {
                **existing_registry["sourceInventory"],
                "validSources": existing_registry["sourceInventory"]["validSources"] + len(reviewed_sources),
                "humanReviewedSources": existing_registry["sourceInventory"]["humanReviewedSources"] + sum(1 for item in source_records if item["sourceId"] in reviewed_sources and item["sourceHumanReviewStatus"] == "pass"),
                "sanitizedLocalSources": existing_registry["sourceInventory"]["sanitizedLocalSources"] + sum(1 for item in source_records if item["sourceId"] in reviewed_sources and item["sourceHumanReviewStatus"] == "not_available"),
                "nearDuplicatesRemoved": existing_registry["sourceInventory"]["nearDuplicatesRemoved"] + duplicates_removed,
            },
        }
        (output_root / "registry.json").write_text(json.dumps(registry, ensure_ascii=False, indent=2), encoding="utf-8")

    performance = {
        "sourceScanAndExtractionSeconds": round(time.perf_counter() - extraction_started, 3),
        "totalSeconds": round(time.perf_counter() - started, 3),
    }
    build_report = {
        "schemaVersion": "usage-evidence-source-pack-build-v3",
        "reviewComplete": review_complete,
        "sourceSheetsGenerated": len(source_records),
        "clipCandidates": len(clip_candidates),
        "machineQaPassed": sum(1 for item in clip_candidates if item["motionQa"]["status"] == "pass"),
        "machineQaFailed": machine_failures,
        "nearDuplicatesRemoved": duplicates_removed,
        "reviewedSourceIds": len(reviewed_sources),
        "codexReviewedClips": len(final_assets),
        "newPacks": len(new_packs),
        "newCapacityUnits": sum(pack["dailyReuseLimit"] for pack in new_packs),
        "performance": performance,
        "writes": {
            "GOOGLE_SHEETS_WRITE": 0,
            "GOOGLE_DRIVE_WRITE": 0,
            "R2_WRITE": 0,
            "DB_WRITE": 0,
            "FINAL_VIDEO_RENDER": 0,
            "TTS": 0,
            "ASR": 0,
            "WHISPERX": 0,
            "PLATFORM_UPLOAD": 0,
            "PRODUCTION_DEPLOY": 0,
        },
    }
    (output_root / "analysis" / "build-report.json").write_text(json.dumps(build_report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(build_report, ensure_ascii=False))
    return 0 if review_complete else 2


if __name__ == "__main__":
    raise SystemExit(main())
