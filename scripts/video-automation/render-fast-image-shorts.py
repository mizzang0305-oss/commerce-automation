"""Render product-first local Shorts from reviewed stills; never upload them."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


DISCLOSURE = "※ 이 콘텐츠는 쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다."
FORBIDDEN = ("100% 정품", "최고", "무조건", "완벽", "직접 사용했다", "치료", "효능 보장", "BALMAIN")
SIZE = (720, 1280)
FPS = 30


def run(*args: str) -> None:
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL)


def digest(path: Path) -> str:
    result = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def wrap(text: str, limit: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) > limit and current:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def card(image_path: Path, title: str, caption: str, disclosure: bool, target: Path) -> None:
    original = Image.open(image_path).convert("RGB")
    canvas = Image.new("RGB", SIZE, "#101820")
    backdrop = original.copy()
    backdrop.thumbnail(SIZE)
    canvas.paste(backdrop, ((SIZE[0] - backdrop.width) // 2, (SIZE[1] - backdrop.height) // 2))
    shade = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(shade)
    draw.rectangle((0, 0, 720, 175), fill=(0, 0, 0, 190))
    draw.rectangle((0, 975, 720, 1280), fill=(0, 0, 0, 190))
    bold = ImageFont.truetype("C:/Windows/Fonts/malgunbd.ttf", 37)
    body = ImageFont.truetype("C:/Windows/Fonts/malgun.ttf", 31)
    small = ImageFont.truetype("C:/Windows/Fonts/malgun.ttf", 22)
    for index, line in enumerate(wrap(title, 18)[:2]):
        draw.text((30, 25 + index * 55), line, font=bold, fill="white")
    for index, line in enumerate(wrap(caption, 19)[:2]):
        draw.text((30, 1000 + index * 45), line, font=body, fill="white")
    if disclosure:
        for index, line in enumerate(wrap(DISCLOSURE, 30)):
            draw.text((30, 1125 + index * 31), line, font=small, fill="white")
    canvas = Image.alpha_composite(canvas.convert("RGBA"), shade).convert("RGB")
    canvas.save(target, quality=94)


def render_one(item: dict, root: Path) -> dict:
    product_id = item["productId"]
    name = item["canonicalProductName"]
    images = [Path(value).resolve(strict=True) for value in item["images"]]
    captions = item["captions"]
    if not product_id.startswith("coupang:product:") or not name.strip() or len(images) not in range(3, 9) or len(images) != len(captions):
        raise ValueError("PRODUCT_SOURCE_CONTRACT_INVALID")
    if len({digest(path) for path in images}) != len(images):
        raise ValueError("PRODUCT_IMAGES_NOT_DISTINCT")
    overlay_text = name + " " + item["displayName"] + " " + " ".join(captions) + " " + DISCLOSURE
    if "\ufffd" in overlay_text or any(term.casefold() in overlay_text.casefold() for term in FORBIDDEN):
        raise ValueError("CONTENT_UNSAFE_CLAIM")
    audio = Path(item["audioPath"]).resolve(strict=True)
    audio_end = float(item["audioEndSeconds"])
    duration = float(item.get("durationSeconds", 16))
    if not 12 <= duration <= 18 or not 0 < audio_end <= duration:
        raise ValueError("VIDEO_DURATION_INVALID")
    folder = root / item["id"]
    folder.mkdir(parents=True, exist_ok=False)
    segments: list[Path] = []
    seconds = duration / len(images)
    for index, (source, caption) in enumerate(zip(images, captions)):
        still = folder / f"still-{index}.jpg"
        segment = folder / f"segment-{index}.mp4"
        card(source, item["displayName"], caption, index == len(images) - 1, still)
        frames = round(seconds * FPS)
        run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-loop", "1", "-framerate", str(FPS), "-i", str(still),
            "-vf", f"zoompan=z='min(zoom+0.0002,1.04)':d=1:s=720x1280:fps={FPS},format=yuv420p",
            "-frames:v", str(frames), "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", str(segment))
        segments.append(segment)
    concat = folder / "concat.txt"
    concat.write_text("".join(f"file '{path.as_posix()}'\n" for path in segments), encoding="utf-8")
    output = folder / "final.mp4"
    run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(concat),
        "-i", str(audio), "-filter:a", f"atrim=duration={audio_end},afade=t=out:st={max(0, audio_end - 0.2):.2f}:d=0.2,apad",
        "-map", "0:v:0", "-map", "1:a:0", "-t", str(duration), "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(output))
    probe = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(output)], text=True))
    streams = probe["streams"]
    video = next((stream for stream in streams if stream["codec_type"] == "video"), {})
    audio_stream = next((stream for stream in streams if stream["codec_type"] == "audio"), {})
    actual_duration = float(probe["format"]["duration"])
    run("ffmpeg", "-v", "error", "-i", str(output), "-f", "null", "NUL")
    checks = {
        "PRODUCT_MATCH": item["sourceProductId"] == product_id and item["metadataProductName"] == name,
        "VIDEO_VALID": video.get("width") == 720 and video.get("height") == 1280 and bool(audio_stream) and 12 <= actual_duration <= 18,
        "CONTENT_SAFE": "\ufffd" not in overlay_text and not any(term.casefold() in overlay_text.casefold() for term in FORBIDDEN),
        "DISCLOSURE_PRESENT": DISCLOSURE in overlay_text,
    }
    result = {"schema": "fast-production-qa/v1", "id": item["id"], "productId": product_id, "canonicalProductName": name, "videoPath": str(output), "videoSha256": digest(output),
              "sourceImageSha256": [digest(path) for path in images], "audioSha256": digest(audio), "durationSeconds": actual_duration,
              "checks": checks, "publicationEligibility": "READY" if all(checks.values()) else "HOLD",
              "rightsBasis": item["rightsBasis"], "acousticHumanReview": "NOT_TESTED", "disclosureText": DISCLOSURE}
    (folder / "fast-production-qa.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


def main() -> None:
    config = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    root = Path(config["outputRoot"]).resolve()
    root.mkdir(parents=True, exist_ok=False)
    results = []
    for item in config["items"]:
        try:
            results.append(render_one(item, root))
        except Exception as error:
            results.append({"id": item.get("id"), "publicationEligibility": "HOLD", "safeError": str(error) if isinstance(error, ValueError) else "RENDER_OR_QA_FAILED"})
    (root / "summary.json").write_text(json.dumps({"items": results}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"items": results}, ensure_ascii=False))


if __name__ == "__main__":
    main()
