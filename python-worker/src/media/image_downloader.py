from pathlib import Path
import requests


SAFE_IMAGE_DOWNLOAD_MESSAGE = (
    "상품 이미지를 다운로드하지 못했습니다. 이미지 URL과 접근 가능 여부를 확인하세요."
)


class ImageDownloadError(RuntimeError):
    pass


def download_image(url: str, target: Path, timeout_seconds: int = 20) -> Path:
    if not url:
        raise ImageDownloadError(SAFE_IMAGE_DOWNLOAD_MESSAGE)

    try:
        response = requests.get(url, timeout=timeout_seconds)
    except requests.RequestException as error:
        raise ImageDownloadError(SAFE_IMAGE_DOWNLOAD_MESSAGE) from error

    if response.status_code != 200:
        raise ImageDownloadError(SAFE_IMAGE_DOWNLOAD_MESSAGE)

    content_type = response.headers.get("Content-Type", "").lower()
    if not content_type.startswith("image/"):
        raise ImageDownloadError(SAFE_IMAGE_DOWNLOAD_MESSAGE)

    if not response.content:
        raise ImageDownloadError(SAFE_IMAGE_DOWNLOAD_MESSAGE)

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(response.content)
    return target
