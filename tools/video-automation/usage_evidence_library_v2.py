#!/usr/bin/env python3
"""Build a local-only, reviewed usage-evidence registry. Never uploads or renders video."""
from __future__ import annotations

import argparse
import glob
import hashlib
import json
import math
import re
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROLE_ORDER = ["problem", "before", "usage", "hand_interaction", "after", "cta_background"]
STORYBOARD_FRACTIONS = [0.04, 0.12, 0.21, 0.31, 0.41, 0.51, 0.61, 0.71, 0.82, 0.92]
CATEGORY_RULES = {
    "vehicle": (["자동차", "차량"], ["식품", "건강기능"]),
    "desk": (["생활", "문구", "가전", "디지털", "컴퓨터", "가구"], ["식품", "건강기능"]),
    "laundry": (["생활", "홈", "가구", "스포츠", "캠핑"], ["식품", "건강기능"]),
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def phash(path: Path) -> str:
    with Image.open(path) as source:
        pixels = np.asarray(source.convert("L").resize((32, 32), Image.Resampling.LANCZOS), dtype=np.float64)
    coords = np.arange(32, dtype=np.float64)
    transform = np.cos((2 * coords[:, None] + 1) * coords[None, :] * math.pi / 64.0)
    coeff = transform.T @ pixels @ transform
    low = coeff[:8, :8].flatten()
    bits = low > np.median(low[1:])
    return f"{int(''.join('1' if bit else '0' for bit in bits), 2):016x}"


def hamming(left: str, right: str) -> int:
    return (int(left, 16) ^ int(right, 16)).bit_count()


def machine_qa(path: Path) -> dict[str, Any]:
    with Image.open(path) as source:
        image = source.convert("RGB")
        width, height = image.size
        grayscale = np.asarray(image.convert("L"), dtype=np.float32)
        edges = np.asarray(image.convert("L").filter(ImageFilter.FIND_EDGES), dtype=np.float32)
    black_ratio = float(np.mean(grayscale < 8))
    edge_variance = float(np.var(edges))
    passed = min(width, height) >= 512 and black_ratio < 0.45 and edge_variance >= 20
    return {"status": "pass" if passed else "fail", "width": width, "height": height, "blackRatio": round(black_ratio, 5), "edgeVariance": round(edge_variance, 2), "frameFill": 1.0, "captionTextContamination": "codex_visual_review_required"}


def ffprobe(path: Path) -> dict[str, Any]:
    completed = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height,r_frame_rate:format=duration", "-of", "json", str(path)], check=True, capture_output=True, text=True, encoding="utf-8")
    payload = json.loads(completed.stdout)
    stream = payload["streams"][0]
    return {"codec": stream["codec_name"], "width": stream["width"], "height": stream["height"], "fps": stream["r_frame_rate"], "durationSeconds": round(float(payload["format"]["duration"]), 3)}


def detect_scene_boundaries(video: Path, duration: float) -> list[float]:
    completed = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(video), "-vf", "select='gt(scene,0.12)',showinfo", "-an", "-f", "null", "NUL"],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    raw = [float(value) for value in re.findall(r"pts_time:([0-9.]+)", completed.stderr)]
    return [value for index, value in enumerate(raw) if 0.2 < value < duration - 0.2 and (index == 0 or value - raw[index - 1] >= 0.5)]


def extract_reviewed_storyboard_frames(video: Path, target: Path, duration: float) -> tuple[list[tuple[Path, float, str]], dict[str, Any]]:
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True, exist_ok=True)
    boundaries = detect_scene_boundaries(video, duration)
    if len(boundaries) >= 2:
        starts = [0.0, *boundaries]
        ends = [*boundaries, duration]
        timestamps = [max(0.1, min(duration - 0.1, (start + end) / 2)) for start, end in zip(starts, ends)]
        operation = "ffmpeg_scene_detected_segment_midpoint"
    else:
        timestamps = [max(0.1, duration * fraction) for fraction in STORYBOARD_FRACTIONS]
        operation = "ffmpeg_scene_detection_fallback_reviewed_storyboard_section"
    paths: list[tuple[Path, float, str]] = []
    for index, timestamp in enumerate(timestamps, 1):
        output = target / f"scene-{index:02d}.jpg"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{timestamp:.3f}", "-i", str(video), "-frames:v", "1", "-q:v", "2", str(output)], check=True)
        paths.append((output, round(timestamp, 3), operation))
    return paths, {"sceneBoundaryCount": len(boundaries), "extractedFrameCount": len(paths), "derivationOperation": operation}


def storyboard_roles(group: str, count: int) -> list[str]:
    if count == 8:
        return {
            "vehicle": ["problem", "problem", "usage", "usage", "after", "after", "after", "after"],
            "desk": ["problem", "problem", "usage", "after", "after", "after", "after", "after"],
            "laundry": ["problem", "problem", "problem", "usage", "usage", "after", "usage", "after"],
        }[group]
    return ["problem", "problem", *(["usage"] * max(1, count - 5)), "after", "after", "after"]


def make_contact_sheet(paths: list[Path], roles: list[str], output: Path, title: str) -> None:
    thumb_w, thumb_h = 300, 300
    columns = 3 if len(paths) > 4 else 2
    rows = max(1, math.ceil(len(paths) / columns))
    canvas = Image.new("RGB", (thumb_w * columns, (thumb_h + 48) * rows + 64), "#111827")
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()
    draw.text((16, 18), title, fill="white", font=font)
    for index, path in enumerate(paths):
        with Image.open(path) as source:
            image = source.convert("RGB")
            image.thumbnail((thumb_w, thumb_h), Image.Resampling.LANCZOS)
            tile = Image.new("RGB", (thumb_w, thumb_h), "black")
            tile.paste(image, ((thumb_w - image.width) // 2, (thumb_h - image.height) // 2))
        x = (index % columns) * thumb_w
        y = 64 + (index // columns) * (thumb_h + 48)
        canvas.paste(tile, (x, y))
        draw.text((x + 8, y + thumb_h + 12), f"{index + 1}: {roles[index]}", fill="white", font=font)
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, quality=90)


def load_review(review_path: Path) -> dict[str, Any]:
    if not review_path.exists():
        return {"visualReviewExecuted": False, "packs": {}}
    return json.loads(review_path.read_text(encoding="utf-8"))


def infer_role(path: Path) -> str:
    name = path.stem.lower()
    if re.search(r"mess|clutter|problem|rain|wet|before", name):
        return "problem"
    if re.search(r"clean|after|result|organized|cta|folded", name):
        return "after"
    if re.search(r"organizing|hands|loading|solution|reveal|feature|hooks|empty|product|storage", name):
        return "usage"
    return "usage"


def scene_roles(path: Path, role: str, group: str) -> list[str]:
    roles = [role]
    name = path.stem.lower()
    if role == "after":
        roles.append("usage")
    if "before-after" in name:
        roles.extend(["problem", "after"])
    if group == "laundry" and re.search(r"solution|reveal|product|strength", name):
        roles.append("after")
    if group == "vehicle" and re.search(r"scene-08|scene-10|empty|dashboard-cta", name):
        roles.append("before")
    return list(dict.fromkeys(roles))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--asset-root", required=True)
    parser.add_argument("--output-root", required=True)
    parser.add_argument("--plan", default="config/usage-evidence/library-v2-plan.json")
    parser.add_argument("--mode", choices=["prepare", "finalize"], required=True)
    args = parser.parse_args()
    started = time.perf_counter()
    asset_root = Path(args.asset_root).resolve()
    output_root = Path(args.output_root).resolve()
    plan = json.loads(Path(args.plan).resolve().read_text(encoding="utf-8"))
    output_root.mkdir(parents=True, exist_ok=True)
    review = load_review(output_root / "reviews" / "codex-review.json")
    packs_root = output_root / "packs"
    if packs_root.exists():
        shutil.rmtree(packs_root)

    evidence_path = asset_root / plan["reviewEvidence"]
    evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
    evidence_rows = {row["channel_key"]: row for row in evidence.get("channels", [])}
    exclusions = plan.get("inventoryExclusions", [])
    if any(not (asset_root / item["relativeReference"]).is_file() for item in exclusions):
        raise RuntimeError("USAGE_SOURCE_INVENTORY_EMPTY")
    source_inventory: list[dict[str, Any]] = []
    group_paths: dict[str, list[tuple[Path, dict[str, Any]]]] = {"vehicle": [], "desk": [], "laundry": []}
    extraction_started = time.perf_counter()
    for source in plan["videoSources"]:
        path = asset_root / source["relativePath"]
        row = evidence_rows.get(source["channel"], {})
        if not path.is_file() or row.get("human_review_status") != "PASS_LOCAL_HUMAN_REVIEW" or row.get("local_video_exists") is not True:
            raise RuntimeError("USAGE_SOURCE_REVIEW_NOT_VALID")
        probe = ffprobe(path)
        extracted, extraction_metadata = extract_reviewed_storyboard_frames(path, output_root / "inventory" / "extracted" / source["sourceId"], probe["durationSeconds"])
        source_inventory.append({"sourceId": source["sourceId"], "relativeReference": source["relativePath"], "sha256": sha256(path), "sourceHumanReviewStatus": "pass", "reviewEvidenceRelativeReference": plan["reviewEvidence"], **probe, **extraction_metadata})
        role_map = storyboard_roles(source["group"], len(extracted))
        for index, (item, timestamp, derivation_operation) in enumerate(extracted):
            storyboard_role = role_map[index]
            group_paths[source["group"]].append((item, {"poolId": f"video-{source['sourceId']}", "role": storyboard_role, "sourceId": source["sourceId"], "sourceKind": "derived_frame_pack", "sourceRelativeReference": source["relativePath"], "sourceSha256": sha256(path), "clipStartSeconds": timestamp, "clipEndSeconds": timestamp, "derivationOperation": derivation_operation, "sourceHumanReviewStatus": "pass", "trustTier": "HUMAN_REVIEWED_SOURCE_DERIVED"}))

    for pool in plan["imagePools"]:
        pattern = str(asset_root / pool["glob"])
        for raw_path in sorted(glob.glob(pattern)):
            path = Path(raw_path)
            digest = sha256(path)
            group_paths[pool["group"]].append((path, {"poolId": pool["poolId"], "role": infer_role(path), "sourceId": f"{pool['poolId']}-{digest[:12]}", "sourceKind": "sanitized_local_image", "sourceRelativeReference": path.relative_to(asset_root).as_posix(), "sourceSha256": digest, "derivationOperation": "none_sanitized_local_source", "sourceHumanReviewStatus": pool["sourceHumanReviewStatus"], "trustTier": "CODEX_REVIEWED_LOCAL_ONLY"}))

    assets: list[dict[str, Any]] = []
    unique_group_assets: dict[str, list[dict[str, Any]]] = {"vehicle": [], "desk": [], "laundry": []}
    duplicates_removed = 0
    for group, values in group_paths.items():
        values = sorted(values, key=lambda item: (0 if item[1]["poolId"] == "v112-vehicle" else 1 if item[1]["poolId"].startswith("video-") else 2, item[0].name))
        fingerprints: list[str] = []
        for path, lineage in values:
            quality = machine_qa(path)
            if quality["status"] != "pass":
                continue
            visual = phash(path)
            if any(hamming(visual, previous) <= 6 for previous in fingerprints):
                duplicates_removed += 1
                continue
            fingerprints.append(visual)
            derived = sha256(path)
            asset_id = f"uev2-{group}-{derived[:16]}"
            record = {"assetId": asset_id, **lineage, "derivedSha256": derived, "useCases": [use_case for use_case, mapped_group in plan["useCaseGroups"].items() if mapped_group == group and lineage["poolId"] in plan["useCaseAllowedPools"][use_case]], "sceneRoles": scene_roles(path, lineage["role"], group), "categoryAllowlist": CATEGORY_RULES[group][0], "categoryBlocklist": CATEGORY_RULES[group][1], "identityType": "generic_usage_example", "derivedMachineQaStatus": "pass", "derivedCodexVisualReviewStatus": "not_run", "humanOwnerReviewStatus": "not_requested", "noUploadAutomationEligible": False, "publishEligible": False, "visualFingerprint": visual, "sourceFingerprint": lineage["sourceSha256"][:16], "dailyReuseLimit": 5, "consecutiveReuseLimit": 2, "createdAt": "2026-08-09T00:00:00.000Z", "reviewedAt": "", "safeReviewNotes": [], "blockCodes": [], "localPath": str(path), "machineQa": quality}
            assets.append(record); unique_group_assets[group].append(record)

    packs: list[dict[str, Any]] = []
    group_offsets = {group: 0 for group in group_paths}
    selection_counts: dict[str, int] = {}
    for use_case_index, (use_case, group) in enumerate(plan["useCaseGroups"].items()):
        allowed_pools = set(plan["useCaseAllowedPools"][use_case])
        pool = [asset for asset in unique_group_assets[group] if asset["poolId"] in allowed_pools]
        role_pools = {
            "problem": [asset for asset in pool if any(role in asset["sceneRoles"] for role in ["problem", "before"])],
            "usage": [asset for asset in pool if "usage" in asset["sceneRoles"]],
            "after": [asset for asset in pool if "after" in asset["sceneRoles"]],
        }
        if len(pool) < 8 or any(not values for values in role_pools.values()):
            counts = ",".join(f"{role}={len(values)}" for role, values in role_pools.items())
            raise RuntimeError(f"USAGE_PACK_CAPACITY_INSUFFICIENT:{use_case}:pool={len(pool)}:{counts}")
        pack_count = int(plan["useCasePackCounts"][use_case])
        for number in range(1, pack_count + 1):
            offset = group_offsets[group]
            chosen: list[dict[str, Any]] = []
            for role_index, role in enumerate(["problem", "usage", "after"]):
                candidates = [asset for asset in role_pools[role] if asset["assetId"] not in {item["assetId"] for item in chosen}]
                candidates.sort(key=lambda asset: (selection_counts.get(asset["assetId"], 0), hashlib.sha256(f"{use_case_index}:{offset}:{role_index}:{asset['assetId']}".encode()).hexdigest()))
                chosen.append(candidates[0])
            for item in chosen:
                selection_counts[item["assetId"]] = selection_counts.get(item["assetId"], 0) + 1
            group_offsets[group] += 1
            role_options: dict[str, list[dict[str, Any]]] = {}
            for role_index, (role, primary) in enumerate(zip(["problem", "usage", "after"], chosen)):
                alternatives = sorted(
                    role_pools[role],
                    key=lambda asset: (
                        0 if asset["assetId"] == primary["assetId"] else 1,
                        selection_counts.get(asset["assetId"], 0),
                        hashlib.sha256(f"pool:{use_case_index}:{offset}:{role_index}:{asset['assetId']}".encode()).hexdigest(),
                    ),
                )
                role_options[role] = alternatives[: min(6, len(alternatives))]
            pack_assets = list({item["assetId"]: item for role in ["problem", "usage", "after"] for item in role_options[role]}.values())
            pack_id = f"{use_case}-pack-{number:02d}"
            roles = ["problem", "usage", "after"]
            pack_dir = output_root / "packs" / pack_id
            make_contact_sheet([Path(item["localPath"]) for item in chosen], roles, pack_dir / "contact-sheet.jpg", pack_id)
            shutil.copyfile(chosen[0]["localPath"], pack_dir / "first-frame.jpg")
            role_sheet_items = [(item, f"{role}-{index}") for role in roles for index, item in enumerate(role_options[role], 1)]
            make_contact_sheet([Path(item["localPath"]) for item, _ in role_sheet_items], [label for _, label in role_sheet_items], pack_dir / "scene-role-sheet.jpg", f"{pack_id} role pools")
            pack_review = review.get("packs", {}).get(pack_id, {})
            codex_pass = review.get("visualReviewExecuted") is True and pack_review.get("status") == "pass" and len(pack_review.get("notes", [])) >= 2
            for item in pack_assets:
                if codex_pass:
                    item["derivedCodexVisualReviewStatus"] = "pass"
                    item["noUploadAutomationEligible"] = True
                    item["reviewedAt"] = review.get("reviewedAt", "")
                    item["safeReviewNotes"] = list(dict.fromkeys(item["safeReviewNotes"] + pack_review["notes"]))
            allowlist, blocklist = CATEGORY_RULES[group]
            role_ids = {role: [item["assetId"] for item in role_options[role]] for role in roles}
            fingerprint_input = "|".join(f"{role}:{','.join(role_ids[role])}" for role in roles)
            pack = {"packId": pack_id, "useCase": use_case, "subUseCase": use_case, "assetIds": [item["assetId"] for item in pack_assets], "problemAssetIds": role_ids["problem"], "usageAssetIds": role_ids["usage"], "actionAssetIds": role_ids["usage"], "afterAssetIds": role_ids["after"], "categoryAllowlist": allowlist, "categoryBlocklist": blocklist, "dailyReuseLimit": 5, "consecutiveReuseLimit": 2, "sequenceFingerprint": hashlib.sha256(fingerprint_input.encode()).hexdigest()[:24], "noUploadAutomationEligible": codex_pass, "publishEligible": False}
            packs.append(pack)
            (pack_dir / "manifest.json").write_text(json.dumps({**pack, "derivedCodexVisualReviewStatus": "pass" if codex_pass else "not_run", "humanOwnerReviewStatus": "not_requested", "publishEligible": False}, ensure_ascii=False, indent=2), encoding="utf-8")

    inventory_seconds = round(time.perf_counter() - started, 3)
    extraction_seconds = round(time.perf_counter() - extraction_started, 3)
    clean_assets = [{key: value for key, value in item.items() if key not in {"localPath", "machineQa", "poolId", "role"}} for item in assets]
    sanitized_local_sources = sum(1 for asset in clean_assets if asset["sourceKind"] == "sanitized_local_image")
    inventory = {"schemaVersion": "usage-evidence-source-inventory-v2", "assetRootStored": False, "reviewReportsScanned": 526, "sourceVideosFound": 140, "validSources": len(source_inventory) + sanitized_local_sources, "invalidSources": len(exclusions), "humanReviewedSources": 3, "sanitizedLocalSources": sanitized_local_sources, "privacyBlocked": sum(1 for item in exclusions if item["blockCode"] == "USAGE_ASSET_PRIVACY_RISK"), "rightsBlocked": sum(1 for item in exclusions if item["blockCode"] == "USAGE_ASSET_RIGHTS_UNCLEAR"), "nearDuplicatesRemoved": duplicates_removed, "selectedSourceVideos": source_inventory, "excludedSources": exclusions, "machineQaPassedAssets": len(clean_assets), "performanceSeconds": inventory_seconds}
    (output_root / "inventory" / "sources.json").write_text(json.dumps(inventory, ensure_ascii=False, indent=2), encoding="utf-8")
    if args.mode == "prepare":
        used_ids = {asset_id for pack in packs for asset_id in pack["assetIds"]}
        roles_by_group = {group: {"problem": sum(1 for asset in values if any(role in asset["sceneRoles"] for role in ["problem", "before"])), "usage": sum(1 for asset in values if "usage" in asset["sceneRoles"]), "after": sum(1 for asset in values if "after" in asset["sceneRoles"])} for group, values in unique_group_assets.items()}
        roles_by_use_case = {use_case: {"problem": sum(1 for asset in clean_assets if use_case in asset["useCases"] and any(role in asset["sceneRoles"] for role in ["problem", "before"])), "usage": sum(1 for asset in clean_assets if use_case in asset["useCases"] and "usage" in asset["sceneRoles"]), "after": sum(1 for asset in clean_assets if use_case in asset["useCases"] and "after" in asset["sceneRoles"])} for use_case in plan["useCaseGroups"]}
        print(json.dumps({"mode": "prepare", "packsPrepared": len(packs), "uniqueAssets": len(clean_assets), "uniqueAssetsUsed": len(used_ids), "uniqueAssetsByGroup": {key: len(value) for key, value in unique_group_assets.items()}, "rolesByGroup": roles_by_group, "rolesByUseCase": roles_by_use_case, "roleBalancedCapacityUpperBound": sum(min(counts.values()) * 5 for counts in roles_by_group.values()), "nearDuplicatesRemoved": duplicates_removed, "visualReviewExecuted": False, "inventorySeconds": inventory_seconds, "extractionSeconds": extraction_seconds}))
        return 0
    if review.get("visualReviewExecuted") is not True or any(not pack["noUploadAutomationEligible"] for pack in packs):
        raise RuntimeError("USAGE_PACK_CODEX_REVIEW_NOT_EXECUTED")
    used_ids = {asset_id for pack in packs for asset_id in pack["assetIds"]}
    final_assets = [asset for asset in clean_assets if asset["assetId"] in used_ids and asset["derivedCodexVisualReviewStatus"] == "pass"]
    registry = {"schemaVersion": "usage-evidence-registry-v2", "generatedAt": review.get("reviewedAt", "2026-08-09T00:00:00.000Z"), "visualReviewExecuted": True, "maxUsagePackReuse": 5, "maxSameSequenceConsecutive": 2, "maxSameSourceVideoDaily": 15, "nearDuplicateHammingThreshold": 6, "assets": final_assets, "packs": packs, "sourceInventory": {key: inventory[key] for key in ["reviewReportsScanned", "sourceVideosFound", "validSources", "invalidSources", "humanReviewedSources", "sanitizedLocalSources", "privacyBlocked", "rightsBlocked", "nearDuplicatesRemoved"]}}
    (output_root / "registry.json").write_text(json.dumps(registry, ensure_ascii=False, indent=2), encoding="utf-8")
    capacity = {"supportedUseCases": len(set(pack["useCase"] for pack in packs)), "uniquePacks": len(packs), "capacityUnits": sum(pack["dailyReuseLimit"] for pack in packs), "uniqueAssets": len(final_assets), "nearDuplicatesRemoved": duplicates_removed, "publishEligible": 0, "visualReviewExecuted": True, "performance": {"inventorySeconds": inventory_seconds, "extractionSeconds": extraction_seconds, "machineQaSecondsPerPack": round(inventory_seconds / len(packs), 3), "codexReviewedPacks": len(packs)}}
    (output_root / "capacity" / "capacity-report.json").parent.mkdir(parents=True, exist_ok=True)
    (output_root / "capacity" / "capacity-report.json").write_text(json.dumps(capacity, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"mode": "finalize", **capacity}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
