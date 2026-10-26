from pathlib import Path
import os
import requests


SAFE_IMAGE_DOWNLOAD_MESSAGE = (
    "상품 이미지를 다운로드하지 못했습니다. 이미지 URL과 접근 가능 여부를 확인하세요."
)


class ImageDownloadError(RuntimeError):
    pass


def download_image(url: str, target: Path, timeout_seconds: int = 20) -> Path:
    if not url:
        raise ImageDownloadError(SAFE_IMAGE_DOWNLOAD_MESSAGE)

    # Keep the local worker's established behavior unchanged. The cloud-only
    # path is opt-in and explicitly checks allowlisted HTTPS origins, denies
    # all redirects (including CDN -> metadata/private network), and caps bytes.
    cloud_mode = os.getenv("CLOUD_MEDIA_RUN_ENABLED", "").strip().lower() in {"1", "true", "yes"}
    if cloud_mode:
        return _download_cloud_image(url, target, timeout_seconds)

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


def _download_cloud_image(url: str, target: Path, timeout_seconds: int) -> Path:
    # Import from separate cloud module only in the explicitly enabled path.
    from cloud_media_job import _hostname, image_host_allowlist

    try:
        if _hostname(url, context="Image asset URL") not in image_host_allowlist():
            raise ImageDownloadError(SAFE_IMAGE_DOWNLOAD_MESSAGE)
    except (ValueError, RuntimeError) as exc:
        raise ImageDownloadError(SAFE_IMAGE_DOWNLOAD_MESSAGE) from exc

    max_bytes = 15 * 1024 * 1024
    partial = target.with_suffix(target.suffix + ".partial")
    try:
        # No redirects; never pass credential-bearing URLs to logs/errors.
        with requests.get(url, timeout=timeout_seconds, allow_redirects=False, stream=True) as response:
            if response.status_code != 200:
                raise ImageDownloadError(SAFE_IMAGE_DOWNLOAD_MESSAGE)
            content_type = response.headers.get("Content-Type", "").split(";")[0].strip().lower()
            if content_type not in {"image/png", "image/jpeg", "image/webp"}:
                raise ImageDownloadError(SAFE_IMAGE_DOWNLOAD_MESSAGE)
            declared_size = response.headers.get("Content-Length", "")
            if declared_size and (not declared_size.isdigit() or int(declared_size) > max_bytes):
                raise ImageDownloadError(SAFE_IMAGE_DOWNLOAD_MESSAGE)
            target.parent.mkdir(parents=True, exist_ok=True)
            size = 0
            with partial.open("wb") as output:
                for chunk in response.iter_content(chunk_size=64 * 1024):
                    size += len(chunk)
                    if size > max_bytes:
                        raise ImageDownloadError(SAFE_IMAGE_DOWNLOAD_MESSAGE)
                    output.write(chunk)
            if size == 0:
                raise ImageDownloadError(SAFE_IMAGE_DOWNLOAD_MESSAGE)
        partial.replace(target)
        return target
    except (requests.RequestException, OSError) as exc:
        raise ImageDownloadError(SAFE_IMAGE_DOWNLOAD_MESSAGE) from exc
    finally:
        partial.unlink(missing_ok=True)
