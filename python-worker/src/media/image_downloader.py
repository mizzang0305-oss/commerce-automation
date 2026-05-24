from pathlib import Path
import requests


def download_image(url: str, target: Path) -> Path:
    if not url:
        raise ValueError("image_url is required")
    response = requests.get(url, timeout=60)
    response.raise_for_status()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(response.content)
    return target
