"""Private MINZ R2 pilot storage. No bucket creation, public access or retries.

Kept separate from the legacy four-bucket StorageClient. A receipt contains
durable object identity; a signed URL is temporary review access, not publication.
"""
from hashlib import sha256
from pathlib import Path
import re
from urllib.parse import urlsplit

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

PREFIXES = {
    "video": ("rendered-videos", "video/mp4"),
    "thumbnail": ("thumbnails", "image/jpeg"),
    "subtitle": ("subtitles", "application/x-subrip; charset=utf-8"),
    "upload_package": ("upload-packages", "text/plain; charset=utf-8"),
    "audio": ("audio", "audio/wav"),
    "script": ("scripts", "text/plain; charset=utf-8"),
    "evidence": ("evidence", "application/json"),
}
MAX_ARTIFACT_BYTES = 64 * 1024 * 1024


class PrivateMediaStorage:
    def __init__(self, config, *, client=None):
        if config.storage_backend != "r2" or config.r2_media_bucket != "minz":
            raise ValueError("PRIVATE_MINZ_BUCKET_REQUIRED")
        parsed = urlsplit(config.s3_endpoint_url)
        if (parsed.scheme != "https" or parsed.username or parsed.password
                or parsed.query or parsed.fragment or parsed.path not in ("", "/")
                or parsed.port not in (None, 443)
                or not re.fullmatch(r"[a-f0-9]{32}\.r2\.cloudflarestorage\.com", parsed.hostname or "")):
            raise ValueError("EXACT_R2_ACCOUNT_ENDPOINT_REQUIRED")
        if not 60 <= config.r2_review_url_ttl_seconds <= 3600:
            raise ValueError("REVIEW_URL_TTL_OUT_OF_RANGE")
        self.config = config
        self.receipts = []
        self.client = client if client is not None else boto3.client(
            "s3", endpoint_url=config.s3_endpoint_url,
            aws_access_key_id=config.s3_access_key_id,
            aws_secret_access_key=config.s3_secret_access_key,
            region_name="auto", config=Config(signature_version="s3v4",
                retries={"total_max_attempts": 1, "mode": "standard"},
                connect_timeout=10, read_timeout=60))

    def upload(self, asset_type: str, path: Path, key: str) -> str:
        if asset_type not in PREFIXES:
            raise ValueError("UNSUPPORTED_MEDIA_TYPE")
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}/[A-Za-z0-9_-]+\.[A-Za-z0-9]{1,8}", key):
            raise ValueError("UNSAFE_MEDIA_KEY")
        source = Path(path)
        if source.is_symlink() or not source.is_file():
            raise ValueError("REGULAR_MEDIA_FILE_REQUIRED")
        size = source.stat().st_size
        if not 0 < size <= MAX_ARTIFACT_BYTES:
            raise ValueError("MEDIA_SIZE_OUT_OF_RANGE")
        prefix, content_type = PREFIXES[asset_type]
        object_key = f"media-factory/{prefix}/{key}"
        # A single bounded byte snapshot is hashed and uploaded; no hash/read race.
        data = source.read_bytes()
        if len(data) != size:
            raise ValueError("MEDIA_CHANGED_DURING_READ")
        digest = sha256(data).hexdigest()
        reused = False
        try:
            self.client.put_object(Bucket="minz", Key=object_key, Body=data,
                ContentType=content_type, Metadata={"sha256": digest}, IfNoneMatch="*")
        except ClientError as exc:
            if exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode") != 412:
                # Includes unknown ACK/timeout: never repeat PUT automatically.
                raise
            reused = True
        remote = self.client.get_object(Bucket="minz", Key=object_key)
        body = remote["Body"]
        verified = sha256()
        count = 0
        try:
            while chunk := body.read(1024 * 1024):
                count += len(chunk)
                if count > size:
                    raise ValueError("R2_READBACK_SIZE_MISMATCH")
                verified.update(chunk)
        finally:
            body.close()
        if (count != size or verified.hexdigest() != digest
                or remote.get("ContentLength") != size
                or remote.get("Metadata", {}).get("sha256") != digest
                or remote.get("ContentType") != content_type):
            raise ValueError("R2_READBACK_INTEGRITY_MISMATCH")
        self.receipts.append({"bucket": "minz", "key": object_key,
            "sha256": digest, "size_bytes": size, "content_type": content_type,
            "access": "private", "reused": reused,
            "readback_verified": True, "review_url_ttl_seconds": self.config.r2_review_url_ttl_seconds})
        return self.client.generate_presigned_url("get_object",
            Params={"Bucket": "minz", "Key": object_key},
            ExpiresIn=self.config.r2_review_url_ttl_seconds, HttpMethod="GET")
