from pathlib import Path
import textwrap
from PIL import Image, ImageDraw

THUMBNAIL_SIZE = (1080, 1920)


def wrap_title(title: str, max_chars: int = 18, max_lines: int = 3) -> list[str]:
    lines = textwrap.wrap(title.strip(), width=max_chars) or [title.strip()[:max_chars]]
    clipped = lines[:max_lines]
    if len(lines) > max_lines and clipped:
        clipped[-1] = clipped[-1].rstrip(" .")[: max(1, max_chars - 3)] + "..."
    return clipped


def create_thumbnail(image_path: Path, target: Path, title: str) -> Path:
    target.parent.mkdir(parents=True, exist_ok=True)
    image = Image.open(image_path).convert("RGB")
    image.thumbnail((960, 1040))
    canvas = Image.new("RGB", THUMBNAIL_SIZE, (15, 23, 42))
    canvas.paste(image, ((THUMBNAIL_SIZE[0] - image.width) // 2, 300))
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((80, 1320, 1000, 1660), fill=(255, 255, 255))
    for index, line in enumerate(wrap_title(title)):
        draw.text((120, 1370 + index * 72), line, fill=(15, 23, 42))
    canvas.save(target, quality=92)
    return target
