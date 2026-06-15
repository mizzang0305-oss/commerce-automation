import type { ProductCandidate, ProductQueueItem } from "@/types/automation";

export type ImageReadinessStatus = "ready" | "missing_image" | "invalid_image_url";

export type ImageReadiness = {
  ready: boolean;
  status: ImageReadinessStatus;
  label: string;
  image_url: string;
  reasons: string[];
};

export type CandidateImageValidationResult =
  | { ok: true; normalized_url: string }
  | { ok: false; reason: Exclude<ImageReadinessStatus, "ready">; normalized_url: string };

const IMAGE_EXTENSION_PATTERN = /\.(?:jpe?g|png|webp)(?:$|[?#])/i;
const TRUSTED_EXTENSIONLESS_IMAGE_HOSTS = [
  "picsum.photos",
  "images.unsplash.com",
  "ads-partners.coupang.com",
  "image.coupangcdn.com",
  "thumbnail.coupangcdn.com"
];

export function normalizeImageUrl(value: string): string {
  let trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("//")) {
    trimmed = `https:${trimmed}`;
  }

  try {
    return new URL(trimmed).toString();
  } catch {
    return trimmed;
  }
}

export function isLikelyImageUrl(value: string): boolean {
  return validateCandidateImageUrl(value).ok;
}

export function validateCandidateImageUrl(value: string): CandidateImageValidationResult {
  const normalized = normalizeImageUrl(value);
  if (!normalized) {
    return { ok: false, reason: "missing_image", normalized_url: "" };
  }

  try {
    const url = new URL(normalized);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { ok: false, reason: "invalid_image_url", normalized_url: normalized };
    }

    const hostname = url.hostname.toLowerCase();
    if (
      IMAGE_EXTENSION_PATTERN.test(url.pathname) ||
      TRUSTED_EXTENSIONLESS_IMAGE_HOSTS.includes(hostname) ||
      hostname.endsWith(".coupangcdn.com")
    ) {
      return { ok: true, normalized_url: normalized };
    }

    return { ok: false, reason: "invalid_image_url", normalized_url: normalized };
  } catch {
    return { ok: false, reason: "invalid_image_url", normalized_url: normalized };
  }
}

export function pickBestCandidateImage(candidateOrQueue: ProductCandidate | ProductQueueItem | Record<string, unknown>): string {
  const directThumbnail = readString(candidateOrQueue, "thumbnail_url");
  const directImage = readString(candidateOrQueue, "image_url");
  const payload = readPayload(candidateOrQueue);
  const candidates = [
    directThumbnail,
    directImage,
    readString(payload, "thumbnail_url"),
    readString(payload, "image_url"),
    readString(payload, "source_image_url"),
    readString(payload, "product_image_url"),
    readString(payload, "productImage"),
    readString(payload, "productImageUrl"),
    readString(payload, "imagePath"),
    readString(payload, "image_path"),
    readString(payload, "image"),
    readString(payload, "thumbnail"),
    readFirstString(payload, "images")
  ];

  for (const candidate of candidates) {
    const validation = validateCandidateImageUrl(candidate);
    if (validation.ok) {
      return validation.normalized_url;
    }
  }

  return normalizeImageUrl(candidates.find((candidate) => candidate.trim()) ?? "");
}

export function buildImageReadiness(candidateOrQueue: ProductCandidate | ProductQueueItem | Record<string, unknown>): ImageReadiness {
  const imageUrl = pickBestCandidateImage(candidateOrQueue);
  const validation = validateCandidateImageUrl(imageUrl);
  if (validation.ok) {
    return {
      ready: true,
      status: "ready",
      label: "상품 이미지 준비 완료",
      image_url: validation.normalized_url,
      reasons: ["상품 이미지 URL이 있습니다."]
    };
  }

  if (validation.reason === "missing_image") {
    return {
      ready: false,
      status: "missing_image",
      label: "상품 이미지 누락",
      image_url: "",
      reasons: ["상품 이미지 URL이 없어 영상 생성이 차단됩니다."]
    };
  }

  return {
    ready: false,
    status: "invalid_image_url",
    label: "상품 이미지 URL 확인 필요",
    image_url: validation.normalized_url,
    reasons: ["상품 이미지 URL 형식을 확인해야 합니다."]
  };
}

function readPayload(value: ProductCandidate | ProductQueueItem | Record<string, unknown>): Record<string, unknown> {
  const payload = "payload" in value ? value.payload : undefined;
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
}

function readString(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  return typeof field === "string" ? field.trim() : "";
}

function readFirstString(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (!Array.isArray(field)) {
    return "";
  }
  const first = field.find((item) => typeof item === "string" && item.trim());
  return typeof first === "string" ? first.trim() : "";
}
