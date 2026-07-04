import crypto from "node:crypto";

import type { ChannelKey } from "../multi-channel/channelProfiles";
import type {
  V075UploadResultStatus,
  V075UploadVisibility
} from "./v075CommentSafetyGate";

export type V076UploadResultPlatform = "youtube";
export type V076UploadResultVisibility = "public" | "private" | "unlisted" | null;
export type V076UploadResultSanitizedStatus = "stored" | "missing" | "blocked";
export type V076CommentWriterEvidenceBlocker =
  | "BLOCKED_V076_UPLOAD_RESULT_STORE_MISSING"
  | "BLOCKED_V076_UPLOAD_RESULT_STORE_MISMATCH";

export type V076UploadResultStoreInput = {
  uploadResultId: string | null;
  uploadPackageId: string;
  queueItemId: string | null;
  channelKey: ChannelKey;
  platform: V076UploadResultPlatform;
  visibility: V076UploadResultVisibility;
  uploadedAt: string | null;
  youtubeVideoId: string | null;
  channelId: string | null;
  targetChannelVerified: boolean;
  duplicateGuardPassed: boolean;
  publicUploadPackageReady: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type V076UploadResultEvidencePresent = {
  uploadResultId: boolean;
  queueItemId: boolean;
  uploadedAt: boolean;
  visibility: boolean;
  youtubeVideoIdHashPrefix: boolean;
  channelIdHashPrefix: boolean;
  targetChannelVerified: boolean;
  duplicateGuardPassed: boolean;
  publicUploadPackageReady: boolean;
};

export type V076UploadResultStoreItem = {
  uploadResultId: string | null;
  uploadPackageId: string;
  queueItemId: string | null;
  channelKey: ChannelKey;
  platform: V076UploadResultPlatform;
  visibility: V076UploadResultVisibility;
  uploadedAt: string | null;
  youtubeVideoIdHashPrefix: string | null;
  channelIdHashPrefix: string | null;
  evidencePresent: V076UploadResultEvidencePresent;
  sanitizedStatus: V076UploadResultSanitizedStatus;
  createdAt: string;
  updatedAt: string;
  rawVideoIdStored: false;
  rawChannelIdStored: false;
  rawUrlsStored: false;
  secretsStored: false;
  videos_insert_called: false;
  comment_create_update_delete_called: false;
  visibility_changed: false;
  R2_upload: false;
  DB_write: false;
  product_assets_write: false;
  safeToUpload: false;
  commentWriteAllowed: false;
  fake_success: false;
};

export type V076UploadResultStoreSanitizedReport = {
  version: "v076";
  FINAL_STATUS:
    | "SUCCESS_V076_UPLOAD_RESULT_STORE_SCAFFOLD_READY_NO_UPLOAD"
    | "BLOCKED_V076_UPLOAD_RESULT_STORE_NOT_READY";
  SAFE_TO_UPLOAD: false;
  safeToUpload: false;
  uploadResultStoreReady: boolean;
  uploadResultIdPresent: boolean;
  uploadPackageId: string;
  queueItemIdPresent: boolean;
  channelKey: ChannelKey;
  platform: V076UploadResultPlatform;
  visibility: V076UploadResultVisibility;
  uploadedAtPresent: boolean;
  youtubeVideoIdHashPrefix: string | null;
  channelIdHashPrefix: string | null;
  evidencePresent: V076UploadResultEvidencePresent;
  sanitizedStatus: V076UploadResultSanitizedStatus;
  commentWriteAllowed: false;
  videos_insert_called: false;
  comment_create_update_delete_called: false;
  visibility_changed: false;
  R2_upload: false;
  DB_write: false;
  product_assets_write: false;
  raw_urls_printed: false;
  raw_video_ids_printed: false;
  raw_channel_ids_printed: false;
  secrets_printed: false;
  fake_success: false;
};

export type V076CommentWriterEvidenceGate = {
  uploadPackageId: string;
  channelKey: ChannelKey;
  uploadResultStoreEvidencePresent: boolean;
  youtubeVideoIdHashPrefixPresent: boolean;
  channelIdHashPrefixPresent: boolean;
  v075UploadResultStatus: V075UploadResultStatus;
  v075UploadVisibility: V075UploadVisibility;
  targetChannelVerified: boolean;
  duplicateGuardPassed: boolean;
  publicUploadPackageReady: boolean;
  rawVideoIdAvailable: false;
  commentWriterBlocked: boolean;
  blocker: V076CommentWriterEvidenceBlocker | null;
  commentWriteAllowed: false;
  safeToUpload: false;
  raw_urls_printed: false;
  raw_video_ids_printed: false;
  raw_channel_ids_printed: false;
  secrets_printed: false;
  fake_success: false;
};

export function buildV076UploadResultStoreItem(
  input: V076UploadResultStoreInput
): V076UploadResultStoreItem {
  const uploadResultId = trimOrNull(input.uploadResultId);
  const queueItemId = trimOrNull(input.queueItemId);
  const uploadedAt = trimOrNull(input.uploadedAt);
  const youtubeVideoIdHashPrefix = hashPrefix(input.youtubeVideoId);
  const channelIdHashPrefix = hashPrefix(input.channelId);
  const evidencePresent: V076UploadResultEvidencePresent = {
    uploadResultId: Boolean(uploadResultId),
    queueItemId: Boolean(queueItemId),
    uploadedAt: Boolean(uploadedAt),
    visibility: input.visibility !== null,
    youtubeVideoIdHashPrefix: Boolean(youtubeVideoIdHashPrefix),
    channelIdHashPrefix: Boolean(channelIdHashPrefix),
    targetChannelVerified: input.targetChannelVerified,
    duplicateGuardPassed: input.duplicateGuardPassed,
    publicUploadPackageReady: input.publicUploadPackageReady
  };

  return {
    uploadResultId,
    uploadPackageId: input.uploadPackageId,
    queueItemId,
    channelKey: input.channelKey,
    platform: input.platform,
    visibility: input.visibility,
    uploadedAt,
    youtubeVideoIdHashPrefix,
    channelIdHashPrefix,
    evidencePresent,
    sanitizedStatus: resolveSanitizedStatus(input.visibility, evidencePresent),
    createdAt: input.createdAt ?? nowIso(),
    updatedAt: input.updatedAt ?? input.createdAt ?? nowIso(),
    rawVideoIdStored: false,
    rawChannelIdStored: false,
    rawUrlsStored: false,
    secretsStored: false,
    videos_insert_called: false,
    comment_create_update_delete_called: false,
    visibility_changed: false,
    R2_upload: false,
    DB_write: false,
    product_assets_write: false,
    safeToUpload: false,
    commentWriteAllowed: false,
    fake_success: false
  };
}

export function buildV076UploadResultStoreSanitizedReport(
  item: V076UploadResultStoreItem
): V076UploadResultStoreSanitizedReport {
  const uploadResultStoreReady = item.sanitizedStatus === "stored";

  return {
    version: "v076",
    FINAL_STATUS: uploadResultStoreReady
      ? "SUCCESS_V076_UPLOAD_RESULT_STORE_SCAFFOLD_READY_NO_UPLOAD"
      : "BLOCKED_V076_UPLOAD_RESULT_STORE_NOT_READY",
    SAFE_TO_UPLOAD: false,
    safeToUpload: false,
    uploadResultStoreReady,
    uploadResultIdPresent: Boolean(item.uploadResultId),
    uploadPackageId: item.uploadPackageId,
    queueItemIdPresent: Boolean(item.queueItemId),
    channelKey: item.channelKey,
    platform: item.platform,
    visibility: item.visibility,
    uploadedAtPresent: Boolean(item.uploadedAt),
    youtubeVideoIdHashPrefix: item.youtubeVideoIdHashPrefix,
    channelIdHashPrefix: item.channelIdHashPrefix,
    evidencePresent: item.evidencePresent,
    sanitizedStatus: item.sanitizedStatus,
    commentWriteAllowed: false,
    videos_insert_called: false,
    comment_create_update_delete_called: false,
    visibility_changed: false,
    R2_upload: false,
    DB_write: false,
    product_assets_write: false,
    raw_urls_printed: false,
    raw_video_ids_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false,
    fake_success: false
  };
}

export function buildV076CommentWriterEvidenceGate(input: {
  uploadPackageId: string;
  channelKey: ChannelKey;
  storeItem: V076UploadResultStoreItem | null;
}): V076CommentWriterEvidenceGate {
  const belongsToPackage = Boolean(
    input.storeItem &&
    input.storeItem.uploadPackageId === input.uploadPackageId &&
    input.storeItem.channelKey === input.channelKey
  );
  const evidencePresent = Boolean(
    belongsToPackage &&
    input.storeItem &&
    input.storeItem.sanitizedStatus === "stored"
  );
  const blocker = resolveCommentWriterEvidenceBlocker(input.storeItem, belongsToPackage, evidencePresent);

  return {
    uploadPackageId: input.uploadPackageId,
    channelKey: input.channelKey,
    uploadResultStoreEvidencePresent: evidencePresent,
    youtubeVideoIdHashPrefixPresent: evidencePresent &&
      Boolean(input.storeItem?.youtubeVideoIdHashPrefix),
    channelIdHashPrefixPresent: evidencePresent &&
      Boolean(input.storeItem?.channelIdHashPrefix),
    v075UploadResultStatus: evidencePresent ? "uploaded_public" : "missing",
    v075UploadVisibility: evidencePresent ? input.storeItem?.visibility ?? null : null,
    targetChannelVerified: evidencePresent &&
      Boolean(input.storeItem?.evidencePresent.targetChannelVerified),
    duplicateGuardPassed: evidencePresent &&
      Boolean(input.storeItem?.evidencePresent.duplicateGuardPassed),
    publicUploadPackageReady: evidencePresent &&
      Boolean(input.storeItem?.evidencePresent.publicUploadPackageReady),
    rawVideoIdAvailable: false,
    commentWriterBlocked: !evidencePresent,
    blocker,
    commentWriteAllowed: false,
    safeToUpload: false,
    raw_urls_printed: false,
    raw_video_ids_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false,
    fake_success: false
  };
}

function resolveSanitizedStatus(
  visibility: V076UploadResultVisibility,
  evidencePresent: V076UploadResultEvidencePresent
): V076UploadResultSanitizedStatus {
  if (!Object.values(evidencePresent).every(Boolean)) {
    return "missing";
  }
  return visibility === "public" ? "stored" : "blocked";
}

function resolveCommentWriterEvidenceBlocker(
  storeItem: V076UploadResultStoreItem | null,
  belongsToPackage: boolean,
  evidencePresent: boolean
): V076CommentWriterEvidenceBlocker | null {
  if (evidencePresent) {
    return null;
  }
  if (storeItem && !belongsToPackage) {
    return "BLOCKED_V076_UPLOAD_RESULT_STORE_MISMATCH";
  }
  return "BLOCKED_V076_UPLOAD_RESULT_STORE_MISSING";
}

function hashPrefix(value: string | null) {
  const normalized = trimOrNull(value);
  return normalized ? crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 10) : null;
}

function trimOrNull(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}

function nowIso() {
  return new Date().toISOString();
}
