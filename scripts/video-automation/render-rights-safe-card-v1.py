"""Render three new, owned text-card MP4 candidates. No review or publication claim."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
BRIDGE = ROOT / "tools/video-automation/local_media_bridge.py"
FONT = Path(r"C:\Windows\Fonts\malgun.ttf")
DISCLOSURE = "이 포스팅은 쿠팡 파트너스 활동의 일환으로 일정액의 수수료를 제공받습니다."
VIDEOS = ("DJFlgKP4EDk", "_MWCdrYdX9M", "s4DxSs7Cy68")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def bridge(request: dict) -> dict:
    environment = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    completed = subprocess.run([sys.executable, str(BRIDGE)], input=json.dumps(request, ensure_ascii=False),
                               capture_output=True, text=True, encoding="utf-8", cwd=ROOT, env=environment, timeout=900)
    try:
        result = json.loads(completed.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError) as exc:
        raise RuntimeError("LOCAL_MEDIA_BRIDGE_RESPONSE_INVALID") from exc
    if completed.returncode or result.get("status") != "success":
        raise RuntimeError(result.get("safe_error", "LOCAL_MEDIA_BRIDGE_FAILED"))
    return result


def wrapped(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    lines: list[str] = []
    line = ""
    for word in text.split():
        candidate = (line + " " + word).strip()
        if line and draw.textbbox((0, 0), candidate, font=font)[2] > max_width:
            lines.append(line)
            line = word
        else:
            line = candidate
    if line:
        lines.append(line)
    if any(draw.textbbox((0, 0), value, font=font)[2] > max_width for value in lines):
        raise ValueError("TEXT_CARD_LINE_OVERFLOW")
    return lines


def draw_card(path: Path, name: str, product_id: str) -> None:
    if not FONT.is_file():
        raise ValueError("TEXT_CARD_FONT_MISSING")
    image = Image.new("RGB", (1080, 1920), "#101b2f")
    draw = ImageDraw.Draw(image)
    title_font = ImageFont.truetype(str(FONT), 54)
    body_font = ImageFont.truetype(str(FONT), 32)
    small_font = ImageFont.truetype(str(FONT), 27)
    draw.rounded_rectangle((64, 650, 1016, 1450), radius=44, fill="#1e3651", outline="#67e8f9", width=3)
    draw.text((100, 690), "상품 정보", font=body_font, fill="#67e8f9")
    lines = wrapped(draw, name, title_font, 850)
    if len(lines) > 5:
        raise ValueError("TEXT_CARD_NAME_OVERFLOW")
    for index, line in enumerate(lines):
        draw.text((100, 760 + index * 78), line, font=title_font, fill="white")
    draw.text((100, 1150), "실제 상품 사진 없음", font=body_font, fill="#fbbf24")
    draw.text((100, 1225), "크기 · 구성 · 가격은 판매 페이지에서 확인", font=body_font, fill="white")
    disclosure_lines = wrapped(draw, DISCLOSURE, small_font, 920)
    for index, line in enumerate(disclosure_lines):
        draw.text((100, 1315 + index * 42), line, font=small_font, fill="#d1d5db")
    draw.text((80, 1840), product_id, font=ImageFont.truetype(str(FONT), 22), fill="#93a4b8")
    image.save(path)


def render_one(audio_root: Path, output_root: Path, video_id: str) -> dict:
    source = audio_root / video_id
    evidence = json.loads((source / "audio-identity-result.json").read_text(encoding="utf-8"))
    old = source / "review-only-video-attempt-3"
    captions = json.loads((old / "captions.json").read_text(encoding="utf-8"))
    audio = source / "tts.wav"
    if evidence["historicalVideoId"] != video_id or sha256(audio) != evidence["audioSha256"]:
        raise ValueError("TEXT_CARD_AUDIO_BINDING_MISMATCH")
    if captions["audioSha256"] != evidence["audioSha256"] or captions["canonicalProductName"] != evidence["canonicalProductName"]:
        raise ValueError("TEXT_CARD_CAPTION_BINDING_MISMATCH")
    item = output_root / video_id
    item.mkdir()  # exclusive: a second run cannot overwrite reviewed bytes
    card = item / "owned-product-info-card.png"
    draw_card(card, evidence["canonicalProductName"], evidence["productId"])
    (item / "card-provenance.json").write_text(json.dumps({
        "schema": "owned-product-info-card/v1", "productId": evidence["productId"],
        "canonicalProductName": evidence["canonicalProductName"], "assetKind": "self_created_text_card",
        "sellerImageUsed": False, "productAppearanceClaimed": False,
        "unsupportedAuthenticityClaim": False, "cardSha256": sha256(card),
        "disclosure": DISCLOSURE, "audioSha256": sha256(audio),
        "pronunciationAliasEvidenceId": "OWNER_CONFIRMED_EASYBUY_IZIBAI_20260927" if video_id == "s4DxSs7Cy68" else None,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (item / "captions.json").write_text(json.dumps(captions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    label = "상품 정보 카드"
    hook = captions["cues"][0]["text"]
    if len(hook) > 24:
        hook = "구매 전 확인할 정보"
    layout = bridge({"operation": "layout_plan", "hook": hook, "usage_label": label})
    if layout.get("passed") is not True:
        raise ValueError("TEXT_CARD_LAYOUT_FAILED")
    video = item / "output.mp4"
    result = bridge({"operation": "render_v2", "output": str(video), "audio_path": str(audio),
                     "image_paths": [str(card)], "scene_roles": ["rights_safe_text_card"],
                     "visual_mode": "rights_safe_text", "source_sha256": [sha256(card)],
                     "allowed_root": str(item), "captions": captions["cues"], "hook": hook,
                     "title": evidence["canonicalProductName"], "usage_label": label,
                     "layout_plan": layout, "caption_font_px": 66, "caption_animation": "pop"})
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_name,width,height",
                            "-of", "json", str(video)], check=True, capture_output=True, text=True)
    streams = json.loads(probe.stdout)["streams"]
    if not any(stream.get("codec_name") == "h264" and stream.get("width") == 1080 and stream.get("height") == 1920 for stream in streams) or not any(stream.get("codec_name") == "aac" for stream in streams):
        raise ValueError("TEXT_CARD_MEDIA_FORMAT_INVALID")
    subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), "-f", "null", "NUL"], check=True, timeout=900)
    return {"videoId": video_id, "productId": evidence["productId"], "visualMode": "rights_safe_text",
            "videoPath": str(video), "videoSha256": sha256(video), "cardPath": str(card),
            "cardSha256": sha256(card), "audioPath": str(audio), "audioSha256": sha256(audio),
            "captionsPath": str(item / "captions.json"), "captionsSha256": sha256(item / "captions.json"),
            "renderStatus": result["status"], "mediaDecode": "pass", "acousticReview": "not_tested",
            "contentReview": "pending", "publicationReady": False, "uploadAttempted": False}


def main() -> None:
    if len(sys.argv) != 3:
        raise ValueError("TEXT_CARD_AUDIO_AND_OUTPUT_ROOT_REQUIRED")
    audio_root = Path(sys.argv[1]).resolve(strict=True)
    output_root = Path(sys.argv[2]).resolve()
    output_root.mkdir()  # exclusive evidence namespace
    results = []
    for video_id in VIDEOS:
        try:
            results.append(render_one(audio_root, output_root, video_id))
        except Exception as exc:
            results.append({"videoId": video_id, "renderStatus": "failed", "safeError": str(exc), "publicationReady": False})
    (output_root / "manifest.json").write_text(json.dumps({"schema": "rights-safe-card-render/v1",
        "results": results, "signedReceipts": 0, "publicationReadyCount": 0, "uploadAttempted": False},
        ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(results, ensure_ascii=False))


if __name__ == "__main__":
    main()
