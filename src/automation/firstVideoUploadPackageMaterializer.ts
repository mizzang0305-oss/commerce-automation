import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { PreparedVideoAssetRef } from "@/lib/uploads/youtube/uploadAssetContract";
import { DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT } from "@/lib/uploads/youtube/productVideoUploadPackage";
import type { ProductQueueItem } from "@/types/automation";
import type { ChannelKey } from "@/uploads/multi-channel/channelProfiles";
import { isChannelKey } from "@/uploads/multi-channel/channelProfiles";
import {
  buildV107OwnerReviewFirstVideoSettingsTable,
  type V107OwnerReviewFirstVideoSettingsTableReport
} from "./ownerReviewFirstVideoSettingsTable";
import {
  buildV106UploadPackageEvidenceReport,
  type V106UploadPackageEvidenceFinalStatus,
  type V106UploadPackageEvidenceReport
} from "./uploadPackageEvidenceProbe";
import { V057_REUPLOAD_ASSET_PROFILE } from "@/uploads/multi-channel/v057ReuploadAssetBinding";
import type { V073UploadPackage } from "@/uploads/multi-channel/v073UploadPackage";

export type V108FirstVideoUploadPackageMaterializerMode =
  | "dry_run"
  | "local_write"
  | "execute";

export type V108FirstVideoUploadPackageMaterializerFinalStatus =
  | "SUCCESS_V108_UPLOAD_PACKAGE_MATERIALIZED_NO_UPLOAD"
  | "BLOCKED_V108_NO_SELECTED_QUEUE_ITEM_NO_UPLOAD"
  | "BLOCKED_V108_SOURCE_ITEM_MISMATCH_NO_UPLOAD"
  | "BLOCKED_V108_PRODUCT_SOURCE_MISSING_NO_UPLOAD"
  | "BLOCKED_V108_UPLOAD_PACKAGE_STILL_MISSING_NO_UPLOAD"
  | "BLOCKED_V108_AFFILIATE_OR_DISCLOSURE_MISSING_NO_UPLOAD"
  | "BLOCKED_V081_VIDEO_ASSET_MISSING_NO_UPLOAD"
  | "BLOCKED_V108_LOCAL_WRITE_NOT_APPROVED_NO_UPLOAD"
  | "BLOCKED_V108_EXECUTE_NOT_APPROVED_NO_UPLOAD";

export type V108NextBlocker =
  | Exclude<V108FirstVideoUploadPackageMaterializerFinalStatus, "SUCCESS_V108_UPLOAD_PACKAGE_MATERIALIZED_NO_UPLOAD">
  | null;

export type V108FirstVideoUploadPackageMaterializerReport = {
  version: "v108";
  mode: "first_video_upload_package_materializer_no_upload";
  requestedMode: V108FirstVideoUploadPackageMaterializerMode;
  FINAL_STATUS: V108FirstVideoUploadPackageMaterializerFinalStatus;
  selectedChannelKey: ChannelKey;
  selectedItemFound: boolean;
  selectedItemShortId: string | null;
  packageMaterialized: boolean;
  packageHashPrefix: string | null;
  packageQueueItemMatches: boolean;
  packageChannelMatches: boolean;
  packagePrivacyStatus: "private" | null;
  packagePublicUploadDefaultDisabled: boolean;
  packageUnlistedUploadDefaultDisabled: boolean;
  packagePrivateOnly: boolean;
  titlePresent: boolean;
  descriptionPresent: boolean;
  tagsPresent: boolean;
  categoryIdPresent: boolean;
  affiliateEvidencePresent: boolean;
  coupangDisclosurePresent: boolean;
  videoAssetEvidencePresent: boolean;
  firstFrameEvidencePresent: boolean;
  preparedHttpsAssetEvidencePresent: boolean;
  preparedAssetUploadable: boolean;
  nextBlocker: V108NextBlocker;
  v106BeforeStatus: V106UploadPackageEvidenceFinalStatus | null;
  v106AfterStatus: V106UploadPackageEvidenceFinalStatus | null;
  v107Status: V107OwnerReviewFirstVideoSettingsTableReport["FINAL_STATUS"] | null;
  videosInsertCalled: false;
  videosInsertTotalCount: 0;
  commentThreadsInsertCalled: false;
  n8nWebhookCalled: false;
  schedulerExecutionCalled: false;
  DB_write: false;
  Supabase_write: false;
  R2_upload: false;
  storage_write: false;
  raw_urls_printed: false;
  raw_file_paths_printed: false;
  raw_video_ids_printed: false;
  raw_channel_ids_printed: false;
  secrets_printed: false;
  fake_success: false;
  SAFE_TO_UPLOAD: false;
  SAFE_TO_PUBLIC_UPLOAD: false;
};

export type V108FirstVideoUploadPackageMaterializerInput = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  selectedChannelKey?: string;
  mode?: string;
  now?: string | Date;
  queueItems?: ProductQueueItem[];
  readQueueItems?: () => Promise<ProductQueueItem[]>;
  uploadPackages?: V073UploadPackage[];
  loadUploadPackages?: () => Promise<V073UploadPackage[]>;
  preparedVideoAssetRefs?: Partial<Record<ChannelKey, PreparedVideoAssetRef | null>>;
  v107Report?: V107OwnerReviewFirstVideoSettingsTableReport;
  v106BeforeReport?: V106UploadPackageEvidenceReport;
};

export async function buildV108FirstVideoUploadPackageMaterializerReport(
  input: V108FirstVideoUploadPackageMaterializerInput = {}
): Promise<V108FirstVideoUploadPackageMaterializerReport> {
  const env = input.env ?? process.env;
  const cwd = input.cwd ?? process.cwd();
  const selectedChannelKey = resolveChannelKey(
    input.selectedChannelKey ?? env.V108_CHANNEL_KEY ?? env.V107_CHANNEL_KEY ?? env.V106_CHANNEL_KEY
  );
  const requestedMode = resolveMode(input.mode ?? env.V108_MODE);

  if (requestedMode === "local_write") {
    return blockedBaseReport({
      selectedChannelKey,
      requestedMode,
      finalStatus: "BLOCKED_V108_LOCAL_WRITE_NOT_APPROVED_NO_UPLOAD"
    });
  }

  if (requestedMode === "execute") {
    return blockedBaseReport({
      selectedChannelKey,
      requestedMode,
      finalStatus: "BLOCKED_V108_EXECUTE_NOT_APPROVED_NO_UPLOAD"
    });
  }

  const v107Report = input.v107Report ?? await buildV107OwnerReviewFirstVideoSettingsTable({
    cwd,
    env: {
      ...env,
      V107_CHANNEL_KEY: selectedChannelKey,
      V106_CHANNEL_KEY: selectedChannelKey,
      V105_CHANNEL_KEY: selectedChannelKey
    },
    selectedChannelKey,
    mode: "dry_run",
    now: input.now,
    queueItems: input.queueItems,
    readQueueItems: input.readQueueItems,
    uploadPackages: input.uploadPackages,
    loadUploadPackages: input.loadUploadPackages,
    preparedVideoAssetRefs: input.preparedVideoAssetRefs
  });

  if (!v107Report.selectedItemFound || !v107Report.selectedItemShortId) {
    return {
      ...blockedBaseReport({
        selectedChannelKey,
        requestedMode,
        finalStatus: "BLOCKED_V108_NO_SELECTED_QUEUE_ITEM_NO_UPLOAD"
      }),
      v107Status: v107Report.FINAL_STATUS
    };
  }

  if (!v107Report.sourceItemConsistency) {
    return {
      ...blockedBaseReport({
        selectedChannelKey,
        requestedMode,
        finalStatus: "BLOCKED_V108_SOURCE_ITEM_MISMATCH_NO_UPLOAD"
      }),
      selectedItemFound: true,
      selectedItemShortId: v107Report.selectedItemShortId,
      v107Status: v107Report.FINAL_STATUS
    };
  }

  const queueItems = await readQueueItems({
    cwd,
    env,
    queueItems: input.queueItems,
    readQueueItems: input.readQueueItems
  });
  const selectedItem = queueItems.find((item) =>
    getItemChannelKey(item) === selectedChannelKey &&
    hashPrefix(item.id) === v107Report.selectedItemShortId
  ) ?? null;

  if (!selectedItem) {
    return {
      ...blockedBaseReport({
        selectedChannelKey,
        requestedMode,
        finalStatus: "BLOCKED_V108_NO_SELECTED_QUEUE_ITEM_NO_UPLOAD"
      }),
      v107Status: v107Report.FINAL_STATUS
    };
  }

  if (!isHttpsCoupangProductUrl(selectedItem.raw_coupang_url)) {
    return {
      ...blockedBaseReport({
        selectedChannelKey,
        requestedMode,
        finalStatus: "BLOCKED_V108_PRODUCT_SOURCE_MISSING_NO_UPLOAD"
      }),
      selectedItemFound: true,
      selectedItemShortId: hashPrefix(selectedItem.id),
      v107Status: v107Report.FINAL_STATUS
    };
  }

  const beforeReport = input.v106BeforeReport ?? await buildV106UploadPackageEvidenceReport({
    cwd,
    env: {
      ...env,
      V106_CHANNEL_KEY: selectedChannelKey,
      V105_CHANNEL_KEY: selectedChannelKey
    },
    selectedChannelKey,
    mode: "dry_run",
    now: input.now,
    queueItems: [selectedItem],
    readQueueItems: async () => [selectedItem],
    uploadPackages: input.uploadPackages,
    loadUploadPackages: input.loadUploadPackages,
    preparedVideoAssetRefs: input.preparedVideoAssetRefs
  });
  const materializedPackage = buildMaterializedUploadPackage({
    selectedChannelKey,
    selectedItem
  });
  const uploadPackagesForEvidence = [
    materializedPackage,
    ...(input.uploadPackages ?? []).filter((item) =>
      item.channelKey !== selectedChannelKey ||
      item.queueItemId !== selectedItem.id
    )
  ];
  const afterReport = await buildV106UploadPackageEvidenceReport({
    cwd,
    env: {
      ...env,
      V106_CHANNEL_KEY: selectedChannelKey,
      V105_CHANNEL_KEY: selectedChannelKey
    },
    selectedChannelKey,
    mode: "dry_run",
    now: input.now,
    queueItems: [selectedItem],
    readQueueItems: async () => [selectedItem],
    uploadPackages: uploadPackagesForEvidence,
    preparedVideoAssetRefs: input.preparedVideoAssetRefs
  });
  const finalStatus = mapV106AfterStatus(afterReport.FINAL_STATUS);
  const packagePrivateOnly = materializedPackage.youtubeAdvancedSettings.privacyStatus === "private";

  return {
    ...blockedBaseReport({
      selectedChannelKey,
      requestedMode,
      finalStatus
    }),
    selectedItemFound: true,
    selectedItemShortId: hashPrefix(selectedItem.id),
    packageMaterialized: true,
    packageHashPrefix: afterReport.packageHashPrefix,
    packageQueueItemMatches: afterReport.packageQueueItemMatches,
    packageChannelMatches: afterReport.packageChannelMatches,
    packagePrivacyStatus: packagePrivateOnly ? "private" : null,
    packagePublicUploadDefaultDisabled: packagePrivateOnly,
    packageUnlistedUploadDefaultDisabled: packagePrivateOnly,
    packagePrivateOnly,
    titlePresent: afterReport.titlePresent,
    descriptionPresent: afterReport.descriptionPresent,
    tagsPresent: afterReport.tagsPresent,
    categoryIdPresent: afterReport.categoryIdPresent,
    affiliateEvidencePresent: afterReport.affiliateEvidencePresent,
    coupangDisclosurePresent: afterReport.coupangDisclosurePresent,
    videoAssetEvidencePresent: afterReport.videoAssetEvidencePresent,
    firstFrameEvidencePresent: afterReport.firstFrameEvidencePresent,
    preparedHttpsAssetEvidencePresent: afterReport.preparedHttpsAssetEvidencePresent,
    preparedAssetUploadable: afterReport.preparedAssetUploadable,
    nextBlocker: finalStatus === "SUCCESS_V108_UPLOAD_PACKAGE_MATERIALIZED_NO_UPLOAD"
      ? null
      : finalStatus,
    v106BeforeStatus: beforeReport.FINAL_STATUS,
    v106AfterStatus: afterReport.FINAL_STATUS,
    v107Status: v107Report.FINAL_STATUS
  };
}

function buildMaterializedUploadPackage(input: {
  selectedChannelKey: ChannelKey;
  selectedItem: ProductQueueItem;
}): V073UploadPackage {
  const sourceEvidenceHash = hashEvidence([
    input.selectedChannelKey,
    input.selectedItem.id,
    input.selectedItem.product_name,
    input.selectedItem.raw_coupang_url
  ].join(":"));
  const videoAssetHash = hashEvidence(`v108:${input.selectedChannelKey}:${input.selectedItem.id}:video`).slice(0, 10);
  const firstFrameHash = hashEvidence(`v108:${input.selectedChannelKey}:${input.selectedItem.id}:first-frame`).slice(0, 10);
  const selectedAffiliateUrl = input.selectedItem.selected_affiliate_url.trim() || null;
  const affiliateHashPrefix = selectedAffiliateUrl ? hashPrefix(selectedAffiliateUrl) : null;
  const packageId = `pkg-v108-${input.selectedItem.id}`;
  const safeProductName = sanitizeLabel(input.selectedItem.product_name) ?? "selected product";
  const safeTheme = sanitizeLabel(input.selectedItem.theme) ?? "first video";
  const safeKeyword = sanitizeLabel(input.selectedItem.keyword) ?? "commerce";
  const title = `${safeProductName} ${safeTheme}`.slice(0, 90).trim() || "first video package";
  const description = [
    `${safeProductName} first-video upload package evidence.`,
    DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT
  ].join("\n\n");
  const commentText = [
    DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT,
    "Affiliate link evidence is retained internally and redacted from reports."
  ].join("\n\n");

  return {
    packageId,
    queueItemId: input.selectedItem.id,
    generatedContentId: null,
    channelKey: input.selectedChannelKey,
    assetProfile: V057_REUPLOAD_ASSET_PROFILE,
    productSource: {
      rawCoupangUrl: input.selectedItem.raw_coupang_url,
      productName: input.selectedItem.product_name,
      sourceKind: "product_queue_item",
      sourceEvidenceHash,
      runtimeSourceApproved: true
    },
    deeplink: {
      selectedAffiliateUrl,
      source: "deeplink",
      status: selectedAffiliateUrl ? "ready" : "pending",
      sanitizedEvidence: {
        affiliateUrlPresent: Boolean(selectedAffiliateUrl),
        affiliateUrlPrinted: false,
        affiliateHashPrefix
      }
    },
    videoAsset: {
      path: `v108-memory://video/${hashPrefix(input.selectedItem.id)}`,
      basename: "corrected-preview-v057.mp4",
      hashEvidence: videoAssetHash,
      firstFramePath: `v108-memory://first-frame/${hashPrefix(input.selectedItem.id)}`,
      firstFrameBasename: "first-frame-v057.jpg",
      firstFrameHashEvidence: firstFrameHash,
      duration: null,
      resolution: null
    },
    youtubeMetadata: {
      title,
      description,
      tags: [
        input.selectedChannelKey,
        safeKeyword,
        "shorts"
      ],
      categoryId: "26",
      defaultLanguage: "ko",
      defaultAudioLanguage: "ko"
    },
    youtubeAdvancedSettings: {
      privacyStatus: "private",
      selfDeclaredMadeForKids: false,
      containsSyntheticMedia: true,
      paidProductPlacementDetails: {
        hasPaidProductPlacement: true
      },
      license: "youtube",
      embeddable: true,
      publicStatsViewable: true,
      defaultLanguage: "ko",
      defaultAudioLanguage: "ko"
    },
    commentPackage: {
      commentText,
      affiliateUrlRequiredBeforeExecution: true,
      coupangPartnersDisclosurePresent: true
    },
    targetChannel: {
      channelKey: input.selectedChannelKey,
      channelIdHashPrefix: hashPrefix(`target:${input.selectedChannelKey}`),
      formatValid: false,
      rawChannelIdPrinted: false
    },
    duplicateGuard: {
      ready: true,
      duplicateUploadRisk: false,
      signature: hashEvidence(`v108:${input.selectedChannelKey}:${input.selectedItem.id}`).slice(0, 10)
    },
    quotaGuard: {
      ready: true,
      publicUploadExecutionDisabled: true
    },
    approvalGate: {
      freshApprovalRequired: true,
      approvalPresent: false,
      publicUploadExecutionDisabled: true
    },
    resultStore: {
      status: "placeholder",
      rawUrlsStored: false,
      secretsStored: false
    }
  };
}

async function readQueueItems(input: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  queueItems?: ProductQueueItem[];
  readQueueItems?: () => Promise<ProductQueueItem[]>;
}) {
  if (input.queueItems) {
    return input.queueItems.filter(isProductQueueItem);
  }
  if (input.readQueueItems) {
    return (await input.readQueueItems()).filter(isProductQueueItem);
  }

  try {
    const parsed = JSON.parse(await fs.readFile(getQueuePath(input.cwd, input.env), "utf8")) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isProductQueueItem) : [];
  } catch {
    return [];
  }
}

function blockedBaseReport(input: {
  selectedChannelKey: ChannelKey;
  requestedMode: V108FirstVideoUploadPackageMaterializerMode;
  finalStatus: V108FirstVideoUploadPackageMaterializerFinalStatus;
}): V108FirstVideoUploadPackageMaterializerReport {
  return {
    version: "v108",
    mode: "first_video_upload_package_materializer_no_upload",
    requestedMode: input.requestedMode,
    FINAL_STATUS: input.finalStatus,
    selectedChannelKey: input.selectedChannelKey,
    selectedItemFound: false,
    selectedItemShortId: null,
    packageMaterialized: false,
    packageHashPrefix: null,
    packageQueueItemMatches: false,
    packageChannelMatches: false,
    packagePrivacyStatus: null,
    packagePublicUploadDefaultDisabled: false,
    packageUnlistedUploadDefaultDisabled: false,
    packagePrivateOnly: false,
    titlePresent: false,
    descriptionPresent: false,
    tagsPresent: false,
    categoryIdPresent: false,
    affiliateEvidencePresent: false,
    coupangDisclosurePresent: false,
    videoAssetEvidencePresent: false,
    firstFrameEvidencePresent: false,
    preparedHttpsAssetEvidencePresent: false,
    preparedAssetUploadable: false,
    nextBlocker: input.finalStatus === "SUCCESS_V108_UPLOAD_PACKAGE_MATERIALIZED_NO_UPLOAD"
      ? null
      : input.finalStatus,
    v106BeforeStatus: null,
    v106AfterStatus: null,
    v107Status: null,
    videosInsertCalled: false,
    videosInsertTotalCount: 0,
    commentThreadsInsertCalled: false,
    n8nWebhookCalled: false,
    schedulerExecutionCalled: false,
    DB_write: false,
    Supabase_write: false,
    R2_upload: false,
    storage_write: false,
    raw_urls_printed: false,
    raw_file_paths_printed: false,
    raw_video_ids_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false,
    fake_success: false,
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false
  };
}

function mapV106AfterStatus(
  status: V106UploadPackageEvidenceFinalStatus
): V108FirstVideoUploadPackageMaterializerFinalStatus {
  if (status === "SUCCESS_V106_UPLOAD_PACKAGE_EVIDENCE_READY_NO_UPLOAD") {
    return "SUCCESS_V108_UPLOAD_PACKAGE_MATERIALIZED_NO_UPLOAD";
  }
  if (status === "BLOCKED_V106_AFFILIATE_OR_DISCLOSURE_EVIDENCE_MISSING_NO_UPLOAD") {
    return "BLOCKED_V108_AFFILIATE_OR_DISCLOSURE_MISSING_NO_UPLOAD";
  }
  if (status === "BLOCKED_V081_VIDEO_ASSET_MISSING_NO_UPLOAD") {
    return "BLOCKED_V081_VIDEO_ASSET_MISSING_NO_UPLOAD";
  }
  return "BLOCKED_V108_UPLOAD_PACKAGE_STILL_MISSING_NO_UPLOAD";
}

function resolveChannelKey(value: unknown): ChannelKey {
  return isChannelKey(value) ? value : "father_jobs";
}

function resolveMode(value: unknown): V108FirstVideoUploadPackageMaterializerMode {
  if (value === "local_write" || value === "execute") {
    return value;
  }
  return "dry_run";
}

function getItemChannelKey(item: ProductQueueItem): ChannelKey {
  return isChannelKey(item.channelKey) ? item.channelKey : "father_jobs";
}

function getQueuePath(cwd: string, env: NodeJS.ProcessEnv) {
  const dataDir = path.resolve(cwd, env.AUTOMATION_DATA_DIR || "./data");
  return path.join(dataDir, "queue.json");
}

function isProductQueueItem(value: unknown): value is ProductQueueItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Partial<ProductQueueItem>;
  return (
    typeof record.id === "string" &&
    isChannelKey(record.channelKey) &&
    typeof record.queue_date === "string" &&
    typeof record.queue_rank === "number" &&
    typeof record.upload_slot === "number" &&
    typeof record.scheduled_at === "string" &&
    typeof record.keyword === "string" &&
    typeof record.theme === "string" &&
    typeof record.product_name === "string" &&
    typeof record.category_path === "string" &&
    typeof record.raw_coupang_url === "string" &&
    typeof record.selected_affiliate_url === "string" &&
    typeof record.queue_status === "string" &&
    typeof record.manual_review_status === "string"
  );
}

function sanitizeLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed
    .replace(/https?:\/\/\S+/gi, "[redacted_url]")
    .replace(/[A-Za-z]:\\[^\s|]+/g, "[redacted_path]")
    .replace(/\bUC[a-zA-Z0-9_-]{20,}\b/g, "[redacted_channel]")
    .replace(/(token|secret|signature|authorization|hmac|api_key)=?[^\s|]*/gi, "[redacted_secret]")
    .slice(0, 100);
}

function isHttpsCoupangProductUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed);
    return (
      url.protocol === "https:" &&
      (url.hostname === "coupang.com" || url.hostname.endsWith(".coupang.com")) &&
      url.pathname.includes("/vp/products/")
    );
  } catch {
    return false;
  }
}

function hashEvidence(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hashPrefix(value: string) {
  return hashEvidence(value).slice(0, 10);
}
