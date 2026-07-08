import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { ProductQueueItem, QueueStatus } from "@/types/automation";
import type { PreparedVideoAssetRef } from "@/lib/uploads/youtube/uploadAssetContract";
import { generateV073UploadPackages } from "../multi-channel/v073UploadPackageGenerator";
import type { V073UploadPackage } from "../multi-channel/v073UploadPackage";
import {
  isChannelKey,
  type ChannelKey
} from "../multi-channel/channelProfiles";
import { V057_REUPLOAD_ASSET_PROFILE } from "../multi-channel/v057ReuploadAssetBinding";
import { bindV099PreparedVideoAssetEvidence } from "./v099PreparedAssetEvidenceBindingCore";
import { loadV095PrivatePilotExecutionContextForV084 } from "./v095PrivatePilotExecutionContext";

export type V102FirstVideoSettingsFinalStatus =
  | "SUCCESS_V102_FIRST_VIDEO_SETTINGS_PREFLIGHT_READY_NO_UPLOAD_NO_COMMENT"
  | "BLOCKED_NO_FIRST_VIDEO_CANDIDATE_NO_UPLOAD"
  | "BLOCKED_FIRST_VIDEO_SETTINGS_NOT_READY_NO_UPLOAD"
  | "BLOCKED_V081_VIDEO_ASSET_MISSING_NO_UPLOAD";

export type V102FirstVideoSettingsReport = {
  version: "v102";
  mode: "first_video_settings_preflight_no_upload";
  FINAL_STATUS: V102FirstVideoSettingsFinalStatus;
  selectedChannelKey: ChannelKey;
  selectedItemFound: boolean;
  selectedItemShortId: string | null;
  selectedItem: {
    itemHashPrefix: string;
    channelKey: ChannelKey;
    queue_rank: number;
    queue_status: QueueStatus;
    productNameSanitized: string;
    sourceProfile: string | null;
    created_at: string | null;
    scheduled_at: string | null;
  } | null;
  uploadPackageEvidence: {
    packageFound: boolean;
    packageHashPrefix: string | null;
    packageChannelMatches: boolean;
    queueItemMatches: boolean;
    rawPackageIdPrinted: false;
    rawQueueItemIdPrinted: false;
  };
  videoSettings: {
    titlePresent: boolean;
    titleLengthSafe: boolean;
    descriptionPresent: boolean;
    descriptionDisclosurePresent: boolean;
    tagsPresent: boolean;
    categoryIdPresent: boolean;
    visibilityLocked: "private" | "manual_upload_ready";
    publicUploadAllowed: false;
    unlistedUploadAllowed: false;
    madeForKids: false;
    selfDeclared: false;
    packageReadinessEvidencePresent: boolean;
    shortsQualityPresent: boolean;
    videoAssetEvidencePresent: boolean;
    videoAssetHashPrefix: string | null;
    firstFrameEvidencePresent: boolean;
    firstFrameHashPrefix: string | null;
    preparedHttpsAssetEvidencePresent: boolean;
    serverAccessible: boolean;
  };
  commentSettings: {
    pinnedCommentTemplatePresent: boolean;
    affiliateDisclosurePresent: boolean;
    affiliateLinkEvidencePresent: boolean;
    sanitizedCommentPreviewPresent: boolean;
    sanitizedCommentPreviewHashPrefix: string | null;
    rawAffiliateUrlPrinted: false;
    commentAutomationEnabled: false;
    commentThreadsInsertCalled: false;
  };
  videoSettingsReady: boolean;
  commentSettingsReady: boolean;
  disclosureReady: boolean;
  affiliateEvidenceReady: boolean;
  preparedAssetReady: boolean;
  currentBlocker: V102FirstVideoSettingsFinalStatus | null;
  uploadExecuteCalled: false;
  videosInsertCalled: false;
  videosInsertTotalCount: 0;
  commentThreadsInsertCalled: false;
  schedulerExecutionCalled: false;
  n8nWebhookCalled: false;
  R2_upload: false;
  DB_write: false;
  product_assets_write: false;
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

export type V102FirstVideoSettingsInput = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  selectedChannelKey?: ChannelKey;
  queueItems?: ProductQueueItem[];
  uploadPackages?: V073UploadPackage[];
  preparedVideoAssetRefs?: Partial<Record<ChannelKey, PreparedVideoAssetRef | null>>;
  loadQueueItems?: (channelKey: ChannelKey) => Promise<ProductQueueItem[]>;
  loadUploadPackages?: () => Promise<V073UploadPackage[]>;
  now?: () => string;
};

const EXCLUDED_QUEUE_STATUSES = new Set<QueueStatus>(["skipped", "hold", "error"]);

export async function buildV102FirstVideoSettingsPreflight(
  input: V102FirstVideoSettingsInput = {}
): Promise<V102FirstVideoSettingsReport> {
  const env = input.env ?? process.env;
  const cwd = input.cwd ?? env.V095_CWD ?? env.V084_CWD ?? process.cwd();
  const selectedChannelKey = await resolveSelectedChannelKey(input, cwd, env);
  const now = new Date(input.now?.() ?? new Date().toISOString());
  const [queueItems, uploadPackages] = await Promise.all([
    resolveQueueItems(input, selectedChannelKey, cwd, env),
    resolveUploadPackages(input, cwd, env)
  ]);
  const selectedItem = selectV102FirstVideoCandidate(queueItems, selectedChannelKey, now);

  if (!selectedItem) {
    return buildReport({
      finalStatus: "BLOCKED_NO_FIRST_VIDEO_CANDIDATE_NO_UPLOAD",
      selectedChannelKey,
      selectedItem: null,
      uploadPackage: null,
      preparedBinding: null
    });
  }

  const uploadPackage = uploadPackages.find((item) =>
    item.channelKey === selectedChannelKey &&
    safeTrim(item.queueItemId) === selectedItem.id
  ) ?? null;
  const preparedBinding = bindV099PreparedVideoAssetEvidence({
    preparedVideoAssetRef: input.preparedVideoAssetRefs?.[selectedChannelKey],
    videoAssetHashPrefix: uploadPackage?.videoAsset.hashEvidence ?? null
  });
  const settings = summarizeSettings(selectedItem, uploadPackage, preparedBinding.ready);
  const finalStatus = resolveFinalStatus(settings, preparedBinding.ready, uploadPackage);

  return buildReport({
    finalStatus,
    selectedChannelKey,
    selectedItem,
    uploadPackage,
    preparedBinding: {
      ready: preparedBinding.ready,
      evidencePresent: preparedBinding.preparedAssetEvidencePresent,
      uploadableUrlPresent: preparedBinding.preparedAssetUploadableUrlPresent,
      serverAccessible: preparedBinding.preparedAssetServerAccessible,
      hashPrefix: preparedBinding.preparedAssetHashPrefix
    }
  });
}

export function selectV102FirstVideoCandidate(
  items: ProductQueueItem[],
  selectedChannelKey: ChannelKey,
  now: Date = new Date()
): ProductQueueItem | null {
  const channelItems = items.filter((item) =>
    item.channelKey === selectedChannelKey &&
    !EXCLUDED_QUEUE_STATUSES.has(item.queue_status)
  );
  return firstSorted(channelItems.filter((item) =>
    item.queue_status === "scheduled" && isDue(item.scheduled_at, now)
  )) ??
    firstSorted(channelItems.filter((item) => item.queue_status === "ready_for_manual_upload")) ??
    firstSorted(channelItems.filter((item) => item.queue_status === "manual_review")) ??
    null;
}

async function resolveSelectedChannelKey(
  input: V102FirstVideoSettingsInput,
  cwd: string,
  env: NodeJS.ProcessEnv
): Promise<ChannelKey> {
  if (input.selectedChannelKey) {
    return input.selectedChannelKey;
  }

  const envChannel = env.V102_CHANNEL_KEY ?? env.V084_CHANNEL_KEY ?? env.CHANNEL_KEY;
  if (isChannelKey(envChannel)) {
    return envChannel;
  }

  try {
    const context = await loadV095PrivatePilotExecutionContextForV084({
      cwd,
      env: {
        ...env,
        V095_CWD: cwd,
        V084_PRIVATE_UPLOAD_APPROVAL_PHRASE: ""
      }
    });
    if (isChannelKey(context.values?.channelKey)) {
      return context.values.channelKey;
    }
  } catch {
    // Keep V102 usable as a pure preflight even when V095 context is absent.
  }

  return "father_jobs";
}

async function resolveQueueItems(
  input: V102FirstVideoSettingsInput,
  selectedChannelKey: ChannelKey,
  cwd: string,
  env: NodeJS.ProcessEnv
): Promise<ProductQueueItem[]> {
  if (input.queueItems) {
    return input.queueItems;
  }
  if (input.loadQueueItems) {
    return input.loadQueueItems(selectedChannelKey);
  }
  return loadLocalQueueItems(cwd, env, selectedChannelKey);
}

async function resolveUploadPackages(
  input: V102FirstVideoSettingsInput,
  cwd: string,
  env: NodeJS.ProcessEnv
): Promise<V073UploadPackage[]> {
  if (input.uploadPackages) {
    return input.uploadPackages;
  }
  if (input.loadUploadPackages) {
    return input.loadUploadPackages();
  }
  const result = await generateV073UploadPackages({
    cwd,
    env: {
      ...env,
      V051_UPLOAD_ASSET_PROFILE: env.V051_UPLOAD_ASSET_PROFILE ?? V057_REUPLOAD_ASSET_PROFILE
    },
    uploadAssetProfile: env.V051_UPLOAD_ASSET_PROFILE ?? V057_REUPLOAD_ASSET_PROFILE
  });
  return result.packages;
}

function buildReport(input: {
  finalStatus: V102FirstVideoSettingsFinalStatus;
  selectedChannelKey: ChannelKey;
  selectedItem: ProductQueueItem | null;
  uploadPackage: V073UploadPackage | null;
  preparedBinding: {
    ready: boolean;
    evidencePresent: boolean;
    uploadableUrlPresent: boolean;
    serverAccessible: boolean;
    hashPrefix: string | null;
  } | null;
}): V102FirstVideoSettingsReport {
  const selectedItem = input.selectedItem;
  const uploadPackage = input.uploadPackage;
  const prepared = input.preparedBinding;
  const settings = summarizeSettings(selectedItem, uploadPackage, prepared?.ready ?? false);

  return {
    version: "v102",
    mode: "first_video_settings_preflight_no_upload",
    FINAL_STATUS: input.finalStatus,
    selectedChannelKey: input.selectedChannelKey,
    selectedItemFound: Boolean(selectedItem),
    selectedItemShortId: selectedItem ? hashPrefix(selectedItem.id) : null,
    selectedItem: selectedItem
      ? {
        itemHashPrefix: hashPrefix(selectedItem.id),
        channelKey: input.selectedChannelKey,
        queue_rank: selectedItem.queue_rank,
        queue_status: selectedItem.queue_status,
        productNameSanitized: sanitizeLabel(selectedItem.product_name),
        sourceProfile: uploadPackage?.assetProfile ?? null,
        created_at: nullableTrim(selectedItem.created_at),
        scheduled_at: nullableTrim(selectedItem.scheduled_at)
      }
      : null,
    uploadPackageEvidence: {
      packageFound: Boolean(uploadPackage),
      packageHashPrefix: uploadPackage ? hashPrefix(uploadPackage.packageId) : null,
      packageChannelMatches: Boolean(uploadPackage && uploadPackage.channelKey === input.selectedChannelKey),
      queueItemMatches: Boolean(uploadPackage && selectedItem && uploadPackage.queueItemId === selectedItem.id),
      rawPackageIdPrinted: false,
      rawQueueItemIdPrinted: false
    },
    videoSettings: {
      ...settings.videoSettings,
      preparedHttpsAssetEvidencePresent: Boolean(prepared?.uploadableUrlPresent),
      serverAccessible: Boolean(prepared?.serverAccessible),
      videoAssetHashPrefix: prepared?.hashPrefix ?? settings.videoSettings.videoAssetHashPrefix
    },
    commentSettings: settings.commentSettings,
    videoSettingsReady: settings.videoSettingsReady && Boolean(prepared?.ready),
    commentSettingsReady: settings.commentSettingsReady,
    disclosureReady: settings.disclosureReady,
    affiliateEvidenceReady: settings.affiliateEvidenceReady,
    preparedAssetReady: Boolean(prepared?.ready),
    currentBlocker: input.finalStatus === "SUCCESS_V102_FIRST_VIDEO_SETTINGS_PREFLIGHT_READY_NO_UPLOAD_NO_COMMENT"
      ? null
      : input.finalStatus,
    uploadExecuteCalled: false,
    videosInsertCalled: false,
    videosInsertTotalCount: 0,
    commentThreadsInsertCalled: false,
    schedulerExecutionCalled: false,
    n8nWebhookCalled: false,
    R2_upload: false,
    DB_write: false,
    product_assets_write: false,
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

function summarizeSettings(
  selectedItem: ProductQueueItem | null,
  uploadPackage: V073UploadPackage | null,
  preparedAssetReady: boolean
) {
  const title = safeTrim(uploadPackage?.youtubeMetadata.title);
  const description = safeTrim(uploadPackage?.youtubeMetadata.description);
  const commentText = safeTrim(uploadPackage?.commentPackage.commentText);
  const descriptionDisclosurePresent = containsDisclosure(description);
  const affiliateEvidenceReady = Boolean(uploadPackage?.deeplink.sanitizedEvidence.affiliateUrlPresent);
  const commentDisclosurePresent = Boolean(uploadPackage?.commentPackage.coupangPartnersDisclosurePresent) ||
    containsDisclosure(commentText);
  const videoAssetEvidencePresent = Boolean(uploadPackage?.videoAsset.hashEvidence && uploadPackage.videoAsset.basename);
  const firstFrameEvidencePresent = Boolean(
    uploadPackage?.videoAsset.firstFrameHashEvidence &&
    uploadPackage.videoAsset.firstFrameBasename
  );
  const packageReadinessEvidencePresent = Boolean(
    uploadPackage &&
    title &&
    description &&
    uploadPackage.youtubeMetadata.tags?.length &&
    uploadPackage.youtubeMetadata.categoryId &&
    descriptionDisclosurePresent &&
    affiliateEvidenceReady &&
    videoAssetEvidencePresent &&
    firstFrameEvidencePresent &&
    uploadPackage.commentPackage.commentText &&
    uploadPackage.commentPackage.coupangPartnersDisclosurePresent &&
    uploadPackage.targetChannel.channelKey &&
    uploadPackage.targetChannel.formatValid &&
    uploadPackage.duplicateGuard.ready &&
    uploadPackage.duplicateGuard.duplicateUploadRisk === false &&
    uploadPackage.quotaGuard.ready &&
    uploadPackage.approvalGate.freshApprovalRequired === true &&
    uploadPackage.resultStore.status === "placeholder"
  );
  const videoSettings = {
    titlePresent: Boolean(title),
    titleLengthSafe: Boolean(title && title.length <= 100),
    descriptionPresent: Boolean(description),
    descriptionDisclosurePresent,
    tagsPresent: Boolean(uploadPackage?.youtubeMetadata.tags?.length),
    categoryIdPresent: Boolean(uploadPackage?.youtubeMetadata.categoryId),
    visibilityLocked: uploadPackage ? "private" as const : "manual_upload_ready" as const,
    publicUploadAllowed: false as const,
    unlistedUploadAllowed: false as const,
    madeForKids: false as const,
    selfDeclared: false as const,
    packageReadinessEvidencePresent,
    shortsQualityPresent: packageReadinessEvidencePresent,
    videoAssetEvidencePresent,
    videoAssetHashPrefix: safeHashPrefix(uploadPackage?.videoAsset.hashEvidence),
    firstFrameEvidencePresent,
    firstFrameHashPrefix: safeHashPrefix(uploadPackage?.videoAsset.firstFrameHashEvidence),
    preparedHttpsAssetEvidencePresent: preparedAssetReady,
    serverAccessible: preparedAssetReady
  };
  const commentSettings = {
    pinnedCommentTemplatePresent: Boolean(commentText),
    affiliateDisclosurePresent: commentDisclosurePresent,
    affiliateLinkEvidencePresent: affiliateEvidenceReady,
    sanitizedCommentPreviewPresent: Boolean(commentText),
    sanitizedCommentPreviewHashPrefix: commentText ? hashPrefix(redactUrls(commentText)) : null,
    rawAffiliateUrlPrinted: false as const,
    commentAutomationEnabled: false as const,
    commentThreadsInsertCalled: false as const
  };
  const videoSettingsReady = Boolean(
    selectedItem &&
    uploadPackage &&
    videoSettings.titlePresent &&
    videoSettings.titleLengthSafe &&
    videoSettings.descriptionPresent &&
    videoSettings.descriptionDisclosurePresent &&
    videoSettings.tagsPresent &&
    videoSettings.categoryIdPresent &&
    videoSettings.packageReadinessEvidencePresent &&
    videoSettings.videoAssetEvidencePresent &&
    videoSettings.firstFrameEvidencePresent
  );
  const commentSettingsReady = Boolean(
    uploadPackage &&
    commentSettings.pinnedCommentTemplatePresent &&
    commentSettings.affiliateDisclosurePresent &&
    commentSettings.affiliateLinkEvidencePresent
  );

  return {
    videoSettings,
    commentSettings,
    videoSettingsReady,
    commentSettingsReady,
    disclosureReady: descriptionDisclosurePresent && commentSettings.affiliateDisclosurePresent,
    affiliateEvidenceReady
  };
}

function resolveFinalStatus(
  settings: ReturnType<typeof summarizeSettings>,
  preparedReady: boolean,
  uploadPackage: V073UploadPackage | null
): V102FirstVideoSettingsFinalStatus {
  if (!uploadPackage || !settings.commentSettingsReady || !settings.disclosureReady || !settings.affiliateEvidenceReady) {
    return "BLOCKED_FIRST_VIDEO_SETTINGS_NOT_READY_NO_UPLOAD";
  }
  if (!preparedReady) {
    return "BLOCKED_V081_VIDEO_ASSET_MISSING_NO_UPLOAD";
  }
  if (!settings.videoSettingsReady) {
    return "BLOCKED_FIRST_VIDEO_SETTINGS_NOT_READY_NO_UPLOAD";
  }
  return "SUCCESS_V102_FIRST_VIDEO_SETTINGS_PREFLIGHT_READY_NO_UPLOAD_NO_COMMENT";
}

function firstSorted(items: ProductQueueItem[]) {
  return [...items].sort((a, b) =>
    a.queue_rank - b.queue_rank ||
    Date.parse(a.scheduled_at || "") - Date.parse(b.scheduled_at || "") ||
    Date.parse(a.created_at || "") - Date.parse(b.created_at || "")
  )[0] ?? null;
}

function isDue(value: string, now: Date) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= now.getTime();
}

function containsDisclosure(value: string) {
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

function redactUrls(value: string) {
  return value.replace(/https?:\/\/\S+/gi, "[url]");
}

function sanitizeLabel(value: string) {
  const text = redactUrls(safeTrim(value)).replace(/\s+/g, " ");
  return text.slice(0, 80);
}

function nullableTrim(value: string | null | undefined) {
  const text = safeTrim(value);
  return text || null;
}

function safeTrim(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

async function loadLocalQueueItems(
  cwd: string,
  env: NodeJS.ProcessEnv,
  selectedChannelKey: ChannelKey
): Promise<ProductQueueItem[]> {
  const dataDir = path.resolve(cwd, env.AUTOMATION_DATA_DIR || "./data");
  const queuePath = path.join(dataDir, "queue.json");
  try {
    const parsed = JSON.parse(await fs.readFile(queuePath, "utf8")) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isProductQueueItem).filter((item) => item.channelKey === selectedChannelKey);
  } catch {
    return [];
  }
}

function isProductQueueItem(value: unknown): value is ProductQueueItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Partial<ProductQueueItem>;
  return (
    typeof record.id === "string" &&
    isChannelKey(record.channelKey) &&
    typeof record.queue_rank === "number" &&
    typeof record.queue_status === "string" &&
    typeof record.product_name === "string"
  );
}
