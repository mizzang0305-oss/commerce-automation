from pathlib import Path
from PIL import Image, ImageDraw


def create_thumbnail(image_path: Path, target: Path, title: str) -> Path:
    target.parent.mkdir(parents=True, exist_ok=True)
    image = Image.open(image_path).convert("RGB")
    image.thumbnail((1080, 1080))
    canvas = Image.new("RGB", (1080, 1920), (15, 23, 42))
    canvas.paste(image, ((1080 - image.width) // 2, 280))
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((80, 1320, 1000, 1620), fill=(255, 255, 255))
    draw.text((120, 1380), title[:48], fill=(15, 23, 42))
    canvas.save(target, quality=92)
    return target
