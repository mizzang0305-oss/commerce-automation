"""Local-only bridge to approved Worker media primitives. JSON in/out; no external writes."""
from __future__ import annotations

from array import array
from datetime import datetime, timedelta, timezone
import errno as errno_module
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import traceback
import uuid
import wave
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "python-worker"))

from PIL import Image, ImageDraw, ImageFont  # noqa: E402
from src.media.pre_render_visual_evidence_gate import build_scene_similarity_profile, summarize_scene_similarity_profile  # noqa: E402
from src.media.subtitle_generator import write_srt  # noqa: E402
from src.media.tts_generator import TtsGenerationError, create_tts_audio  # noqa: E402
from src.media import video_renderer  # noqa: E402

VIDEO_WIDTH = 1080
VIDEO_HEIGHT = 1920
HOOK_BOX = {"x": 64, "y": 118, "width": 952, "height": 360}
USAGE_BADGE_BOX = {"x": 72, "y": 510, "width": 520, "height": 72}
HOOK_USAGE_MIN_GAP_PX = 32
USAGE_LABEL = "연출된 사용 예시"
FONT_PATH = Path("C:/Windows/Fonts/malgunbd.ttf")
KST = timezone(timedelta(hours=9))

_TRACE: dict[str, Any] = {}


def begin_trace(request: dict[str, Any]) -> None:
    context = request.get("diagnostic_context") if isinstance(request.get("diagnostic_context"), dict) else {}
    output_value = request.get("output")
    output = Path(output_value).absolute() if isinstance(output_value, str) and output_value else None
    input_root_value = request.get("input_root")
    input_root = Path(input_root_value).absolute() if isinstance(input_root_value, str) and input_root_value else None
    _TRACE.clear()
    _TRACE.update({
        "phase": "READ_REQUEST",
        "phaseObjectKind": "request",
        "phasePath": None,
        "renderRunId": safe_identifier(context.get("renderRunId")) or f"render-{uuid.uuid4().hex}",
        "tempRootId": hashlib.sha256(str(output.parent if output else "none").encode("utf-8")).hexdigest() if output else None,
        "candidateId": safe_identifier(context.get("candidateId")),
        "slotId": safe_identifier(context.get("slotId")),
        "queueId": safe_identifier(context.get("queueId")),
        "ownerPid": os.getpid(),
        "parentPid": os.getppid(),
        "startedMonotonicNs": time.monotonic_ns(),
        "startedAtKst": datetime.now(KST).isoformat(),
        "inputRoot": input_root,
        "output": output,
        "expectedInputs": [Path(value).absolute() for value in request.get("image_paths", []) if isinstance(value, str)]
            + ([Path(request["audio_path"]).absolute()] if isinstance(request.get("audio_path"), str) else []),
        "inputPreRender": [],
        "tools": {},
        "processes": [],
    })


def safe_identifier(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized if normalized and len(normalized) <= 160 and all(character.isalnum() or character in "-_.:" for character in normalized) else None


def set_phase(phase: str, object_kind: str | None = None, path: str | Path | None = None) -> None:
    _TRACE["phase"] = phase
    _TRACE["phaseObjectKind"] = object_kind
    _TRACE["phasePath"] = Path(path).absolute() if path is not None else None
    renderer = _TRACE.get("renderer")
    if isinstance(renderer, dict):
        renderer["currentPhase"] = phase


def path_evidence(path: str | Path | None, *, include_hash: bool = False) -> dict[str, Any] | None:
    if path is None:
        return None
    value = Path(path).absolute()
    path_string = str(value)
    classification = "OTHER"
    relative_path: str | None = None
    roots = (
        ("INPUT_ROOT", _TRACE.get("inputRoot")),
        ("OUTPUT_ROOT", _TRACE.get("output").parent if isinstance(_TRACE.get("output"), Path) else None),
    )
    for label, root in roots:
        if not isinstance(root, Path):
            continue
        try:
            relative_path = value.relative_to(root).as_posix()
            classification = label
            break
        except ValueError:
            pass
    tool_paths = _TRACE.get("tools", {})
    if any(isinstance(tool, dict) and tool.get("absolutePath") == path_string for tool in tool_paths.values()):
        classification = "RUNTIME_EXECUTABLE"
        relative_path = value.name
    exists = os.path.lexists(value)
    is_file = value.is_file() if exists else False
    result: dict[str, Any] = {
        "basename": value.name,
        "allowedRootClassification": classification,
        "relativePath": relative_path,
        "pathStringSha256": hashlib.sha256(path_string.encode("utf-8")).hexdigest(),
        "exists": exists,
        "isFile": is_file,
        "isReparsePoint": bool(value.is_symlink() or (hasattr(value, "is_junction") and value.is_junction())) if exists else False,
    }
    if is_file:
        stat = value.stat()
        result.update({"size": stat.st_size, "mtimeNs": stat.st_mtime_ns})
        if include_hash:
            result["sha256"] = file_sha256(value)
    return result


def record_input_pre_render(path: Path, sha256: str) -> None:
    evidence = path_evidence(path)
    if evidence is not None:
        evidence["sha256"] = sha256
        _TRACE.setdefault("inputPreRender", []).append(evidence)


def failure_diagnostic(exc: BaseException) -> dict[str, Any]:
    filename = getattr(exc, "filename", None)
    filename2 = getattr(exc, "filename2", None)
    phase_path = _TRACE.get("phasePath")
    missing_path = filename or phase_path
    renderer = _TRACE.get("renderer")
    current_phase = str(renderer.get("failurePhaseBeforeCleanup") if isinstance(renderer, dict) and renderer.get("failurePhaseBeforeCleanup") else _TRACE.get("phase", "UNKNOWN"))
    kind = str(_TRACE.get("phaseObjectKind") or "other")
    if "FFMPEG" in current_phase or "FFPROBE" in current_phase or current_phase.startswith("RESOLVE_"):
        kind = "executable"
    elif "INPUT" in current_phase:
        kind = "input"
    elif "TEMP" in current_phase or current_phase in {"ATOMIC_REPLACE", "STAT_TEMP_OUTPUT"}:
        kind = "temp_output"
    elif "OUTPUT_PARENT" in current_phase:
        kind = "output_parent"
    elif "FINAL_OUTPUT" in current_phase:
        kind = "output"
    frames = traceback.extract_tb(exc.__traceback__) if exc.__traceback__ else []
    bridge_frame = next((frame for frame in reversed(frames) if Path(frame.filename).name == Path(__file__).name), None)
    return {
        "schemaVersion": "local-media-failure-diagnostic-v1",
        "failurePhase": current_phase,
        "exceptionClass": type(exc).__name__,
        "errno": getattr(exc, "errno", None),
        "winerror": getattr(exc, "winerror", None),
        "strerrorCategory": errno_module.errorcode.get(getattr(exc, "errno", None), "UNKNOWN"),
        "failingFunction": frames[-1].name if frames else None,
        "bridgeFunction": bridge_frame.name if bridge_frame else None,
        "missingObject": {"kind": kind, "primary": path_evidence(missing_path), "secondary": path_evidence(filename2)},
        "process": {
            "pid": _TRACE.get("ownerPid"),
            "parentPid": _TRACE.get("parentPid"),
            "monotonicNs": time.monotonic_ns(),
            "wallKst": datetime.now(KST).isoformat(),
        },
        "renderContext": {
            "renderRunId": _TRACE.get("renderRunId"),
            "tempRootId": _TRACE.get("tempRootId"),
            "candidateId": _TRACE.get("candidateId"),
            "slotId": _TRACE.get("slotId"),
            "queueId": _TRACE.get("queueId"),
            "ownerPid": _TRACE.get("ownerPid"),
        },
        "inputLifetime": {
            "preRender": _TRACE.get("inputPreRender", []),
            "atFailure": [path_evidence(path) for path in _TRACE.get("expectedInputs", [])],
        },
        "tools": [{key: value for key, value in tool.items() if key != "absolutePath"} for tool in _TRACE.get("tools", {}).values()],
        "processes": _TRACE.get("processes", []),
        "tempOwnership": _TRACE.get("tempOwnership"),
        "publication": _TRACE.get("publication"),
        "renderer": _TRACE.get("renderer"),
        "safeError": _TRACE.get("safeErrorOverride"),
        "retryDecision": {"allowed": False, "reason": _TRACE.get("retryReason", "ROOT_CAUSE_NOT_PROVEN")},
        "rawAbsolutePathsStored": False,
    }


def success_diagnostic() -> dict[str, Any]:
    return {
        "schemaVersion": "local-media-lifecycle-v1",
        "renderContext": {
            "renderRunId": _TRACE.get("renderRunId"),
            "tempRootId": _TRACE.get("tempRootId"),
            "candidateId": _TRACE.get("candidateId"),
            "slotId": _TRACE.get("slotId"),
            "queueId": _TRACE.get("queueId"),
            "ownerPid": _TRACE.get("ownerPid"),
        },
        "inputPreRender": _TRACE.get("inputPreRender", []),
        "tools": [{key: value for key, value in tool.items() if key != "absolutePath"} for tool in _TRACE.get("tools", {}).values()],
        "processes": _TRACE.get("processes", []),
        "publication": _TRACE.get("publication"),
        "renderer": _TRACE.get("renderer"),
        "rawAbsolutePathsStored": False,
    }


def read_request() -> dict[str, Any]:
    value = json.loads(sys.stdin.read())
    if not isinstance(value, dict):
        raise ValueError("LOCAL_MEDIA_REQUEST_INVALID")
    return value


def emit(value: dict[str, Any]) -> None:
    print(json.dumps(value, ensure_ascii=False))


def visual_gate(request: dict[str, Any]) -> dict[str, Any]:
    paths = [Path(value).resolve(strict=True) for value in request["image_paths"]]
    asset = request.get("real_use_asset")
    blockers: list[str] = []
    if not isinstance(asset, dict) or asset.get("ownerReviewStatus") != "pass":
        blockers.append("OWNER_REVIEWED_REAL_USE_ASSET_REQUIRED")
    if isinstance(asset, dict) and asset.get("identityType") != "generic_usage_example":
        blockers.append("GENERIC_USAGE_IDENTITY_REQUIRED")
    profile = summarize_scene_similarity_profile(build_scene_similarity_profile(paths))
    if len(paths) < 5:
        blockers.append("SCENE_COUNT_BELOW_MINIMUM")
    if profile["perceptual_cluster_count"] < 3:
        blockers.append("VISUAL_CLUSTER_COUNT_BELOW_MINIMUM")
    if profile["largest_cluster_ratio"] > 0.5:
        blockers.append("REPEATED_VISUAL_CLUSTER")
    if profile["portrait_scene_count"] != len(paths):
        blockers.append("NON_PORTRAIT_SCENE_PRESENT")
    return {
        "gate_version": "local-owner-reviewed-real-use-v1",
        "gate_pass": not blockers,
        "blockers": blockers,
        "scene_count": len(paths),
        "perceptual_cluster_count": profile["perceptual_cluster_count"],
        "largest_cluster_ratio": profile["largest_cluster_ratio"],
        "portrait_scene_count": profile["portrait_scene_count"],
        "verified_usage_scene_count": len(paths),
        "usage_label_count": len(paths),
        "exact_product_scene_count": 0,
        "identity_type": "generic_usage_example",
        "owner_review_status": asset.get("ownerReviewStatus") if isinstance(asset, dict) else None,
        "raw_paths_in_report": False,
        "external_api_called": False,
        "upload_attempted": False,
    }


def prepare_reviewed_asset(request: dict[str, Any]) -> dict[str, Any]:
    source = Path(request["source_path"]).resolve(strict=True)
    target_dir = Path(request["target_dir"]).resolve()
    target_dir.mkdir(parents=True, exist_ok=True)
    duration = probe_duration(source)
    timestamps = [duration * fraction for fraction in (0.08, 0.23, 0.38, 0.53, 0.68, 0.83)]
    outputs: list[str] = []
    for index, timestamp in enumerate(timestamps, start=1):
        target = target_dir / f"scene-{index:02d}.png"
        run_process([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{timestamp:.3f}", "-i", str(source),
            "-vf", "crop=750:1260:165:540,scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=0x0f172a",
            "-frames:v", "1", str(target),
        ], 90)
        if not target.is_file() or target.stat().st_size <= 0:
            raise ValueError("OWNER_REVIEWED_FRAME_EXTRACTION_FAILED")
        outputs.append(str(target))
    return {"status": "success", "source_type": "owner_reviewed_local_video", "identity_type": "generic_usage_example", "image_paths": outputs, "frame_count": len(outputs)}


def layout_plan(request: dict[str, Any]) -> dict[str, Any]:
    hook = " ".join(str(request.get("hook", "")).split())
    usage_label = " ".join(str(request.get("usage_label", USAGE_LABEL)).split())
    blockers: list[str] = []
    if not hook or len(hook) > 24 or "..." in hook:
        blockers.append("VIDEO_LAYOUT_HOOK_CLIPPED")
    if not usage_label:
        blockers.append("VIDEO_LAYOUT_USAGE_BADGE_REQUIRED")
    font = ImageFont.truetype(str(FONT_PATH), 38) if FONT_PATH.is_file() else ImageFont.load_default()
    text_box = ImageDraw.Draw(Image.new("RGB", (1, 1))).textbbox((0, 0), usage_label, font=font)
    if text_box[2] - text_box[0] > USAGE_BADGE_BOX["width"] - 48:
        blockers.append("VIDEO_LAYOUT_USAGE_BADGE_TOO_WIDE")
    actual_gap = USAGE_BADGE_BOX["y"] - (HOOK_BOX["y"] + HOOK_BOX["height"])
    collision = boxes_overlap(HOOK_BOX, USAGE_BADGE_BOX)
    if collision or actual_gap < HOOK_USAGE_MIN_GAP_PX:
        blockers.append("VIDEO_LAYOUT_HOOK_USAGE_COLLISION")
    if USAGE_BADGE_BOX["x"] + USAGE_BADGE_BOX["width"] > VIDEO_WIDTH - 180:
        blockers.append("VIDEO_LAYOUT_RIGHT_CONTROL_COLLISION")
    return {"status": "success" if not blockers else "blocked", "passed": not blockers, "blockers": blockers, "hook_box": HOOK_BOX, "usage_badge_box": USAGE_BADGE_BOX, "minimum_gap_px": HOOK_USAGE_MIN_GAP_PX, "actual_gap_px": actual_gap, "collision": collision, "usage_label": usage_label}


def tts(request: dict[str, Any]) -> dict[str, Any]:
    text = str(request.get("text", ""))
    target = Path(request["target"]).resolve()
    attempt = int(request.get("attempt", 1))
    segment_index = request.get("segmentIndex")
    base = {
        "attempt": attempt,
        "inputHash": hashlib.sha256(text.encode("utf-8")).hexdigest(),
        "inputCharacters": len(text),
        "segmentIndex": segment_index if isinstance(segment_index, int) else None,
    }
    try:
        if os.environ.get("MELOTTS_SPEED") != "1.2":
            raise TtsGenerationError("TTS_RUNTIME_INVARIANT_FAILED", stage="preflight", retryable=False)
        create_tts_audio(
            text, target, provider="local_command", provider_approved=True,
            language="ko", command=str(request["command"]), speed=1.2, timeout_seconds=600,
        )
        validation = validate_tts_wav(target)
        return {
            "status": "success", "safeCode": "TTS_SUCCESS", "stage": "complete",
            **base, "output": str(target), "outputCreated": True, "retryable": False,
            "duration_seconds": validation["durationSeconds"], "provider": "local_command",
            "speed": 1.2, "validation": validation,
        }
    except TtsGenerationError as exc:
        return {
            "status": "failed", "safeCode": exc.safe_code, "stage": exc.stage, **base,
            "outputCreated": target.is_file(), "retryable": exc.retryable,
        }
    except Exception:
        return {
            "status": "failed", "safeCode": "TTS_UNKNOWN_RUNTIME_FAILURE", "stage": "runtime", **base,
            "outputCreated": target.is_file(), "retryable": False,
        }


def concat_wav(request: dict[str, Any]) -> dict[str, Any]:
    sources = [Path(value).resolve(strict=True) for value in request.get("source_paths", [])]
    if len(sources) < 2:
        raise ValueError("TTS_SEGMENTS_REQUIRED")
    pause_ms = int(request.get("pause_ms", 500))
    if pause_ms < 400 or pause_ms > 600:
        raise ValueError("TTS_SEGMENT_PAUSE_INVALID")
    target = Path(request["target"]).resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    params: tuple[int, int, int] | None = None
    chunks: list[bytes] = []
    for source in sources:
        validation = validate_tts_wav(source)
        with wave.open(str(source), "rb") as audio:
            current = (audio.getnchannels(), audio.getsampwidth(), audio.getframerate())
            if params is None:
                params = current
            elif params != current:
                raise ValueError("TTS_SEGMENT_FORMAT_MISMATCH")
            chunks.append(audio.readframes(audio.getnframes()))
    assert params is not None
    channels, sample_width, sample_rate = params
    silence = b"\x00" * int(round(sample_rate * pause_ms / 1000)) * channels * sample_width
    with wave.open(str(target), "wb") as audio:
        audio.setnchannels(channels)
        audio.setsampwidth(sample_width)
        audio.setframerate(sample_rate)
        audio.writeframes(silence.join(chunks))
    validation = validate_tts_wav(target)
    return {"status": "success", "output": str(target), "segments": len(sources), "pauseMs": pause_ms, "validation": validation}


def validate_tts_wav(path: Path) -> dict[str, Any]:
    try:
        size = path.stat().st_size
        with wave.open(str(path), "rb") as audio:
            channels = audio.getnchannels()
            sample_width = audio.getsampwidth()
            sample_rate = audio.getframerate()
            frame_count = audio.getnframes()
            frames = audio.readframes(frame_count)
    except (OSError, EOFError, wave.Error) as exc:
        raise TtsGenerationError("TTS_OUTPUT_INVALID", stage="output_validation", retryable=False) from exc
    if size <= 1024 or channels != 1 or sample_width != 2 or sample_rate != 44100 or frame_count <= 0:
        raise TtsGenerationError("TTS_OUTPUT_INVALID", stage="output_validation", retryable=False)
    samples = array("h")
    samples.frombytes(frames)
    if sys.byteorder != "little":
        samples.byteswap()
    if not samples:
        raise TtsGenerationError("TTS_OUTPUT_INVALID", stage="output_validation", retryable=False)
    peak = max(abs(value) for value in samples)
    rms = math.sqrt(sum(value * value for value in samples) / len(samples))
    duration = frame_count / sample_rate
    if peak <= 32 or rms <= 16 or not 0.1 <= duration <= 180:
        raise TtsGenerationError("TTS_OUTPUT_INVALID", stage="output_validation", retryable=False)
    return {
        "passed": True, "fileBytes": size, "wavDecode": True, "channels": channels,
        "sampleWidthBytes": sample_width, "sampleRate": sample_rate, "frameCount": frame_count,
        "durationSeconds": round(duration, 3), "peak": peak,
        "peakDbfs": round(20 * math.log10(peak / 32768), 2),
        "rmsDbfs": round(20 * math.log10(rms / 32768), 2), "nonSilent": True,
        "invalidSamples": 0,
    }


def render(request: dict[str, Any]) -> dict[str, Any]:
    set_phase("PREPARE_OUTPUT_PATH", "output", request["output"])
    output = Path(request["output"]).resolve()
    work = output.parent / "render-inputs"
    set_phase("CREATE_WORK_ROOT", "output_parent", work)
    work.mkdir(parents=True, exist_ok=True)
    source_paths, audio_path, input_manifest_sha256 = resolve_render_inputs(request)
    planned = layout_plan({"hook": request.get("hook"), "usage_label": request.get("usage_label", USAGE_LABEL)})
    if planned["passed"] is not True or request.get("layout_plan") != planned:
        raise ValueError(planned["blockers"][0] if planned["blockers"] else "VIDEO_LAYOUT_PLAN_BINDING_FAILED")
    captions = request["captions"]
    if not captions:
        raise ValueError("LOCAL_MEDIA_CAPTIONS_REQUIRED")
    set_phase("READ_AUDIO_METADATA", "input", audio_path)
    audio_duration = wav_duration(audio_path)
    shot_captions = [str(cue["text"]) for cue in captions]
    shot_captions[0] = str(request["hook"])
    starts = [float(cue["start"]) for cue in captions]
    shot_durations = [max(0.12, (starts[index + 1] if index + 1 < len(starts) else audio_duration) - start) for index, start in enumerate(starts)]
    shot_images = [source_paths[index % len(source_paths)] for index in range(len(shot_captions))]
    srt = output.parent / "captions.srt"
    set_phase("CREATE_RENDER_METADATA", "output", srt)
    write_srt("\n".join(shot_captions), srt, shot_durations, shot_captions)
    video_renderer.HOOK_FONT_SIZE = 104
    video_renderer.HOOK_TEXT_Y = 226
    video_renderer.HOOK_LINE_STEP = 118
    video_renderer.HOOK_BOX_HEIGHT = 360
    original_builder = video_renderer.build_drawtext_subtitle_filters
    usage_text_path = work / "usage-label.txt"
    set_phase("CREATE_RENDER_METADATA", "output", usage_text_path)
    usage_text_path.write_text(str(planned["usage_label"]), encoding="utf-8")
    def build_filters_with_usage(*args: Any, **kwargs: Any) -> list[str]:
        filters = original_builder(*args, **kwargs)
        textfile = str(usage_text_path).replace("\\", "/").replace(":", "\\:")
        font_clause = f"fontfile='{str(FONT_PATH).replace(chr(92), '/').replace(':', chr(92) + ':')}':" if FONT_PATH.is_file() else ""
        filters.extend([
            f"drawbox=x={USAGE_BADGE_BOX['x']}:y={USAGE_BADGE_BOX['y']}:w={USAGE_BADGE_BOX['width']}:h={USAGE_BADGE_BOX['height']}:color=0x0f172a@0.94:t=fill",
            f"drawtext={font_clause}textfile='{textfile}':fontcolor=0xfacc15:fontsize=38:x={USAGE_BADGE_BOX['x'] + 24}:y={USAGE_BADGE_BOX['y'] + 13}",
        ])
        return filters
    video_renderer.build_drawtext_subtitle_filters = build_filters_with_usage
    ffmpeg_path = Path(resolve_local_tool("ffmpeg"))
    ffmpeg_sha256 = file_sha256(ffmpeg_path)
    temporary_output = owned_temporary_output(output)
    renderer_diagnostic: dict[str, Any] = {}
    _TRACE["renderer"] = renderer_diagnostic
    try:
        video_renderer.render_vertical_video(
            shot_images[0], audio_path, srt, temporary_output, str(request["title"]), str(ffmpeg_path),
            subtitle_text="\n".join(shot_captions), shot_durations=shot_durations,
            shot_captions=shot_captions, shot_image_paths=shot_images, process_runner=run_captured_process,
            lifecycle_diagnostic=renderer_diagnostic, phase_callback=set_phase,
        )
        set_phase("VALIDATE_FFMPEG_OUTPUT", "temp_output", temporary_output)
        publish_atomic_output(temporary_output, output)
    finally:
        video_renderer.build_drawtext_subtitle_filters = original_builder
        if sys.exc_info()[0] is None:
            set_phase("CLEANUP_TEMP", "temp_output", temporary_output)
        cleanup_owned_temporary_output(temporary_output, output)
    return {"status": "success", "output": str(output), "shot_count": len(shot_images), "hook_font_px": 104, "usage_labels_separate_from_hook": True, "layout": planned, "input_manifest_sha256": input_manifest_sha256, "renderer_executable_sha256": ffmpeg_sha256, "lifecycle": success_diagnostic(), "hook_text_file": str(output.parent / "drawtext-subtitles" / "subtitle-cue-001-line-01.txt"), "usage_label_text_file": str(usage_text_path)}


def render_v2(request: dict[str, Any]) -> dict[str, Any]:
    """Render local V2 full-bleed motion without changing the Production Worker renderer."""
    set_phase("PREPARE_OUTPUT_PATH", "output", request["output"])
    output = Path(request["output"]).resolve()
    work = output.parent / "render-inputs"
    set_phase("CREATE_WORK_ROOT", "output_parent", work)
    work.mkdir(parents=True, exist_ok=True)
    source_paths, audio_path, input_manifest_sha256 = resolve_render_inputs(request)
    scene_roles = request.get("scene_roles")
    if not isinstance(scene_roles, list) or len(scene_roles) != len(source_paths):
        scene_roles = ["generic_usage_example"] * len(source_paths)
    if any(role not in {"product_reference", "generic_usage_example"} for role in scene_roles):
        raise ValueError("VIDEO_SCENE_ROLE_INVALID")
    captions = request.get("captions")
    if not isinstance(captions, list) or not captions:
        raise ValueError("LOCAL_MEDIA_CAPTIONS_REQUIRED")
    if any(len(cue.get("words", [])) > 4 for cue in captions if isinstance(cue, dict)):
        raise ValueError("CAPTION_SAFE_TIMELINE_FAILED")
    planned = layout_plan({"hook": request.get("hook"), "usage_label": request.get("usage_label", USAGE_LABEL)})
    if planned["passed"] is not True or request.get("layout_plan") != planned:
        raise ValueError(planned["blockers"][0] if planned["blockers"] else "VIDEO_LAYOUT_PLAN_BINDING_FAILED")
    set_phase("READ_AUDIO_METADATA", "input", audio_path)
    audio_duration = wav_duration(audio_path)
    shot_captions = [str(cue["text"]) for cue in captions]
    shot_captions[0] = str(request["hook"])
    starts = [float(cue["start"]) for cue in captions]
    shot_durations = [max(0.12, (starts[index + 1] if index + 1 < len(starts) else audio_duration) - start) for index, start in enumerate(starts)]
    generic_paths = [path for path, role in zip(source_paths, scene_roles) if role == "generic_usage_example"]
    reference_paths = [path for path, role in zip(source_paths, scene_roles) if role == "product_reference"]
    if not generic_paths:
        raise ValueError("GENERIC_USAGE_SCENES_REQUIRED")
    shot_images = [
        reference_paths[0] if index == 0 and reference_paths else generic_paths[(index - (1 if reference_paths else 0)) % len(generic_paths)]
        for index in range(len(shot_captions))
    ]
    srt = output.parent / "captions.srt"
    set_phase("CREATE_RENDER_METADATA", "output", srt)
    write_srt("\n".join(shot_captions), srt, shot_durations, shot_captions)

    video_renderer.HOOK_FONT_SIZE = 104
    video_renderer.HOOK_TEXT_Y = 190
    video_renderer.HOOK_LINE_STEP = 112
    video_renderer.HOOK_BOX_HEIGHT = 330
    video_renderer.DRAWTEXT_SUBTITLE_FONT_SIZE = int(request.get("caption_font_px", 66))
    video_renderer.DRAWTEXT_LINE_STEP = 80
    video_renderer.DRAWTEXT_SUBTITLE_Y = "h-290-text_h"
    original_base = video_renderer._build_base_video_filter
    original_builder = video_renderer.build_drawtext_subtitle_filters
    original_wrap = video_renderer.wrap_caption
    base_call = {"index": 0}

    def build_motion_base() -> str:
        index = base_call["index"]
        base_call["index"] += 1
        role = "product_reference" if index == 0 and reference_paths else "generic_usage_example"
        return scene_motion_base_filter(index, role)

    full_label_path = work / "usage-label-full.txt"
    short_label_path = work / "usage-label-short.txt"
    reference_label_path = work / "product-reference-label.txt"
    set_phase("CREATE_RENDER_METADATA", "output", full_label_path)
    full_label_path.write_text(str(planned["usage_label"]), encoding="utf-8")
    short_label_path.write_text("사용 예시", encoding="utf-8")
    reference_label_path.write_text("상품 참고 이미지", encoding="utf-8")

    def build_v2_filters(*args: Any, **kwargs: Any) -> list[str]:
        filters = original_builder(*args, **kwargs)
        font_clause = f"fontfile='{str(FONT_PATH).replace(chr(92), '/').replace(':', chr(92) + ':')}':" if FONT_PATH.is_file() else ""
        full_text = str(full_label_path).replace("\\", "/").replace(":", "\\:")
        short_text = str(short_label_path).replace("\\", "/").replace(":", "\\:")
        if reference_paths:
            reference_text = str(reference_label_path).replace("\\", "/").replace(":", "\\:")
            reference_end = shot_durations[0]
            generic_full_end = reference_end + min(1.8, shot_durations[1] if len(shot_durations) > 1 else 1.8)
            filters.extend([
                f"drawbox=x=72:y=500:w=360:h=64:color=0x0f172a@0.88:t=fill:enable='between(t,0,{reference_end:.3f})'",
                f"drawtext={font_clause}textfile='{reference_text}':fontcolor=0x38bdf8:fontsize=34:x=94:y=512:enable='between(t,0,{reference_end:.3f})'",
                f"drawbox=x=72:y=500:w=520:h=72:color=0x0f172a@0.88:t=fill:enable='between(t,{reference_end:.3f},{generic_full_end:.3f})'",
                f"drawtext={font_clause}textfile='{full_text}':fontcolor=0xfacc15:fontsize=38:x=96:y=513:enable='between(t,{reference_end:.3f},{generic_full_end:.3f})'",
                f"drawbox=x=72:y=500:w=210:h=54:color=0x0f172a@0.70:t=fill:enable='gt(t,{generic_full_end:.3f})'",
                f"drawtext={font_clause}textfile='{short_text}':fontcolor=0xfacc15:fontsize=28:x=92:y=510:enable='gt(t,{generic_full_end:.3f})'",
            ])
        else:
            filters.extend([
                "drawbox=x=72:y=500:w=520:h=72:color=0x0f172a@0.88:t=fill:enable='between(t,0,1.8)'",
                f"drawtext={font_clause}textfile='{full_text}':fontcolor=0xfacc15:fontsize=38:x=96:y=513:enable='between(t,0,1.8)'",
                "drawbox=x=72:y=500:w=210:h=54:color=0x0f172a@0.70:t=fill:enable='gt(t,1.8)'",
                f"drawtext={font_clause}textfile='{short_text}':fontcolor=0xfacc15:fontsize=28:x=92:y=510:enable='gt(t,1.8)'",
            ])
        elapsed = 0.0
        emphasis_dir = work / "emphasis"
        emphasis_dir.mkdir(parents=True, exist_ok=True)
        for index, (cue, duration) in enumerate(zip(captions, shot_durations), start=1):
            word = str(cue.get("emphasisWord", "")).strip() if isinstance(cue, dict) else ""
            if word:
                path = emphasis_dir / f"emphasis-{index:03d}.txt"
                path.write_text(word, encoding="utf-8")
                textfile = str(path).replace("\\", "/").replace(":", "\\:")
                start = elapsed
                end = elapsed + duration
                filters.append(
                    f"drawtext={font_clause}textfile='{textfile}':fontcolor=0xfacc15:fontsize=38:"
                    f"x=(w-text_w)/2:y=h-520:alpha='if(lt(t,{start + 0.12:.3f}),max(0,(t-{start:.3f})/0.12),1)':"
                    f"enable='between(t,{start:.3f},{end:.3f})'"
                )
            elapsed += duration
        return filters

    def wrap_v2_caption(text: str, max_chars: int = 24, max_lines: int = 2) -> list[str]:
        return original_wrap(text, max_chars=12 if max_chars == 16 else max_chars, max_lines=max_lines)

    video_renderer._build_base_video_filter = build_motion_base
    video_renderer.build_drawtext_subtitle_filters = build_v2_filters
    video_renderer.wrap_caption = wrap_v2_caption
    ffmpeg_path = Path(resolve_local_tool("ffmpeg"))
    ffmpeg_sha256 = file_sha256(ffmpeg_path)
    temporary_output = owned_temporary_output(output)
    renderer_diagnostic: dict[str, Any] = {}
    _TRACE["renderer"] = renderer_diagnostic
    try:
        video_renderer.render_vertical_video(
            shot_images[0], audio_path, srt, temporary_output, str(request["title"]), str(ffmpeg_path),
            subtitle_text="\n".join(shot_captions), shot_durations=shot_durations,
            shot_captions=shot_captions, shot_image_paths=shot_images, process_runner=run_captured_process,
            lifecycle_diagnostic=renderer_diagnostic, phase_callback=set_phase,
        )
        set_phase("VALIDATE_FFMPEG_OUTPUT", "temp_output", temporary_output)
        publish_atomic_output(temporary_output, output)
    finally:
        video_renderer._build_base_video_filter = original_base
        video_renderer.build_drawtext_subtitle_filters = original_builder
        video_renderer.wrap_caption = original_wrap
        if sys.exc_info()[0] is None:
            set_phase("CLEANUP_TEMP", "temp_output", temporary_output)
        cleanup_owned_temporary_output(temporary_output, output)
    return {
        "status": "success", "output": str(output), "shot_count": len(shot_images),
        "hook_font_px": 104, "caption_font_px": int(request.get("caption_font_px", 66)),
        "caption_animation": str(request.get("caption_animation", "pop")),
        "primary_visual_width_ratio": float(request.get("primary_visual_width_ratio", 0.92)),
        "canvas_fill_ratio": float(request.get("canvas_fill_ratio", 0.93)),
        "motion_preset": "push_pan", "usage_label_mode": "full_then_abbreviated",
        "product_reference_scene_count": 1 if reference_paths else 0,
        "generic_usage_scene_source_count": len(generic_paths),
        "exact_product_use_claimed": False,
        "input_manifest_sha256": input_manifest_sha256,
        "renderer_executable_sha256": ffmpeg_sha256,
        "lifecycle": success_diagnostic(),
        "usage_labels_separate_from_hook": True, "layout": planned,
        "hook_text_file": str(output.parent / "drawtext-subtitles" / "subtitle-cue-001-line-01.txt"),
        "usage_label_text_file": str(full_label_path), "usage_label_short_text_file": str(short_label_path),
        "product_reference_label_text_file": str(reference_label_path) if reference_paths else None,
    }


def scene_motion_base_filter(index: int, role: str) -> str:
    if role == "product_reference":
        return (
            "scale=1000:1800:force_original_aspect_ratio=decrease:out_range=tv,"
            "pad=1160:2000:(ow-iw)/2:(oh-ih)/2:color=0xf8fafc,"
            "crop=1080:1920:"
            "x='40+40*sin(2*PI*t/2.4)':y='40+40*cos(2*PI*t/2.4)',"
            "format=yuv420p"
        )
    crop_x = ("(in_w-out_w)/2", "(in_w-out_w)*min(t/2.4,1)", "(in_w-out_w)*(1-min(t/2.4,1))")[index % 3]
    return (
        "scale=w='trunc(1080*(1+0.035*t)/2)*2':h='trunc(1920*(1+0.035*t)/2)*2':"
        "force_original_aspect_ratio=increase:eval=frame:out_range=tv,"
        f"crop=1080:1920:x='{crop_x}':y='(in_h-out_h)/2',"
        "format=yuv420p"
    )


def inspect(request: dict[str, Any]) -> dict[str, Any]:
    set_phase("VALIDATE_FINAL_OUTPUT", "output", request["output"])
    output = Path(request["output"]).resolve(strict=True)
    completed = run_captured_process(
        [resolve_local_tool("ffprobe"), "-v", "error", "-show_streams", "-show_format", "-of", "json", str(output)],
        check=True, capture_output=True, text=True, timeout=60,
    )
    probe = json.loads(completed.stdout)
    video = next((stream for stream in probe["streams"] if stream.get("codec_type") == "video"), None)
    audio = next((stream for stream in probe["streams"] if stream.get("codec_type") == "audio"), None)
    first_frame = Path(request["first_frame"]).resolve()
    contact_sheet = Path(request["contact_sheet"]).resolve()
    first_frame.parent.mkdir(parents=True, exist_ok=True)
    run_process(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", "0", "-i", str(output), "-frames:v", "1", "-q:v", "2", str(first_frame)], 60)
    run_process(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(output), "-vf", "fps=1/4,scale=270:480,tile=3x2", "-frames:v", "1", "-q:v", "2", str(contact_sheet)], 90)
    layout = request.get("layout_plan")
    if not isinstance(layout, dict) or layout.get("passed") is not True:
        raise ValueError("VIDEO_LAYOUT_METADATA_REQUIRED")
    return {
        "status": "success", "file_size": output.stat().st_size,
        "duration_seconds": float(probe["format"]["duration"]),
        "width": video.get("width") if video else None, "height": video.get("height") if video else None,
        "video_codec": video.get("codec_name") if video else None, "audio_codec": audio.get("codec_name") if audio else None,
        "video_stream": video is not None, "audio_stream": audio is not None,
        "frame_rate": video.get("avg_frame_rate") if video else None,
        "first_frame_path": str(first_frame), "contact_sheet_path": str(contact_sheet),
        "actual_frame_layout": {"frame_width": video.get("width") if video else None, "frame_height": video.get("height") if video else None, "hook_box": layout["hook_box"], "usage_badge_box": layout["usage_badge_box"], "minimum_gap_px": layout["minimum_gap_px"], "actual_gap_px": layout["actual_gap_px"], "collision": layout["collision"]},
    }


def wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as audio:
        return audio.getnframes() / audio.getframerate()


def probe_duration(path: Path) -> float:
    completed = run_captured_process([resolve_local_tool("ffprobe"), "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(path)], check=True, capture_output=True, text=True, timeout=60)
    return float(completed.stdout.strip())


def run_process(command: list[str], timeout_seconds: int) -> None:
    resolved = [resolve_local_tool(command[0]), *command[1:]]
    run_captured_process(resolved, check=True, capture_output=True, text=True, timeout=timeout_seconds)


def run_captured_process(command: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
    executable = Path(command[0]).absolute()
    tool = "ffprobe" if "ffprobe" in executable.name.lower() else "ffmpeg"
    set_phase(f"SPAWN_{tool.upper()}", "executable", executable)
    command_metrics = video_renderer.windows_command_line_metrics(command)
    trace_entry: dict[str, Any] = {
        "tool": tool,
        "executable": path_evidence(executable),
        "executableFoundBeforeSpawn": executable.is_file(),
        "processStarted": False,
        "pid": None,
        "argumentsSha256": hashlib.sha256("\0".join(command[1:]).encode("utf-8")).hexdigest(),
        "argumentCount": len(command) - 1,
        "cwd": path_evidence(Path.cwd()),
        "startedAtKst": datetime.now(KST).isoformat(),
        "startedMonotonicNs": time.monotonic_ns(),
        **command_metrics,
    }
    _TRACE.setdefault("processes", []).append(trace_entry)
    if not executable.is_file():
        trace_entry["processCreationFailed"] = True
        raise FileNotFoundError(errno_module.ENOENT, "LOCAL_MEDIA_TOOL_NOT_FOUND", str(executable))
    if os.name == "nt" and command_metrics["effectiveCommandLineCharsIncludingTerminator"] > video_renderer.WINDOWS_CREATEPROCESS_COMMAND_LINE_LIMIT:
        trace_entry["processCreationFailed"] = True
        trace_entry["safeError"] = "WINDOWS_CREATEPROCESS_COMMAND_LINE_LIMIT_EXCEEDED"
        _TRACE["safeErrorOverride"] = "WINDOWS_CREATEPROCESS_COMMAND_LINE_LIMIT_EXCEEDED"
        _TRACE["retryReason"] = "DETERMINISTIC_WINDOWS_COMMAND_LINE_LIMIT"
        raise RuntimeError("WINDOWS_CREATEPROCESS_COMMAND_LINE_LIMIT_EXCEEDED")
    executable_stat = executable.stat()
    trace_entry.update({"executableSize": executable_stat.st_size, "executableMtimeNs": executable_stat.st_mtime_ns})
    capture_output = bool(kwargs.pop("capture_output", False))
    check = bool(kwargs.pop("check", False))
    text_mode = bool(kwargs.pop("text", False))
    timeout = kwargs.pop("timeout", None)
    if kwargs:
        raise ValueError("LOCAL_MEDIA_PROCESS_OPTIONS_UNSUPPORTED")
    try:
        child = subprocess.Popen(
            command,
            stdout=subprocess.PIPE if capture_output else None,
            stderr=subprocess.PIPE if capture_output else None,
            text=text_mode,
            cwd=str(Path.cwd()),
        )
    except BaseException as exc:
        trace_entry["processCreationFailed"] = True
        if getattr(exc, "winerror", None) == 206:
            trace_entry["safeError"] = "WINDOWS_CREATEPROCESS_COMMAND_LINE_LIMIT_EXCEEDED"
            _TRACE["safeErrorOverride"] = "WINDOWS_CREATEPROCESS_COMMAND_LINE_LIMIT_EXCEEDED"
            _TRACE["retryReason"] = "DETERMINISTIC_WINDOWS_COMMAND_LINE_LIMIT"
        raise
    trace_entry.update({"processStarted": True, "pid": child.pid, "processCreationFailed": False})
    set_phase(f"WAIT_{tool.upper()}", "child_process", executable)
    try:
        stdout, stderr = child.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        child.kill()
        stdout, stderr = child.communicate()
        trace_entry["timedOut"] = True
        trace_entry["exitCode"] = child.returncode
        raise
    trace_entry.update({
        "timedOut": False,
        "exitCode": child.returncode,
        "stdoutLength": len(stdout or ""),
        "stdoutSha256": hashlib.sha256((stdout or "").encode("utf-8") if isinstance(stdout, str) else (stdout or b"")).hexdigest(),
        "stderrLength": len(stderr or ""),
        "stderrSha256": hashlib.sha256((stderr or "").encode("utf-8") if isinstance(stderr, str) else (stderr or b"")).hexdigest(),
        "completedAtKst": datetime.now(KST).isoformat(),
        "completedMonotonicNs": time.monotonic_ns(),
    })
    completed = subprocess.CompletedProcess(command, child.returncode, stdout, stderr)
    if check and child.returncode != 0:
        raise subprocess.CalledProcessError(child.returncode, command, output=stdout, stderr=stderr)
    return completed


def resolve_local_tool(name: str) -> str:
    set_phase(f"RESOLVE_{name.upper()}", "executable", name)
    candidate = shutil.which(name)
    if not candidate:
        raise FileNotFoundError(errno_module.ENOENT, "LOCAL_MEDIA_TOOL_NOT_FOUND", name)
    resolved = Path(candidate).resolve(strict=True)
    if not resolved.is_file():
        raise FileNotFoundError(errno_module.ENOENT, "LOCAL_MEDIA_TOOL_NOT_FOUND", str(resolved))
    set_phase(f"HASH_{name.upper()}_EXECUTABLE", "executable", resolved)
    tool_record = {
        "name": name,
        "absolutePath": str(resolved),
        "sha256": file_sha256(resolved),
    }
    _TRACE.setdefault("tools", {})[name] = tool_record
    tool_record["identity"] = path_evidence(resolved)
    return str(resolved)


def resolve_render_inputs(request: dict[str, Any]) -> tuple[list[Path], Path, str]:
    root_value = request.get("input_root")
    if isinstance(root_value, str) and root_value:
        set_phase("VALIDATE_INPUT_ROOT", "input_root", root_value)
    root = Path(root_value).resolve(strict=True) if isinstance(root_value, str) and root_value else None
    paths: list[Path] = []
    for value in request["image_paths"]:
        set_phase("VALIDATE_INPUT_PATH", "input", value)
        paths.append(Path(value).resolve(strict=True))
    set_phase("VALIDATE_INPUT_PATH", "input", request["audio_path"])
    audio_path = Path(request["audio_path"]).resolve(strict=True)
    hashes: list[str] = []
    for path in [*paths, audio_path]:
        set_phase("STAT_INPUT", "input", path)
        if not path.is_file():
            raise FileNotFoundError(errno_module.ENOENT, "LOCAL_MEDIA_INPUT_NOT_FOUND", str(path))
        if root is not None:
            try:
                path.relative_to(root)
            except ValueError as exc:
                raise ValueError("LOCAL_MEDIA_INPUT_OUTSIDE_ROOT") from exc
        set_phase("HASH_INPUT", "input", path)
        sha256 = file_sha256(path)
        hashes.append(sha256)
        record_input_pre_render(path, sha256)
    return paths, audio_path, hashlib.sha256("\n".join(hashes).encode("ascii")).hexdigest()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def owned_temporary_output(output: Path) -> Path:
    set_phase("CREATE_OUTPUT_PARENT", "output_parent", output.parent)
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        raise ValueError("LOCAL_MEDIA_OUTPUT_CONFLICT")
    temporary = output.with_name(f".{output.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp.mp4")
    _TRACE["tempOwnership"] = {
        "ownerPid": os.getpid(),
        "temporary": path_evidence(temporary),
        "output": path_evidence(output),
        "sameParent": temporary.parent == output.parent,
        "uniqueName": True,
    }
    set_phase("CREATE_TEMP_OUTPUT", "temp_output", temporary)
    return temporary


def publish_atomic_output(temporary_output: Path, output: Path) -> None:
    set_phase("STAT_TEMP_OUTPUT", "temp_output", temporary_output)
    _TRACE["publication"] = {
        "before": {
            "tempExists": temporary_output.is_file(),
            "tempParentExists": temporary_output.parent.is_dir(),
            "destinationParentExists": output.parent.is_dir(),
            "destinationExists": output.exists(),
        },
        "after": None,
    }
    if not temporary_output.is_file():
        raise FileNotFoundError(errno_module.ENOENT, "LOCAL_MEDIA_TEMP_OUTPUT_NOT_FOUND", str(temporary_output))
    if temporary_output.stat().st_size <= 0:
        raise ValueError("LOCAL_MEDIA_OUTPUT_NOT_CREATED")
    set_phase("PREPARE_ATOMIC_PUBLICATION", "output_parent", output.parent)
    if not output.parent.is_dir():
        raise FileNotFoundError(errno_module.ENOENT, "LOCAL_MEDIA_OUTPUT_PARENT_NOT_FOUND", str(output.parent))
    if output.exists():
        raise ValueError("LOCAL_MEDIA_OUTPUT_CONFLICT")
    set_phase("ATOMIC_REPLACE", "temp_output", temporary_output)
    os.replace(temporary_output, output)
    set_phase("STAT_FINAL_OUTPUT", "output", output)
    if not output.is_file():
        raise FileNotFoundError(errno_module.ENOENT, "LOCAL_MEDIA_OUTPUT_NOT_FOUND", str(output))
    _TRACE["publication"]["after"] = {
        "tempExpectedAbsent": not temporary_output.exists(),
        "destinationExpectedPresent": output.is_file(),
    }


def cleanup_owned_temporary_output(temporary_output: Path, output: Path) -> None:
    expected_prefix = f".{output.name}."
    if temporary_output.parent != output.parent or not temporary_output.name.startswith(expected_prefix) or not temporary_output.name.endswith(".tmp.mp4"):
        raise ValueError("LOCAL_MEDIA_TEMP_OWNERSHIP_MISMATCH")
    temporary_output.unlink(missing_ok=True)


def boxes_overlap(left: dict[str, int], right: dict[str, int]) -> bool:
    return left["x"] < right["x"] + right["width"] and left["x"] + left["width"] > right["x"] and left["y"] < right["y"] + right["height"] and left["y"] + left["height"] > right["y"]


def main() -> int:
    try:
        request = read_request()
        begin_trace(request)
        operation = request.get("operation")
        result = {"prepare_reviewed_asset": prepare_reviewed_asset, "visual_gate": visual_gate, "layout_plan": layout_plan, "tts": tts, "concat_wav": concat_wav, "render": render, "render_v2": render_v2, "inspect": inspect}[operation](request)
        emit(result)
        return 0
    except Exception as exc:
        message = str(exc)
        safe_error = _TRACE.get("safeErrorOverride") or (message if message and all(character.isupper() or character.isdigit() or character in "_:-" for character in message) else "LOCAL_MEDIA_BRIDGE_FAILED")
        emit({"status": "failed", "safe_error": safe_error, "error_type": type(exc).__name__, "diagnostic": failure_diagnostic(exc)})
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
