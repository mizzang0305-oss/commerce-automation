from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from time import perf_counter

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.media.pre_render_visual_evidence_gate import (  # noqa: E402
    SceneVisualEvidence,
    evaluate_pre_render_visual_evidence,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the local-only V135 pre-render visual evidence gate.")
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    started = perf_counter()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    manifest_root = args.manifest.resolve().parent
    scenes = [
        SceneVisualEvidence(
            scene_id=str(item["scene_id"]),
            image_path=(manifest_root / str(item["image_path"])).resolve(),
            provenance=str(item.get("provenance", "unknown")),
            usage_label_present=item.get("usage_label_present") is True,
        )
        for item in manifest.get("scenes", [])
    ]
    gate = evaluate_pre_render_visual_evidence(scenes)
    report = {
        "version": "v135",
        "candidate_id": str(manifest.get("candidate_id", "")),
        "scenario": str(manifest.get("scenario", "")),
        "status": "PASS_PRE_RENDER_VISUAL_EVIDENCE" if gate["gate_pass"] else "BLOCKED_PRE_RENDER_VISUAL_EVIDENCE",
        "processing_duration_ms": round((perf_counter() - started) * 1000, 2),
        "gate": gate,
        "final_render_attempted": False,
        "tts_attempted": False,
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
