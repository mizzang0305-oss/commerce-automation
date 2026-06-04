from pathlib import Path
import textwrap
from PIL import Image, ImageDraw, ImageFont

THUMBNAIL_SIZE = (1080, 1920)
THUMBNAIL_BG = (15, 23, 42)
THUMBNAIL_CARD = (255, 255, 255)
THUMBNAIL_TEXT = (15, 23, 42)


def wrap_title(title: str, max_chars: int = 18, max_lines: int = 3) -> list[str]:
    cleaned = " ".join(title.strip().split())
    lines = textwrap.wrap(
        cleaned,
        width=max_chars,
        break_long_words=True,
        break_on_hyphens=False,
    ) or [cleaned[:max_chars]]
    clipped = lines[:max_lines]
    if len(lines) > max_lines and clipped:
        clipped[-1] = clipped[-1].rstrip(" .")[: max(1, max_chars - 3)] + "..."
    return clipped


def load_font(size: int, font_path: str | None = None):
    candidates = [font_path, "C:/Windows/Fonts/malgun.ttf", "C:/Windows/Fonts/arial.ttf"]
    for candidate in candidates:
        if not candidate:
            continue
        try:
            return ImageFont.truetype(candidate, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def create_thumbnail(image_path: Path, target: Path, title: str, font_path: str | None = None) -> Path:
    target.parent.mkdir(parents=True, exist_ok=True)
    image = Image.open(image_path).convert("RGB")
    image.thumbnail((960, 1040))
    canvas = Image.new("RGB", THUMBNAIL_SIZE, THUMBNAIL_BG)
    image_x = (THUMBNAIL_SIZE[0] - image.width) // 2
    canvas.paste(image, (image_x, 260))
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((72, 1260, 1008, 1680), fill=THUMBNAIL_CARD)
    font = load_font(52, font_path=font_path)
    for index, line in enumerate(wrap_title(title, max_chars=17, max_lines=4)):
        draw.text((112, 1320 + index * 78), line, fill=THUMBNAIL_TEXT, font=font)
    canvas.save(target, quality=92)
    return target
