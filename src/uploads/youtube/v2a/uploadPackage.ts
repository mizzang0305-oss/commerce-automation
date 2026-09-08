import { createHash } from "node:crypto";

import {
  YOUTUBE_UPLOAD_V2A_CANONICAL_CHANNEL_ID_PATTERN,
  YOUTUBE_UPLOAD_V2A_PACKAGE_VERSION,
  YOUTUBE_UPLOAD_V2A_SHA256_PATTERN,
  YOUTUBE_UPLOAD_V2A_SOURCE_GIT_SHA_PATTERN
} from "./constants";

export type V2AUploadVisibility = "private" | "unlisted" | "public";

export type V2AUploadPackageInput = {
  operationNamespace: string;
  productId: string;
  affiliateUrl: string;
  videoPath: string;
  videoSha256: string;
  videoSizeBytes: number;
  videoMimeType: "video/mp4";
  title: string;
  description: string;
  tags: readonly string[];
  categoryId: string;
  madeForKids: boolean;
  containsSyntheticMedia: boolean;
  notifySubscribers: false;
  visibility: V2AUploadVisibility;
  targetChannelId: string;
  sourceGitSha: string;
};

export type V2AUploadPackagePayload = V2AUploadPackageInput & {
  packageVersion: typeof YOUTUBE_UPLOAD_V2A_PACKAGE_VERSION;
};

export type V2AUploadPackage = V2AUploadPackagePayload & {
  uploadPackageDigest: string;
};

export type V2AUploadPackageExpectedBindings = V2AUploadPackageInput;

export type V2AUploadPackageBlocker =
  | "V2A_OPERATION_NAMESPACE_INVALID"
  | "V2A_PRODUCT_ID_INVALID"
  | "V2A_AFFILIATE_URL_INVALID"
  | "V2A_VIDEO_PATH_INVALID"
  | "V2A_VIDEO_SHA256_INVALID"
  | "V2A_VIDEO_SIZE_INVALID"
  | "V2A_VIDEO_MIME_TYPE_INVALID"
  | "V2A_TITLE_INVALID"
  | "V2A_DESCRIPTION_INVALID"
  | "V2A_TAGS_INVALID"
  | "V2A_CATEGORY_ID_INVALID"
  | "V2A_MADE_FOR_KIDS_INVALID"
  | "V2A_SYNTHETIC_MEDIA_DISPOSITION_INVALID"
  | "V2A_NOTIFY_SUBSCRIBERS_MUST_BE_FALSE"
  | "V2A_VISIBILITY_PUBLIC_REJECTED"
  | "V2A_VISIBILITY_UNLISTED_REJECTED"
  | "V2A_VISIBILITY_INVALID"
  | "V2A_TARGET_CHANNEL_ID_INVALID"
  | "V2A_SOURCE_GIT_SHA_INVALID"
  | "V2A_UPLOAD_PACKAGE_VERSION_MISMATCH"
  | "V2A_UPLOAD_PACKAGE_DIGEST_MISMATCH"
  | "V2A_OPERATION_NAMESPACE_MISMATCH"
  | "V2A_PRODUCT_ID_MISMATCH"
  | "V2A_AFFILIATE_URL_MISMATCH"
  | "V2A_VIDEO_PATH_MISMATCH"
  | "V2A_VIDEO_SHA256_MISMATCH"
  | "V2A_VIDEO_SIZE_MISMATCH"
  | "V2A_VIDEO_MIME_TYPE_MISMATCH"
  | "V2A_TITLE_MISMATCH"
  | "V2A_DESCRIPTION_MISMATCH"
  | "V2A_TAGS_MISMATCH"
  | "V2A_CATEGORY_ID_MISMATCH"
  | "V2A_MADE_FOR_KIDS_MISMATCH"
  | "V2A_SYNTHETIC_MEDIA_DISPOSITION_MISMATCH"
  | "V2A_NOTIFY_SUBSCRIBERS_MISMATCH"
  | "V2A_VISIBILITY_MISMATCH"
  | "V2A_TARGET_CHANNEL_ID_MISMATCH"
  | "V2A_SOURCE_GIT_SHA_MISMATCH";

export type V2AUploadPackageValidation = {
  valid: boolean;
  blockers: V2AUploadPackageBlocker[];
  computedDigest: string | null;
};

export class V2AUploadPackageError extends Error {
  readonly blockers: readonly V2AUploadPackageBlocker[];

  constructor(blockers: readonly V2AUploadPackageBlocker[]) {
    super(blockers[0] ?? "V2A_UPLOAD_PACKAGE_INVALID");
    this.name = "V2AUploadPackageError";
    this.blockers = blockers;
  }
}

export function buildV2AUploadPackage(input: V2AUploadPackageInput): V2AUploadPackage {
  const payload: V2AUploadPackagePayload = {
    packageVersion: YOUTUBE_UPLOAD_V2A_PACKAGE_VERSION,
    operationNamespace: input.operationNamespace,
    productId: input.productId,
    affiliateUrl: input.affiliateUrl,
    videoPath: input.videoPath,
    videoSha256: input.videoSha256,
    videoSizeBytes: input.videoSizeBytes,
    videoMimeType: input.videoMimeType,
    title: input.title,
    description: input.description,
    tags: [...input.tags],
    categoryId: input.categoryId,
    madeForKids: input.madeForKids,
    containsSyntheticMedia: input.containsSyntheticMedia,
    notifySubscribers: input.notifySubscribers,
    visibility: input.visibility,
    targetChannelId: input.targetChannelId,
    sourceGitSha: input.sourceGitSha
  };
  const blockers = validatePayload(payload);
  if (blockers.length > 0) {
    throw new V2AUploadPackageError(blockers);
  }

  return {
    ...payload,
    uploadPackageDigest: digestV2AUploadPackagePayload(payload)
  };
}

export function validateV2AUploadPackage(
  uploadPackage: V2AUploadPackage,
  expected?: V2AUploadPackageExpectedBindings
): V2AUploadPackageValidation {
  const payload = packagePayload(uploadPackage);
  const blockers = validatePayload(payload);
  const computedDigest = blockers.some((blocker) => blocker === "V2A_UPLOAD_PACKAGE_VERSION_MISMATCH")
    ? null
    : digestV2AUploadPackagePayload(payload);

  if (computedDigest !== uploadPackage.uploadPackageDigest) {
    blockers.push("V2A_UPLOAD_PACKAGE_DIGEST_MISMATCH");
  }
  if (expected) {
    blockers.push(...bindingMismatches(uploadPackage, expected));
  }

  return {
    valid: blockers.length === 0,
    blockers: unique(blockers),
    computedDigest
  };
}

export function digestV2AUploadPackagePayload(payload: V2AUploadPackagePayload): string {
  return createHash("sha256").update(canonicalJson(payload), "utf8").digest("hex");
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("V2A_CANONICAL_JSON_NON_FINITE_NUMBER");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const pairs = Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
    return `{${pairs.join(",")}}`;
  }
  throw new TypeError("V2A_CANONICAL_JSON_UNSUPPORTED_VALUE");
}

function packagePayload(uploadPackage: V2AUploadPackage): V2AUploadPackagePayload {
  return {
    packageVersion: uploadPackage.packageVersion,
    operationNamespace: uploadPackage.operationNamespace,
    productId: uploadPackage.productId,
    affiliateUrl: uploadPackage.affiliateUrl,
    videoPath: uploadPackage.videoPath,
    videoSha256: uploadPackage.videoSha256,
    videoSizeBytes: uploadPackage.videoSizeBytes,
    videoMimeType: uploadPackage.videoMimeType,
    title: uploadPackage.title,
    description: uploadPackage.description,
    tags: uploadPackage.tags,
    categoryId: uploadPackage.categoryId,
    madeForKids: uploadPackage.madeForKids,
    containsSyntheticMedia: uploadPackage.containsSyntheticMedia,
    notifySubscribers: uploadPackage.notifySubscribers,
    visibility: uploadPackage.visibility,
    targetChannelId: uploadPackage.targetChannelId,
    sourceGitSha: uploadPackage.sourceGitSha
  };
}

function validatePayload(payload: V2AUploadPackagePayload): V2AUploadPackageBlocker[] {
  const blockers: V2AUploadPackageBlocker[] = [];
  if (payload.packageVersion !== YOUTUBE_UPLOAD_V2A_PACKAGE_VERSION) blockers.push("V2A_UPLOAD_PACKAGE_VERSION_MISMATCH");
  if (!safeIdentifier(payload.operationNamespace)) blockers.push("V2A_OPERATION_NAMESPACE_INVALID");
  if (!safeIdentifier(payload.productId)) blockers.push("V2A_PRODUCT_ID_INVALID");
  if (!validAffiliateUrl(payload.affiliateUrl)) blockers.push("V2A_AFFILIATE_URL_INVALID");
  if (!nonEmptyText(payload.videoPath) || payload.videoPath.includes("\0")) blockers.push("V2A_VIDEO_PATH_INVALID");
  if (!YOUTUBE_UPLOAD_V2A_SHA256_PATTERN.test(payload.videoSha256)) blockers.push("V2A_VIDEO_SHA256_INVALID");
  if (!Number.isSafeInteger(payload.videoSizeBytes) || payload.videoSizeBytes <= 0) blockers.push("V2A_VIDEO_SIZE_INVALID");
  if (payload.videoMimeType !== "video/mp4") blockers.push("V2A_VIDEO_MIME_TYPE_INVALID");
  if (!safeMetadataText(payload.title, 100, false)) blockers.push("V2A_TITLE_INVALID");
  if (!safeMetadataText(payload.description, 5_000, true)) blockers.push("V2A_DESCRIPTION_INVALID");
  if (!validTags(payload.tags)) blockers.push("V2A_TAGS_INVALID");
  if (!/^[0-9]{1,3}$/u.test(payload.categoryId)) blockers.push("V2A_CATEGORY_ID_INVALID");
  if (typeof payload.madeForKids !== "boolean") blockers.push("V2A_MADE_FOR_KIDS_INVALID");
  if (typeof payload.containsSyntheticMedia !== "boolean") blockers.push("V2A_SYNTHETIC_MEDIA_DISPOSITION_INVALID");
  if (payload.notifySubscribers !== false) blockers.push("V2A_NOTIFY_SUBSCRIBERS_MUST_BE_FALSE");
  if (payload.visibility === "public") blockers.push("V2A_VISIBILITY_PUBLIC_REJECTED");
  else if (payload.visibility === "unlisted") blockers.push("V2A_VISIBILITY_UNLISTED_REJECTED");
  else if (payload.visibility !== "private") blockers.push("V2A_VISIBILITY_INVALID");
  if (!YOUTUBE_UPLOAD_V2A_CANONICAL_CHANNEL_ID_PATTERN.test(payload.targetChannelId)) blockers.push("V2A_TARGET_CHANNEL_ID_INVALID");
  if (!YOUTUBE_UPLOAD_V2A_SOURCE_GIT_SHA_PATTERN.test(payload.sourceGitSha)) blockers.push("V2A_SOURCE_GIT_SHA_INVALID");
  return blockers;
}

function bindingMismatches(
  uploadPackage: V2AUploadPackage,
  expected: V2AUploadPackageExpectedBindings
): V2AUploadPackageBlocker[] {
  const blockers: V2AUploadPackageBlocker[] = [];
  compare(uploadPackage.operationNamespace, expected.operationNamespace, "V2A_OPERATION_NAMESPACE_MISMATCH", blockers);
  compare(uploadPackage.productId, expected.productId, "V2A_PRODUCT_ID_MISMATCH", blockers);
  compare(uploadPackage.affiliateUrl, expected.affiliateUrl, "V2A_AFFILIATE_URL_MISMATCH", blockers);
  compare(uploadPackage.videoPath, expected.videoPath, "V2A_VIDEO_PATH_MISMATCH", blockers);
  compare(uploadPackage.videoSha256, expected.videoSha256, "V2A_VIDEO_SHA256_MISMATCH", blockers);
  compare(uploadPackage.videoSizeBytes, expected.videoSizeBytes, "V2A_VIDEO_SIZE_MISMATCH", blockers);
  compare(uploadPackage.videoMimeType, expected.videoMimeType, "V2A_VIDEO_MIME_TYPE_MISMATCH", blockers);
  compare(uploadPackage.title, expected.title, "V2A_TITLE_MISMATCH", blockers);
  compare(uploadPackage.description, expected.description, "V2A_DESCRIPTION_MISMATCH", blockers);
  if (!sameStringArray(uploadPackage.tags, expected.tags)) blockers.push("V2A_TAGS_MISMATCH");
  compare(uploadPackage.categoryId, expected.categoryId, "V2A_CATEGORY_ID_MISMATCH", blockers);
  compare(uploadPackage.madeForKids, expected.madeForKids, "V2A_MADE_FOR_KIDS_MISMATCH", blockers);
  compare(uploadPackage.containsSyntheticMedia, expected.containsSyntheticMedia, "V2A_SYNTHETIC_MEDIA_DISPOSITION_MISMATCH", blockers);
  compare(uploadPackage.notifySubscribers, expected.notifySubscribers, "V2A_NOTIFY_SUBSCRIBERS_MISMATCH", blockers);
  compare(uploadPackage.visibility, expected.visibility, "V2A_VISIBILITY_MISMATCH", blockers);
  compare(uploadPackage.targetChannelId, expected.targetChannelId, "V2A_TARGET_CHANNEL_ID_MISMATCH", blockers);
  compare(uploadPackage.sourceGitSha, expected.sourceGitSha, "V2A_SOURCE_GIT_SHA_MISMATCH", blockers);
  return blockers;
}

function compare<T>(
  actual: T,
  expected: T,
  blocker: V2AUploadPackageBlocker,
  blockers: V2AUploadPackageBlocker[]
) {
  if (actual !== expected) blockers.push(blocker);
}

function safeIdentifier(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u.test(value);
}

function nonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function safeMetadataText(value: unknown, maximumLength: number, allowNewlines: boolean): value is string {
  if (!nonEmptyText(value) || value.length > maximumLength || hasUnpairedSurrogate(value)) return false;
  const rejectedControls = allowNewlines
    ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\r]/u
    : /[\u0000-\u001F\u007F-\u009F]/u;
  return !rejectedControls.test(value);
}

function hasUnpairedSurrogate(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function validAffiliateUrl(value: unknown) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function validTags(value: unknown): value is readonly string[] {
  return Array.isArray(value) &&
    value.length <= 25 &&
    value.every((tag) => safeMetadataText(tag, 60, false));
}

function sameStringArray(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function unique<T>(values: readonly T[]) {
  return [...new Set(values)];
}
