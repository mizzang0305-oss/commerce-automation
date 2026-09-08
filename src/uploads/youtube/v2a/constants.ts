export const YOUTUBE_UPLOAD_V2A_PACKAGE_VERSION = "youtube-upload-v2a-package-v1" as const;

export const YOUTUBE_UPLOAD_V2A_PRIVATE_CANARY_READY =
  "YOUTUBE_UPLOAD_V2_PRIVATE_CANARY_READY" as const;
export const YOUTUBE_UPLOAD_V2A_PRIVATE_CANARY_BLOCKED =
  "YOUTUBE_UPLOAD_V2_PRIVATE_CANARY_BLOCKED" as const;

export const YOUTUBE_UPLOAD_SCOPE =
  "https://www.googleapis.com/auth/youtube.upload" as const;

export const YOUTUBE_UPLOAD_V2A_INTENDED_DAILY_COUNT = 69 as const;

export const YOUTUBE_UPLOAD_V2A_DEFAULT_FLAGS = Object.freeze({
  YOUTUBE_UPLOAD_ENABLED: false,
  YOUTUBE_AUTO_UPLOAD: false,
  YOUTUBE_PUBLIC_UPLOAD_ENABLED: false,
  YOUTUBE_PUBLICATION_ENABLED: false,
  PUBLIC_UPLOAD_ENABLED: false,
  SAFE_TO_UPLOAD: false
} as const);

export const YOUTUBE_UPLOAD_V2A_CANONICAL_CHANNEL_ID_PATTERN =
  /^UC[A-Za-z0-9_-]{22}$/u;

export const YOUTUBE_UPLOAD_V2A_SHA256_PATTERN = /^[a-f0-9]{64}$/u;
export const YOUTUBE_UPLOAD_V2A_SOURCE_GIT_SHA_PATTERN =
  /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
