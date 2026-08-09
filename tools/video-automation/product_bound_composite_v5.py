#!/usr/bin/env python3
"""Deterministic product-reference cutout/composite helper for V5.

The tool never synthesizes or redraws the product. It either preserves pixels from
the supplied Coupang reference image or emits a separate reference card fallback.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps, ImageStat


CANVAS_SIZE = (1080, 1920)


def flattened(image: Image.Image):
    getter = getattr(image, "get_flattened_data", None)
    return getter() if getter else image.getdata()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def open_rgb(path: Path) -> Image.Image:
    with Image.open(path) as source:
        source.load()
        return ImageOps.exif_transpose(source).convert("RGB")


def image_fingerprint(image: Image.Image) -> str:
    gray = ImageOps.grayscale(ImageOps.fit(image, (9, 8), method=Image.Resampling.LANCZOS))
    pixels = list(gray.getdata())
    bits = 0
    for index in range(64):
        if pixels[index] >= pixels[index + 1]:
            bits |= 1 << index
    return f"{bits:016x}"


def corner_background(image: Image.Image) -> tuple[int, int, int]:
    width, height = image.size
    patch = max(2, min(width, height) // 30)
    samples: list[tuple[int, int, int]] = []
    for left, top in ((0, 0), (width - patch, 0), (0, height - patch), (width - patch, height - patch)):
        crop = image.crop((left, top, left + patch, top + patch))
        samples.extend(flattened(crop))
    channels = list(zip(*samples))
    return tuple(sorted(channel)[len(channel) // 2] for channel in channels)  # type: ignore[return-value]


def build_alpha(image: Image.Image, background: tuple[int, int, int]) -> Image.Image:
    pixels = image.load()
    alpha = Image.new("L", image.size, 0)
    output = alpha.load()
    low, high = 14.0, 46.0
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue = pixels[x, y]
            distance = math.sqrt(
                (red - background[0]) ** 2
                + (green - background[1]) ** 2
                + (blue - background[2]) ** 2
            )
            if distance <= low:
                value = 0
            elif distance >= high:
                value = 255
            else:
                value = round((distance - low) / (high - low) * 255)
            output[x, y] = value
    return alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))


def alpha_metrics(alpha: Image.Image) -> dict[str, Any]:
    binary = alpha.point(lambda value: 255 if value >= 96 else 0)
    bbox = binary.getbbox()
    visible = sum(1 for value in flattened(binary) if value) / (alpha.width * alpha.height)
    border = Image.new("L", alpha.size, 0)
    draw = ImageDraw.Draw(border)
    border_width = max(1, min(alpha.size) // 100)
    draw.rectangle((0, 0, alpha.width - 1, alpha.height - 1), outline=255, width=border_width)
    border_pixels = ImageChops.multiply(binary, border)
    border_ratio = sum(1 for value in flattened(border_pixels) if value) / max(1, sum(1 for value in flattened(border) if value))
    return {
        "boundingBox": list(bbox) if bbox else None,
        "visiblePixelRatio": round(visible, 6),
        "foregroundBorderRatio": round(border_ratio, 6),
        "edgeQuality": "pass" if bbox and 0.035 <= visible <= 0.86 and border_ratio <= 0.12 else "fail",
    }


def prepare_cutout(reference: Path, output: Path) -> dict[str, Any]:
    image = open_rgb(reference)
    background = corner_background(image)
    corners = [image.getpixel((0, 0)), image.getpixel((image.width - 1, 0)), image.getpixel((0, image.height - 1)), image.getpixel((image.width - 1, image.height - 1))]
    corner_spread = max(math.dist(left, right) for left in corners for right in corners)
    alpha = build_alpha(image, background)
    metrics = alpha_metrics(alpha)
    stable = corner_spread <= 48 and metrics["edgeQuality"] == "pass"
    if stable:
        output.parent.mkdir(parents=True, exist_ok=True)
        rgba = image.convert("RGBA")
        rgba.putalpha(alpha)
        rgba.save(output, format="PNG", optimize=True)
    return {
        "ok": stable,
        "mode": "exact_alpha_cutout" if stable else "reference_card_plus_synthetic_context",
        "sourceImageSha256": sha256(reference),
        "sourceWidth": image.width,
        "sourceHeight": image.height,
        "backgroundCornerSpread": round(corner_spread, 4),
        "alphaMaskRecorded": stable,
        **metrics,
        "blocker": None if stable else "PRODUCT_REFERENCE_CUTOUT_NOT_STABLE",
    }


def seed_values(value: str) -> tuple[float, float, int, int, bool, float, float]:
    digest = hashlib.sha256(value.encode("utf-8")).digest()
    center_x = 0.38 + digest[0] / 255 * 0.24
    center_y = 0.42 + digest[1] / 255 * 0.16
    offset_x = round((digest[2] / 255 - 0.5) * 140)
    offset_y = round((digest[3] / 255 - 0.5) * 90)
    mirror_background = bool(digest[4] & 1)
    background_rotation = (digest[5] / 255 - 0.5) * 5.0
    background_zoom = 1.0 + digest[6] / 255 * 0.10
    return center_x, center_y, offset_x, offset_y, mirror_background, background_rotation, background_zoom


def fit_background(
    path: Path,
    centering: tuple[float, float],
    mirror: bool,
    rotation: float,
    zoom: float,
) -> Image.Image:
    background = open_rgb(path)
    if mirror:
        background = ImageOps.mirror(background)
    background = background.rotate(rotation, resample=Image.Resampling.BICUBIC, expand=False)
    fitted = ImageOps.fit(background, CANVAS_SIZE, method=Image.Resampling.LANCZOS, centering=centering)
    if zoom > 1.0:
        zoomed = fitted.resize((round(CANVAS_SIZE[0] * zoom), round(CANVAS_SIZE[1] * zoom)), Image.Resampling.LANCZOS)
        fitted = ImageOps.fit(zoomed, CANVAS_SIZE, method=Image.Resampling.LANCZOS, centering=centering)
    return fitted


def scaled_product(product: Image.Image, maximum: tuple[int, int]) -> tuple[Image.Image, float]:
    scale = min(1.0, maximum[0] / product.width, maximum[1] / product.height)
    if scale == 1.0:
        return product, scale
    size = (max(1, round(product.width * scale)), max(1, round(product.height * scale)))
    return product.resize(size, Image.Resampling.LANCZOS), scale


def compose(background: Path, product_path: Path, output: Path, mode: str, placement_seed: str) -> dict[str, Any]:
    center_x, center_y, offset_x, offset_y, mirror_background, background_rotation, background_zoom = seed_values(placement_seed)
    canvas = fit_background(
        background,
        (center_x, center_y),
        mirror_background,
        background_rotation,
        background_zoom,
    ).convert("RGBA")
    if mode == "exact_alpha_cutout":
        with Image.open(product_path) as opened:
            product = opened.convert("RGBA")
        product, scale = scaled_product(product, (820, 900))
        bbox = product.getchannel("A").getbbox()
        if not bbox:
            raise ValueError("PRODUCT_PIXEL_PROVENANCE_MISSING")
        product = product.crop(bbox)
        x = max(30, min(CANVAS_SIZE[0] - product.width - 30, (CANVAS_SIZE[0] - product.width) // 2 + offset_x))
        y = max(520, min(CANVAS_SIZE[1] - product.height - 120, 930 + offset_y))
        shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        ImageDraw.Draw(shadow).ellipse((x + product.width * 0.12, y + product.height - 20, x + product.width * 0.88, y + product.height + 35), fill=(0, 0, 0, 42))
        canvas = Image.alpha_composite(canvas, shadow)
        canvas.alpha_composite(product, (x, y))
        product_box = [x, y, x + product.width, y + product.height]
        generation_mode = "background_plus_exact_product_composite"
        product_pixel_source = "exact_coupang_reference"
    else:
        reference = open_rgb(product_path)
        reference, scale = scaled_product(reference, (800, 760))
        card = Image.new("RGBA", (reference.width + 36, reference.height + 82), (255, 255, 255, 255))
        card.alpha_composite(reference.convert("RGBA"), (18, 18))
        ImageDraw.Draw(card).rectangle((1, 1, card.width - 2, card.height - 2), outline=(210, 210, 210, 255), width=2)
        x = max(30, min(CANVAS_SIZE[0] - card.width - 30, (CANVAS_SIZE[0] - card.width) // 2 + offset_x))
        y = max(520, min(CANVAS_SIZE[1] - card.height - 120, 930 + offset_y))
        canvas.alpha_composite(card, (x, y))
        product_box = [x + 18, y + 18, x + 18 + reference.width, y + 18 + reference.height]
        generation_mode = "reference_card_plus_synthetic_context"
        product_pixel_source = "exact_coupang_reference"
    output.parent.mkdir(parents=True, exist_ok=True)
    rgb = canvas.convert("RGB")
    rgb.save(output, format="PNG", optimize=True)
    clipped = product_box[0] <= 0 or product_box[1] <= 0 or product_box[2] >= CANVAS_SIZE[0] or product_box[3] >= CANVAS_SIZE[1]
    return {
        "ok": not clipped,
        "generationMode": generation_mode,
        "productPixelSource": product_pixel_source,
        "productPixelProvenance": "exact_coupang_reference",
        "sourceProductImageSha256": sha256(product_path),
        "backgroundSha256": sha256(background),
        "derivedSha256": sha256(output),
        "visualFingerprint": image_fingerprint(rgb),
        "width": rgb.width,
        "height": rgb.height,
        "aspectRatio": round(rgb.width / rgb.height, 6),
        "productBoundingBox": product_box,
        "deterministicScale": round(scale, 6),
        "productClipping": clipped,
        "placementSeedSha256": hashlib.sha256(placement_seed.encode("utf-8")).hexdigest(),
        "backgroundMirrored": mirror_background,
        "backgroundRotationDegrees": round(background_rotation, 6),
        "backgroundZoom": round(background_zoom, 6),
        "decodePassed": True,
        "blocker": "PRODUCT_CLIPPING_DETECTED" if clipped else None,
    }


def validate_reference(path: Path) -> dict[str, Any]:
    image = open_rgb(path)
    grayscale = ImageOps.grayscale(image)
    stddev = ImageStat.Stat(grayscale).stddev[0]
    mostly_blank = stddev < 4.0
    minimum_size = image.width >= 320 and image.height >= 320
    return {
        "ok": minimum_size and not mostly_blank,
        "decodePassed": True,
        "width": image.width,
        "height": image.height,
        "minimumSizePassed": minimum_size,
        "mostlyBlank": mostly_blank,
        "sourceImageSha256": sha256(path),
        "visualFingerprint": image_fingerprint(image),
        "blocker": None if minimum_size and not mostly_blank else "PRODUCT_REFERENCE_IMAGE_NOT_READY",
    }


def contact_sheet(reference: Path, scenes: list[Path], output: Path) -> dict[str, Any]:
    paths = [reference, *scenes]
    thumbs = [ImageOps.contain(open_rgb(path), (360, 640), method=Image.Resampling.LANCZOS) for path in paths]
    sheet = Image.new("RGB", (360 * len(thumbs), 680), "#ececec")
    draw = ImageDraw.Draw(sheet)
    for index, thumb in enumerate(thumbs):
        x = index * 360 + (360 - thumb.width) // 2
        y = (640 - thumb.height) // 2
        sheet.paste(thumb, (x, y))
        draw.text((index * 360 + 12, 650), "REFERENCE" if index == 0 else f"SCENE {index}", fill="#111111")
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, format="JPEG", quality=90, optimize=True)
    return {"ok": True, "derivedSha256": sha256(output), "width": sheet.width, "height": sheet.height}


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser()
    commands = root.add_subparsers(dest="command", required=True)
    validate = commands.add_parser("validate-reference")
    validate.add_argument("--reference", type=Path, required=True)
    cutout = commands.add_parser("prepare-cutout")
    cutout.add_argument("--reference", type=Path, required=True)
    cutout.add_argument("--output", type=Path, required=True)
    composite = commands.add_parser("compose")
    composite.add_argument("--background", type=Path, required=True)
    composite.add_argument("--product", type=Path, required=True)
    composite.add_argument("--output", type=Path, required=True)
    composite.add_argument("--mode", choices=("exact_alpha_cutout", "reference_card_plus_synthetic_context"), required=True)
    composite.add_argument("--placement-seed", required=True)
    sheet = commands.add_parser("contact-sheet")
    sheet.add_argument("--reference", type=Path, required=True)
    sheet.add_argument("--scene", type=Path, action="append", required=True)
    sheet.add_argument("--output", type=Path, required=True)
    return root


def main() -> int:
    args = parser().parse_args()
    try:
        if args.command == "validate-reference":
            result = validate_reference(args.reference)
        elif args.command == "prepare-cutout":
            result = prepare_cutout(args.reference, args.output)
        elif args.command == "compose":
            result = compose(args.background, args.product, args.output, args.mode, args.placement_seed)
        else:
            result = contact_sheet(args.reference, args.scene, args.output)
    except Exception as error:  # fail closed and avoid printing input paths
        result = {"ok": False, "blocker": type(error).__name__, "safeMessage": str(error)[:160]}
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0 if result.get("ok") else 2


if __name__ == "__main__":
    raise SystemExit(main())
