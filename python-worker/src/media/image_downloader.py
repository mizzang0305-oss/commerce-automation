from pathlib import Path
import requests


SAFE_IMAGE_DOWNLOAD_MESSAGE = (
    "상품 이미지를 다운로드하지 못했습니다. 이미지 URL과 접근 가능 여부를 확인하세요."
)
MAX_IMAGE_DOWNLOAD_BYTES = 10 * 1024 * 1024
_IMAGE_CHUNK_BYTES = 64 * 1024


class ImageDownloadError(RuntimeError):
    pass


def download_image(
    url: str,
    target: Path,
    *,
    allowed_root: Path,
    timeout_seconds: int = 20,
    max_bytes: int = MAX_IMAGE_DOWNLOAD_BYTES,
) -> Path:
    if not url or max_bytes <= 0:
        raise ImageDownloadError(SAFE_IMAGE_DOWNLOAD_MESSAGE)

    safe_target = _resolve_safe_target(target, allowed_root)

    try:
        response = requests.get(url, timeout=timeout_seconds, stream=True)
    except requests.RequestException as error:
        raise ImageDownloadError(SAFE_IMAGE_DOWNLOAD_MESSAGE) from error

    if response.status_code != 200:
        raise ImageDownloadError(SAFE_IMAGE_DOWNLOAD_MESSAGE)

    content_type = response.headers.get("Content-Type", "").lower()
    if not content_type.startswith("image/"):
        raise ImageDownloadError(SAFE_IMAGE_DOWNLOAD_MESSAGE)

    content_length = response.headers.get("Content-Length", "").strip()
    if content_length:
        try:
            if int(content_length) > max_bytes:
                raise ImageDownloadError(SAFE_IMAGE_DOWNLOAD_MESSAGE)
        except ValueError as error:
            raise ImageDownloadError(SAFE_IMAGE_DOWNLOAD_MESSAGE) from error

    payload = bytearray()
    try:
        for chunk in response.iter_content(chunk_size=_IMAGE_CHUNK_BYTES):
            if not chunk:
                continue
            if len(payload) + len(chunk) > max_bytes:
                raise ImageDownloadError(SAFE_IMAGE_DOWNLOAD_MESSAGE)
            payload.extend(chunk)
    except requests.RequestException as error:
        raise ImageDownloadError(SAFE_IMAGE_DOWNLOAD_MESSAGE) from error

    if not payload:
        raise ImageDownloadError(SAFE_IMAGE_DOWNLOAD_MESSAGE)

    safe_target.parent.mkdir(parents=True, exist_ok=True)
    safe_target.write_bytes(bytes(payload))
    return safe_target


def _resolve_safe_target(target: Path, allowed_root: Path) -> Path:
    root = allowed_root.resolve()
    resolved_target = target.resolve(strict=False)
    try:
        resolved_target.relative_to(root)
    except ValueError as error:
        raise ImageDownloadError(SAFE_IMAGE_DOWNLOAD_MESSAGE) from error
    if resolved_target == root:
        raise ImageDownloadError(SAFE_IMAGE_DOWNLOAD_MESSAGE)
    return resolved_target
