import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { PreparedVideoAssetRef } from "@/lib/uploads/youtube/uploadAssetContract";
import type { ProductQueueItem } from "@/types/automation";
import type { ChannelKey } from "@/uploads/multi-channel/channelProfiles";
import { isChannelKey } from "@/uploads/multi-channel/channelProfiles";
import type { V073UploadPackage } from "@/uploads/multi-channel/v073UploadPackage";
import { generateV073UploadPackages } from "@/uploads/multi-channel/v073UploadPackageGenerator";
import { V057_REUPLOAD_ASSET_PROFILE } from "@/uploads/multi-channel/v057ReuploadAssetBinding";
import { bindV099PreparedVideoAssetEvidence } from "@/uploads/youtube/v099PreparedAssetEvidenceBindingCore";
import { resolveV098PreparedVideoAssetBridge } from "@/uploads/youtube/v098PreparedVideoAssetBridge";
import {
  buildV105QueueToGenerateOnlyNextBatchReport
} from "./queueToGenerateOnlyNextBatchPlanner";

export type V106UploadPackageEvidenceMode = "dry_run" | "execute";

export type V106UploadPackageEvidenceFinalStatus =
  | "SUCCESS_V106_UPLOAD_PACKAGE_EVIDENCE_READY_NO_UPLOAD"
  | "BLOCKED_V105_NO_QUEUE_ITEM_FOR_NEXT_BATCH_NO_UPLOAD"
  | "BLOCKED_V106_UPLOAD_PACKAGE_MISSING_NO_UPLOAD"
  | "BLOCKED_V106_AFFILIATE_OR_DISCLOSURE_EVIDENCE_MISSING_NO_UPLOAD"
  | "BLOCKED_V081_VIDEO_ASSET_MISSING_NO_UPLOAD"
  | "BLOCKED_V106_SETTINGS_EVIDENCE_INCOMPLETE_NO_UPLOAD"
  | "BLOCKED_V106_EXECUTE_NOT_APPROVED_NO_UPLOAD";

export type V106UploadPackageEvidenceReport = {
  version: "v106";
  mode: "upload_package_affiliate_and_asset_evidence_no_upload";
  FINAL_STATUS: V106UploadPackageEvidenceFinalStatus;
  requestedMode: V106UploadPackageEvidenceMode;
  selectedChannelKey: ChannelKey;
  selectedItemFound: boolean;
  selectedItemShortId: string | null;
  selectedQueueStatus: ProductQueueItem["queue_status"] | null;
  selectedManualReviewStatus: ProductQueueItem["manual_review_status"] | null;
  uploadPackageFound: boolean;
  packageHashPrefix: string | null;
  packageChannelMatches: boolean;
  packageQueueItemMatches: boolean;
  titlePresent: boolean;
  descriptionPresent: boolean;
  tagsPresent: boolean;
  categoryIdPresent: boolean;
  coupangDisclosurePresent: boolean;
  affiliateEvidencePresent: boolean;
  affiliateEvidenceHashPrefix: string | null;
  rawAffiliateUrlPrinted: false;
  rawCoupangUrlPrinted: false;
  videoAssetEvidencePresent: boolean;
  videoAssetHashPrefix: string | null;
  firstFrameEvidencePresent: boolean;
  firstFrameHashPrefix: string | null;
  preparedHttpsAssetEvidencePresent: boolean;
  preparedAssetServerAccessible: boolean;
  preparedAssetHashPrefix: string | null;
  uploadExecutionAllowed: false;
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
  currentBlocker: V106UploadPackageEvidenceFinalStatus | null;
};

export type V106UploadPackageEvidenceInput = {
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
};

export async function buildV106UploadPackageEvidenceReport(
  input: V106UploadPackageEvidenceInput = {}
): Promise<V106UploadPackageEvidenceReport> {
  const env = input.env ?? process.env;
  const cwd = input.cwd ?? process.cwd();
  const selectedChannelKey = resolveChannelKey(input.selectedChannelKey ?? env.V106_CHANNEL_KEY ?? env.V105_CHANNEL_KEY);
  const requestedMode = resolveMode(input.mode ?? env.V106_MODE);

  if (requestedMode === "execute") {
    return {
      ...baseSafeReport({ selectedChannelKey, requestedMode }),
      FINAL_STATUS: "BLOCKED_V106_EXECUTE_NOT_APPROVED_NO_UPLOAD",
      currentBlocker: "BLOCKED_V106_EXECUTE_NOT_APPROVED_NO_UPLOAD"
    };
  }

  const queueItems = await readQueueItems({
    cwd,
    env,
    queueItems: input.queueItems,
    readQueueItems: input.readQueueItems
  });
  const v105Report = await buildV105QueueToGenerateOnlyNextBatchReport({
    cwd,
    env,
    selectedChannelKey,
    mode: "dry_run",
    maxBatchSize: env.V105_BATCH_SIZE ?? 1,
    now: input.now,
    queueItems
  });
  const selectedItem = findSelectedQueueItem(queueItems, {
    channelKey: selectedChannelKey,
    itemHashPrefix: v105Report.selectedItemShortId
  });

  if (!selectedItem || v105Report.FINAL_STATUS === "BLOCKED_V105_NO_QUEUE_ITEM_FOR_NEXT_BATCH_NO_UPLOAD") {
    return {
      ...baseSafeReport({ selectedChannelKey, requestedMode }),
      FINAL_STATUS: "BLOCKED_V105_NO_QUEUE_ITEM_FOR_NEXT_BATCH_NO_UPLOAD",
      currentBlocker: "BLOCKED_V105_NO_QUEUE_ITEM_FOR_NEXT_BATCH_NO_UPLOAD"
    };
  }

  const uploadPackages = await readUploadPackages({
    cwd,
    env,
    uploadPackages: input.uploadPackages,
    loadUploadPackages: input.loadUploadPackages
  });
  const uploadPackage = uploadPackages.find((item) =>
    item.channelKey === selectedChannelKey &&
    item.queueItemId === selectedItem.id
  ) ?? null;

  const evidence = summarizeUploadPackageEvidence({
    uploadPackage,
    selectedChannelKey,
    selectedItem,
    preparedVideoAssetRef: input.preparedVideoAssetRefs?.[selectedChannelKey] ?? null
  });
  const finalStatus = resolveFinalStatus(evidence);

  return {
    ...baseSafeReport({ selectedChannelKey, requestedMode }),
    FINAL_STATUS: finalStatus,
    selectedItemFound: true,
    selectedItemShortId: hashPrefix(selectedItem.id),
    selectedQueueStatus: selectedItem.queue_status,
    selectedManualReviewStatus: selectedItem.manual_review_status,
    ...evidence,
    currentBlocker: finalStatus === "SUCCESS_V106_UPLOAD_PACKAGE_EVIDENCE_READY_NO_UPLOAD" ? null : finalStatus
  };
}

function summarizeUploadPackageEvidence(input: {
  uploadPackage: V073UploadPackage | null;
  selectedChannelKey: ChannelKey;
  selectedItem: ProductQueueItem;
  preparedVideoAssetRef: PreparedVideoAssetRef | null;
}): Pick<
  V106UploadPackageEvidenceReport,
  | "uploadPackageFound"
  | "packageHashPrefix"
  | "packageChannelMatches"
  | "packageQueueItemMatches"
  | "titlePresent"
  | "descriptionPresent"
  | "tagsPresent"
  | "categoryIdPresent"
  | "coupangDisclosurePresent"
  | "affiliateEvidencePresent"
  | "affiliateEvidenceHashPrefix"
  | "videoAssetEvidencePresent"
  | "videoAssetHashPrefix"
  | "firstFrameEvidencePresent"
  | "firstFrameHashPrefix"
  | "preparedHttpsAssetEvidencePresent"
  | "preparedAssetServerAccessible"
  | "preparedAssetHashPrefix"
> {
  const uploadPackage = input.uploadPackage;
  if (!uploadPackage) {
    return {
      uploadPackageFound: false,
      packageHashPrefix: null,
      packageChannelMatches: false,
      packageQueueItemMatches: false,
      titlePresent: false,
      descriptionPresent: false,
      tagsPresent: false,
      categoryIdPresent: false,
      coupangDisclosurePresent: false,
      affiliateEvidencePresent: false,
      affiliateEvidenceHashPrefix: null,
      videoAssetEvidencePresent: false,
      videoAssetHashPrefix: null,
      firstFrameEvidencePresent: false,
      firstFrameHashPrefix: null,
      preparedHttpsAssetEvidencePresent: false,
      preparedAssetServerAccessible: false,
      preparedAssetHashPrefix: null
    };
  }

  const preparedBinding = bindV099PreparedVideoAssetEvidence({
    preparedVideoAssetRef: input.preparedVideoAssetRef,
    videoAssetHashPrefix: uploadPackage.videoAsset.hashEvidence
  });
  const preparedBridge = resolveV098PreparedVideoAssetBridge({
    uploadPackage,
    preparedVideoAssetRef: input.preparedVideoAssetRef
  });

  return {
    uploadPackageFound: true,
    packageHashPrefix: hashPrefix(uploadPackage.packageId),
    packageChannelMatches: uploadPackage.channelKey === input.selectedChannelKey,
    packageQueueItemMatches: uploadPackage.queueItemId === input.selectedItem.id,
    titlePresent: Boolean(safeTrim(uploadPackage.youtubeMetadata.title)),
    descriptionPresent: Boolean(safeTrim(uploadPackage.youtubeMetadata.description)),
    tagsPresent: Boolean(uploadPackage.youtubeMetadata.tags?.length),
    categoryIdPresent: Boolean(safeTrim(uploadPackage.youtubeMetadata.categoryId)),
    coupangDisclosurePresent: Boolean(
      uploadPackage.commentPackage.coupangPartnersDisclosurePresent ||
      containsCoupangDisclosure(uploadPackage.youtubeMetadata.description) ||
      containsCoupangDisclosure(uploadPackage.commentPackage.commentText)
    ),
    affiliateEvidencePresent: Boolean(
      uploadPackage.deeplink.status === "ready" &&
      uploadPackage.deeplink.sanitizedEvidence.affiliateUrlPresent
    ),
    affiliateEvidenceHashPrefix: safeHashPrefix(uploadPackage.deeplink.sanitizedEvidence.affiliateHashPrefix),
    videoAssetEvidencePresent: Boolean(
      safeTrim(uploadPackage.videoAsset.basename) &&
      safeTrim(uploadPackage.videoAsset.hashEvidence)
    ),
    videoAssetHashPrefix: safeHashPrefix(uploadPackage.videoAsset.hashEvidence),
    firstFrameEvidencePresent: Boolean(
      safeTrim(uploadPackage.videoAsset.firstFrameBasename) &&
      safeTrim(uploadPackage.videoAsset.firstFrameHashEvidence)
    ),
    firstFrameHashPrefix: safeHashPrefix(uploadPackage.videoAsset.firstFrameHashEvidence),
    preparedHttpsAssetEvidencePresent: preparedBridge.preparedAssetUploadableUrlPresent,
    preparedAssetServerAccessible: preparedBridge.preparedAssetServerAccessible,
    preparedAssetHashPrefix: preparedBinding.preparedAssetHashPrefix
  };
}

function resolveFinalStatus(
  evidence: Pick<
    V106UploadPackageEvidenceReport,
    | "uploadPackageFound"
    | "affiliateEvidencePresent"
    | "coupangDisclosurePresent"
    | "videoAssetEvidencePresent"
    | "firstFrameEvidencePresent"
    | "preparedHttpsAssetEvidencePresent"
    | "preparedAssetServerAccessible"
    | "titlePresent"
    | "descriptionPresent"
    | "tagsPresent"
    | "categoryIdPresent"
  >
): V106UploadPackageEvidenceFinalStatus {
  if (!evidence.uploadPackageFound) {
    return "BLOCKED_V106_UPLOAD_PACKAGE_MISSING_NO_UPLOAD";
  }
  if (!evidence.affiliateEvidencePresent || !evidence.coupangDisclosurePresent) {
    return "BLOCKED_V106_AFFILIATE_OR_DISCLOSURE_EVIDENCE_MISSING_NO_UPLOAD";
  }
  if (
    !evidence.videoAssetEvidencePresent ||
    !evidence.firstFrameEvidencePresent ||
    !evidence.preparedHttpsAssetEvidencePresent ||
    !evidence.preparedAssetServerAccessible
  ) {
    return "BLOCKED_V081_VIDEO_ASSET_MISSING_NO_UPLOAD";
  }
  if (!evidence.titlePresent || !evidence.descriptionPresent || !evidence.tagsPresent || !evidence.categoryIdPresent) {
    return "BLOCKED_V106_SETTINGS_EVIDENCE_INCOMPLETE_NO_UPLOAD";
  }
  return "SUCCESS_V106_UPLOAD_PACKAGE_EVIDENCE_READY_NO_UPLOAD";
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

async function readUploadPackages(input: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  uploadPackages?: V073UploadPackage[];
  loadUploadPackages?: () => Promise<V073UploadPackage[]>;
}) {
  if (input.uploadPackages) {
    return input.uploadPackages;
  }
  if (input.loadUploadPackages) {
    return input.loadUploadPackages();
  }
  const result = await generateV073UploadPackages({
    cwd: input.cwd,
    env: {
      ...input.env,
      V051_UPLOAD_ASSET_PROFILE: input.env.V051_UPLOAD_ASSET_PROFILE ?? V057_REUPLOAD_ASSET_PROFILE
    },
    uploadAssetProfile: input.env.V051_UPLOAD_ASSET_PROFILE ?? V057_REUPLOAD_ASSET_PROFILE
  });
  return result.packages;
}

function findSelectedQueueItem(input: ProductQueueItem[], options: {
  channelKey: ChannelKey;
  itemHashPrefix: string | null;
}) {
  if (!options.itemHashPrefix) {
    return null;
  }
  return input.find((item) =>
    item.channelKey === options.channelKey &&
    hashPrefix(item.id) === options.itemHashPrefix
  ) ?? null;
}

function baseSafeReport(input: {
  selectedChannelKey: ChannelKey;
  requestedMode: V106UploadPackageEvidenceMode;
}): V106UploadPackageEvidenceReport {
  return {
    version: "v106",
    mode: "upload_package_affiliate_and_asset_evidence_no_upload",
    FINAL_STATUS: "BLOCKED_V106_UPLOAD_PACKAGE_MISSING_NO_UPLOAD",
    requestedMode: input.requestedMode,
    selectedChannelKey: input.selectedChannelKey,
    selectedItemFound: false,
    selectedItemShortId: null,
    selectedQueueStatus: null,
    selectedManualReviewStatus: null,
    uploadPackageFound: false,
    packageHashPrefix: null,
    packageChannelMatches: false,
    packageQueueItemMatches: false,
    titlePresent: false,
    descriptionPresent: false,
    tagsPresent: false,
    categoryIdPresent: false,
    coupangDisclosurePresent: false,
    affiliateEvidencePresent: false,
    affiliateEvidenceHashPrefix: null,
    rawAffiliateUrlPrinted: false,
    rawCoupangUrlPrinted: false,
    videoAssetEvidencePresent: false,
    videoAssetHashPrefix: null,
    firstFrameEvidencePresent: false,
    firstFrameHashPrefix: null,
    preparedHttpsAssetEvidencePresent: false,
    preparedAssetServerAccessible: false,
    preparedAssetHashPrefix: null,
    uploadExecutionAllowed: false,
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
    SAFE_TO_PUBLIC_UPLOAD: false,
    currentBlocker: null
  };
}

function resolveChannelKey(value: unknown): ChannelKey {
  return isChannelKey(value) ? value : "father_jobs";
}

function resolveMode(value: unknown): V106UploadPackageEvidenceMode {
  return value === "execute" ? "execute" : "dry_run";
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

function containsCoupangDisclosure(value: string) {
  const text = value.toLowerCase();
  return (
    (text.includes("coupang") || text.includes("\uCFE0\uD321")) &&
    (
      text.includes("commission") ||
      text.includes("\uD30C\uD2B8\uB108\uC2A4") ||
      text.includes("\uC218\uC218\uB8CC")
    )
  );
}

function hashPrefix(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 10);
}

function safeHashPrefix(value: string | null | undefined) {
  const text = safeTrim(value);
  return text ? text.slice(0, 10) : null;
}

function safeTrim(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}
