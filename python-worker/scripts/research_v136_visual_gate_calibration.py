from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from time import perf_counter

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.media.visual_gate_calibration import (  # noqa: E402
    VisualCalibrationSample,
    calibrate_visual_gate,
    prepare_calibration_samples,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Calibrate V135 pixel thresholds against a labeled local corpus.")
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    started = perf_counter()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    root = args.manifest.resolve().parent
    samples = []
    for item in manifest.get("samples", []):
        scene_dir = (root / str(item["scene_directory"])).resolve()
        image_paths = tuple(sorted(
            path for path in scene_dir.iterdir()
            if path.suffix.lower() in {".png", ".jpg", ".jpeg"}
        ))
        samples.append(VisualCalibrationSample(
            sample_id=str(item["sample_id"]),
            label=str(item["label"]),
            image_paths=image_paths,
        ))

    calibration = calibrate_visual_gate(prepare_calibration_samples(samples))
    report = {
        "version": "v136",
        "status": "PASS_VISUAL_GATE_CALIBRATION" if calibration["stage_1_pixel_gate_ready"] else "BLOCKED_VISUAL_GATE_CALIBRATION",
        "processing_duration_ms": round((perf_counter() - started) * 1000, 2),
        "calibration": calibration,
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


if __name__ == "__main__":
    raise SystemExit(main())
