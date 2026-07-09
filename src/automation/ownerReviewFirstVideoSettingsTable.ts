import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { PreparedVideoAssetRef } from "@/lib/uploads/youtube/uploadAssetContract";
import type { ProductQueueItem } from "@/types/automation";
import type { ChannelKey } from "@/uploads/multi-channel/channelProfiles";
import { isChannelKey } from "@/uploads/multi-channel/channelProfiles";
import type { V073UploadPackage } from "@/uploads/multi-channel/v073UploadPackage";
import {
  buildV102FirstVideoSettingsPreflight,
  type V102FirstVideoSettingsFinalStatus,
  type V102FirstVideoSettingsReport
} from "@/uploads/youtube/v102FirstVideoSettingsPreflight";
import {
  buildV105QueueToGenerateOnlyNextBatchReport,
  type V105QueueToGenerateOnlyNextBatchFinalStatus,
  type V105QueueToGenerateOnlyNextBatchReport
} from "./queueToGenerateOnlyNextBatchPlanner";
import {
  buildV106UploadPackageEvidenceReport,
  type V106PreparedAssetBlocker,
  type V106UploadPackageEvidenceFinalStatus,
  type V106UploadPackageEvidenceReport
} from "./uploadPackageEvidenceProbe";

export type V107OwnerReviewMode = "dry_run" | "execute";

export type V107OwnerReviewFinalStatus =
  | "SUCCESS_V107_OWNER_REVIEW_TABLE_READY_NO_UPLOAD"
  | "BLOCKED_V107_NO_SELECTED_QUEUE_ITEM_NO_UPLOAD"
  | "BLOCKED_V107_SOURCE_ITEM_MISMATCH_NO_UPLOAD"
  | "BLOCKED_V107_OWNER_REVIEW_TABLE_INCOMPLETE_NO_UPLOAD"
  | "BLOCKED_V107_EXECUTE_NOT_APPROVED_NO_UPLOAD";

export type V107OwnerReviewRowStatus =
  | "present"
  | "missing"
  | "blocked"
  | "not_ready"
  | "safe_disabled";

export type V107OwnerReviewRow = {
  section: string;
  label: string;
  status: V107OwnerReviewRowStatus;
  valueSanitized: string | boolean | null;
  blocker: string | null;
  ownerAction: string;
};

export type V107CurrentBlocker =
  | V107OwnerReviewFinalStatus
  | V102FirstVideoSettingsFinalStatus
  | V105QueueToGenerateOnlyNextBatchFinalStatus
  | V106UploadPackageEvidenceFinalStatus
  | null;

type V107SourceItemConsistency = {
  v102SelectedItemMatchesV105: boolean;
  v106SelectedItemMatchesV105: boolean;
  sourceItemConsistency: boolean;
};

export type V107OwnerReviewFirstVideoSettingsTableReport = {
  version: "v107";
  mode: "owner_review_first_video_settings_table_no_upload";
  requestedMode: V107OwnerReviewMode;
  FINAL_STATUS: V107OwnerReviewFinalStatus;
  selectedChannelKey: ChannelKey;
  selectedItemFound: boolean;
  selectedItemShortId: string | null;
  eventSanitized: string | null;
  themeSanitized: string | null;
  productNameSanitized: string | null;
  queueStatus: ProductQueueItem["queue_status"] | null;
  manualReviewStatus: ProductQueueItem["manual_review_status"] | null;
  plannedPayloadMode: "generate_only" | null;
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
  videoAssetEvidencePresent: boolean;
  videoAssetHashPrefix: string | null;
  firstFrameEvidencePresent: boolean;
  firstFrameHashPrefix: string | null;
  preparedHttpsAssetEvidencePresent: boolean;
  preparedAssetServerAccessible: boolean;
  preparedAssetBindingReady: boolean;
  preparedAssetBridgeReady: boolean;
  preparedAssetBlocker: V106PreparedAssetBlocker | null;
  preparedAssetProviderAllowed: boolean;
  preparedAssetExpired: boolean | null;
  preparedAssetUploadable: boolean;
  v102Status: V102FirstVideoSettingsFinalStatus;
  v105Status: V105QueueToGenerateOnlyNextBatchFinalStatus;
  v106Status: V106UploadPackageEvidenceFinalStatus;
  v102SelectedItemShortId: string | null;
  v106SelectedItemShortId: string | null;
  v102InputConstrainedToSelectedItem: boolean;
  v102SelectedItemMatchesV105: boolean;
  v106SelectedItemMatchesV105: boolean;
  sourceItemConsistency: boolean;
  currentBlocker: V107CurrentBlocker;
  ownerReviewRows: V107OwnerReviewRow[];
  ownerReviewMarkdownTable: string;
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
  sourceReports: {
    v102: Pick<V102FirstVideoSettingsReport, "version" | "FINAL_STATUS" | "currentBlocker">;
    v105: Pick<V105QueueToGenerateOnlyNextBatchReport, "version" | "FINAL_STATUS" | "currentBlocker">;
    v106: Pick<V106UploadPackageEvidenceReport, "version" | "FINAL_STATUS" | "currentBlocker">;
  } | null;
};

export type V107OwnerReviewFirstVideoSettingsTableInput = {
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
  v102Report?: V102FirstVideoSettingsReport;
  v105Report?: V105QueueToGenerateOnlyNextBatchReport;
  v106Report?: V106UploadPackageEvidenceReport;
};

export async function buildV107OwnerReviewFirstVideoSettingsTable(
  input: V107OwnerReviewFirstVideoSettingsTableInput = {}
): Promise<V107OwnerReviewFirstVideoSettingsTableReport> {
  const env = input.env ?? process.env;
  const cwd = input.cwd ?? process.cwd();
  const selectedChannelKey = resolveChannelKey(
    input.selectedChannelKey ??
    env.V107_CHANNEL_KEY ??
    env.V106_CHANNEL_KEY ??
    env.V105_CHANNEL_KEY
  );
  const requestedMode = resolveMode(input.mode ?? env.V107_MODE);

  if (requestedMode === "execute") {
    return {
      ...baseSafeReport({ selectedChannelKey, requestedMode }),
      FINAL_STATUS: "BLOCKED_V107_EXECUTE_NOT_APPROVED_NO_UPLOAD",
      currentBlocker: "BLOCKED_V107_EXECUTE_NOT_APPROVED_NO_UPLOAD"
    };
  }

  const v105Report = input.v105Report ?? await buildV105QueueToGenerateOnlyNextBatchReport({
    cwd,
    env: {
      ...env,
      V105_CHANNEL_KEY: selectedChannelKey
    },
    selectedChannelKey,
    mode: "dry_run",
    maxBatchSize: env.V105_BATCH_SIZE ?? 1,
    now: input.now,
    queueItems: input.queueItems,
    readQueueItems: input.readQueueItems
  });

  if (!v105Report.queueItemFound || !v105Report.selectedItemShortId) {
    return {
      ...baseSafeReport({ selectedChannelKey, requestedMode }),
      FINAL_STATUS: "BLOCKED_V107_NO_SELECTED_QUEUE_ITEM_NO_UPLOAD",
      v105Status: v105Report.FINAL_STATUS,
      currentBlocker: "BLOCKED_V107_NO_SELECTED_QUEUE_ITEM_NO_UPLOAD",
      sourceReports: {
        v102: {
          version: "v102",
          FINAL_STATUS: "BLOCKED_NO_FIRST_VIDEO_CANDIDATE_NO_UPLOAD",
          currentBlocker: "BLOCKED_NO_FIRST_VIDEO_CANDIDATE_NO_UPLOAD"
        },
        v105: sourceSummary(v105Report),
        v106: {
          version: "v106",
          FINAL_STATUS: "BLOCKED_V105_NO_QUEUE_ITEM_FOR_NEXT_BATCH_NO_UPLOAD",
          currentBlocker: "BLOCKED_V105_NO_QUEUE_ITEM_FOR_NEXT_BATCH_NO_UPLOAD"
        }
      }
    };
  }

  const queueItems = await resolveQueueItemsForV107({
    cwd,
    env,
    queueItems: input.queueItems,
    readQueueItems: input.readQueueItems
  });
  const selectedQueueItem = resolveSelectedQueueItemForV107({
    queueItems,
    selectedChannelKey,
    v105Report
  });

  if (!selectedQueueItem) {
    return {
      ...baseSafeReport({ selectedChannelKey, requestedMode }),
      FINAL_STATUS: "BLOCKED_V107_NO_SELECTED_QUEUE_ITEM_NO_UPLOAD",
      v105Status: v105Report.FINAL_STATUS,
      currentBlocker: "BLOCKED_V107_NO_SELECTED_QUEUE_ITEM_NO_UPLOAD",
      sourceReports: {
        v102: {
          version: "v102",
          FINAL_STATUS: "BLOCKED_NO_FIRST_VIDEO_CANDIDATE_NO_UPLOAD",
          currentBlocker: "BLOCKED_NO_FIRST_VIDEO_CANDIDATE_NO_UPLOAD"
        },
        v105: sourceSummary(v105Report),
        v106: {
          version: "v106",
          FINAL_STATUS: "BLOCKED_V105_NO_QUEUE_ITEM_FOR_NEXT_BATCH_NO_UPLOAD",
          currentBlocker: "BLOCKED_V105_NO_QUEUE_ITEM_FOR_NEXT_BATCH_NO_UPLOAD"
        }
      }
    };
  }

  const selectedQueueItems = [selectedQueueItem];
  const v102InputConstrainedToSelectedItem = !input.v102Report;
  const [v102Report, v106Report] = await Promise.all([
    input.v102Report ?? buildV102FirstVideoSettingsPreflight({
      cwd,
      env: {
        ...env,
        V102_CHANNEL_KEY: selectedChannelKey
      },
      selectedChannelKey,
      now: () => resolveNow(input.now).toISOString(),
      queueItems: selectedQueueItems,
      uploadPackages: input.uploadPackages,
      loadQueueItems: async () => selectedQueueItems,
      loadUploadPackages: input.loadUploadPackages,
      preparedVideoAssetRefs: input.preparedVideoAssetRefs
    }),
    input.v106Report ?? buildV106UploadPackageEvidenceReport({
      cwd,
      env: {
        ...env,
        V106_CHANNEL_KEY: selectedChannelKey,
        V105_CHANNEL_KEY: selectedChannelKey
      },
      selectedChannelKey,
      mode: "dry_run",
      now: input.now,
      queueItems: selectedQueueItems,
      readQueueItems: async () => selectedQueueItems,
      uploadPackages: input.uploadPackages,
      loadUploadPackages: input.loadUploadPackages,
      preparedVideoAssetRefs: input.preparedVideoAssetRefs
    })
  ]);

  const sourceItemConsistency = assertSelectedItemConsistency({
    v105Report,
    v102Report,
    v106Report,
    selectedQueueItem,
    v102InputConstrainedToSelectedItem
  });
  const firstPayloadItem = v105Report.plannedPayload?.items[0] ?? null;
  const eventSanitized = sanitizeLabel(firstPayloadItem?.themeSanitized ?? null);
  const themeSanitized = sanitizeLabel(firstPayloadItem?.keywordSanitized ?? null);
  const productNameSanitized = sanitizeLabel(firstPayloadItem?.productNameSanitized ?? null);
  const currentBlocker = sourceItemConsistency.sourceItemConsistency
    ? resolveCurrentBlocker(v106Report, v102Report, v105Report)
    : "BLOCKED_V107_SOURCE_ITEM_MISMATCH_NO_UPLOAD";
  const rows = buildOwnerRows({
    selectedChannelKey,
    selectedItemShortId: v105Report.selectedItemShortId,
    eventSanitized,
    themeSanitized,
    productNameSanitized,
    v102Report,
    v105Report,
    v106Report,
    sourceItemConsistency,
    currentBlocker
  });
  const ownerReviewMarkdownTable = buildMarkdownTable(rows);
  const finalStatus = !sourceItemConsistency.sourceItemConsistency
    ? "BLOCKED_V107_SOURCE_ITEM_MISMATCH_NO_UPLOAD"
    : rows.length === 0 || !ownerReviewMarkdownTable
    ? "BLOCKED_V107_OWNER_REVIEW_TABLE_INCOMPLETE_NO_UPLOAD"
    : "SUCCESS_V107_OWNER_REVIEW_TABLE_READY_NO_UPLOAD";

  return {
    ...baseSafeReport({ selectedChannelKey, requestedMode }),
    FINAL_STATUS: finalStatus,
    selectedItemFound: true,
    selectedItemShortId: v105Report.selectedItemShortId,
    eventSanitized,
    themeSanitized,
    productNameSanitized,
    queueStatus: v105Report.selectedItemStatus ?? v106Report.selectedQueueStatus,
    manualReviewStatus: v105Report.selectedManualReviewStatus ?? v106Report.selectedManualReviewStatus,
    plannedPayloadMode: v105Report.plannedPayloadMode,
    uploadPackageFound: v106Report.uploadPackageFound,
    packageHashPrefix: v106Report.packageHashPrefix,
    packageChannelMatches: v106Report.packageChannelMatches,
    packageQueueItemMatches: v106Report.packageQueueItemMatches,
    titlePresent: v106Report.titlePresent,
    descriptionPresent: v106Report.descriptionPresent,
    tagsPresent: v106Report.tagsPresent,
    categoryIdPresent: v106Report.categoryIdPresent,
    coupangDisclosurePresent: v106Report.coupangDisclosurePresent,
    affiliateEvidencePresent: v106Report.affiliateEvidencePresent,
    affiliateEvidenceHashPrefix: v106Report.affiliateEvidenceHashPrefix,
    videoAssetEvidencePresent: v106Report.videoAssetEvidencePresent,
    videoAssetHashPrefix: v106Report.videoAssetHashPrefix,
    firstFrameEvidencePresent: v106Report.firstFrameEvidencePresent,
    firstFrameHashPrefix: v106Report.firstFrameHashPrefix,
    preparedHttpsAssetEvidencePresent: v106Report.preparedHttpsAssetEvidencePresent,
    preparedAssetServerAccessible: v106Report.preparedAssetServerAccessible,
    preparedAssetBindingReady: v106Report.preparedAssetBindingReady,
    preparedAssetBridgeReady: v106Report.preparedAssetBridgeReady,
    preparedAssetBlocker: v106Report.preparedAssetBlocker,
    preparedAssetProviderAllowed: v106Report.preparedAssetProviderAllowed,
    preparedAssetExpired: v106Report.preparedAssetExpired,
    preparedAssetUploadable: v106Report.preparedAssetUploadable,
    v102Status: v102Report.FINAL_STATUS,
    v105Status: v105Report.FINAL_STATUS,
    v106Status: v106Report.FINAL_STATUS,
    v102SelectedItemShortId: v102Report.selectedItemShortId,
    v106SelectedItemShortId: v106Report.selectedItemShortId,
    v102InputConstrainedToSelectedItem,
    v102SelectedItemMatchesV105: sourceItemConsistency.v102SelectedItemMatchesV105,
    v106SelectedItemMatchesV105: sourceItemConsistency.v106SelectedItemMatchesV105,
    sourceItemConsistency: sourceItemConsistency.sourceItemConsistency,
    currentBlocker,
    ownerReviewRows: rows,
    ownerReviewMarkdownTable,
    sourceReports: {
      v102: sourceSummary(v102Report),
      v105: sourceSummary(v105Report),
      v106: sourceSummary(v106Report)
    }
  };
}

function buildOwnerRows(input: {
  selectedChannelKey: ChannelKey;
  selectedItemShortId: string;
  eventSanitized: string | null;
  themeSanitized: string | null;
  productNameSanitized: string | null;
  v102Report: V102FirstVideoSettingsReport;
  v105Report: V105QueueToGenerateOnlyNextBatchReport;
  v106Report: V106UploadPackageEvidenceReport;
  sourceItemConsistency: V107SourceItemConsistency;
  currentBlocker: V107CurrentBlocker;
}): V107OwnerReviewRow[] {
  const v106 = input.v106Report;
  const rows: V107OwnerReviewRow[] = [
    row("Selection", "Channel", "present", input.selectedChannelKey, null, "Review the selected channel before manual upload review."),
    row("Selection", "Queue item", "present", input.selectedItemShortId, null, "Review the selected queue item hash prefix only."),
    row("Selection", "Event / theme", statusForString(input.eventSanitized || input.themeSanitized), joinSanitized(input.eventSanitized, input.themeSanitized), null, "Confirm the event and theme fit the first-video owner review."),
    row("Selection", "Product", statusForString(input.productNameSanitized), input.productNameSanitized, null, "Confirm the product matches the channel plan."),
    row("Queue", "Queue status", statusForString(input.v105Report.selectedItemStatus), input.v105Report.selectedItemStatus, null, "Keep queue status aligned with generate-only/manual review flow."),
    row("Queue", "Manual review status", statusForString(input.v105Report.selectedManualReviewStatus), input.v105Report.selectedManualReviewStatus, null, "Move manual review forward only after owner checks the evidence table."),
    row("Queue", "Planned mode", input.v105Report.plannedPayloadMode === "generate_only" ? "present" : "missing", input.v105Report.plannedPayloadMode, null, "Keep this as generate_only; this table is not an upload trigger."),
    row("Source reports", "V102 status", statusFromFinalStatus(input.v102Report.FINAL_STATUS, "SUCCESS_V102_FIRST_VIDEO_SETTINGS_PREFLIGHT_READY_NO_UPLOAD_NO_COMMENT"), input.v102Report.FINAL_STATUS, input.v102Report.currentBlocker, "Use V102 to inspect first-video settings readiness only."),
    row("Source reports", "V105 status", statusFromFinalStatus(input.v105Report.FINAL_STATUS, "SUCCESS_V105_QUEUE_TO_GENERATE_ONLY_NEXT_BATCH_PLANNED_NO_UPLOAD"), input.v105Report.FINAL_STATUS, input.v105Report.currentBlocker, "Use V105 as the selected generate-only source."),
    row("Source reports", "V106 status", statusFromFinalStatus(v106.FINAL_STATUS, "SUCCESS_V106_UPLOAD_PACKAGE_EVIDENCE_READY_NO_UPLOAD"), v106.FINAL_STATUS, v106.currentBlocker, "Use V106 as upload package/evidence source only."),
    row(
      "Source reports",
      "Source item consistency",
      input.sourceItemConsistency.sourceItemConsistency ? "present" : "blocked",
      input.sourceItemConsistency.sourceItemConsistency,
      input.sourceItemConsistency.sourceItemConsistency ? null : "BLOCKED_V107_SOURCE_ITEM_MISMATCH_NO_UPLOAD",
      "Keep V102, V105, and V106 tied to the same selected queue item."
    ),
    row("Package", "Upload package", v106.uploadPackageFound ? "present" : "missing", v106.uploadPackageFound, v106.uploadPackageFound ? null : "BLOCKED_V106_UPLOAD_PACKAGE_MISSING_NO_UPLOAD", v106.uploadPackageFound ? "Review package metadata before upload readiness review." : "Create or attach a matching upload package before upload readiness review."),
    row("Package", "Affiliate evidence", v106.affiliateEvidencePresent ? "present" : "missing", v106.affiliateEvidencePresent ? v106.affiliateEvidenceHashPrefix : false, v106.affiliateEvidencePresent ? null : "BLOCKED_V106_AFFILIATE_OR_DISCLOSURE_EVIDENCE_MISSING_NO_UPLOAD", v106.affiliateEvidencePresent ? "Review sanitized affiliate evidence hash prefix only." : "Attach affiliate evidence and disclosure before manual upload review."),
    row("Package", "Coupang disclosure", v106.coupangDisclosurePresent ? "present" : "missing", v106.coupangDisclosurePresent, v106.coupangDisclosurePresent ? null : "BLOCKED_V106_AFFILIATE_OR_DISCLOSURE_EVIDENCE_MISSING_NO_UPLOAD", v106.coupangDisclosurePresent ? "Confirm disclosure remains present in metadata/comment preview." : "Attach affiliate evidence and disclosure before manual upload review."),
    row("YouTube settings", "YouTube title", v106.titlePresent ? "present" : "missing", v106.titlePresent, v106.titlePresent ? null : "BLOCKED_V106_SETTINGS_EVIDENCE_INCOMPLETE_NO_UPLOAD", v106.titlePresent ? "Review title text in sanitized preview artifacts." : "Create upload package metadata title before upload readiness review."),
    row("YouTube settings", "YouTube description", v106.descriptionPresent ? "present" : "missing", v106.descriptionPresent, v106.descriptionPresent ? null : "BLOCKED_V106_SETTINGS_EVIDENCE_INCOMPLETE_NO_UPLOAD", v106.descriptionPresent ? "Review description in sanitized preview artifacts." : "Create upload package metadata description before upload readiness review."),
    row("YouTube settings", "Tags", v106.tagsPresent ? "present" : "missing", v106.tagsPresent, v106.tagsPresent ? null : "BLOCKED_V106_SETTINGS_EVIDENCE_INCOMPLETE_NO_UPLOAD", v106.tagsPresent ? "Review tag coverage." : "Add tags to the upload package metadata."),
    row("YouTube settings", "Category", v106.categoryIdPresent ? "present" : "missing", v106.categoryIdPresent, v106.categoryIdPresent ? null : "BLOCKED_V106_SETTINGS_EVIDENCE_INCOMPLETE_NO_UPLOAD", v106.categoryIdPresent ? "Confirm category is appropriate." : "Set categoryId before upload readiness review."),
    row("Assets", "Video asset evidence", v106.videoAssetEvidencePresent ? "present" : "missing", v106.videoAssetEvidencePresent ? v106.videoAssetHashPrefix : false, v106.videoAssetEvidencePresent ? null : "BLOCKED_V081_VIDEO_ASSET_MISSING_NO_UPLOAD", v106.videoAssetEvidencePresent ? "Review sanitized video hash prefix only." : "Attach video asset evidence before owner upload readiness review."),
    row("Assets", "First frame evidence", v106.firstFrameEvidencePresent ? "present" : "missing", v106.firstFrameEvidencePresent ? v106.firstFrameHashPrefix : false, v106.firstFrameEvidencePresent ? null : "BLOCKED_V081_VIDEO_ASSET_MISSING_NO_UPLOAD", v106.firstFrameEvidencePresent ? "Review sanitized first-frame hash prefix only." : "Attach first-frame evidence before owner upload readiness review."),
    row("Prepared asset", "Prepared HTTPS asset", v106.preparedHttpsAssetEvidencePresent ? "present" : "missing", v106.preparedHttpsAssetEvidencePresent, v106.preparedHttpsAssetEvidencePresent ? null : "BLOCKED_V081_VIDEO_ASSET_MISSING_NO_UPLOAD", v106.preparedHttpsAssetEvidencePresent ? "Confirm prepared HTTPS evidence exists without exposing URL." : "Attach server-accessible prepared HTTPS video asset evidence."),
    row("Prepared asset", "Prepared asset binding ready", v106.preparedAssetBindingReady ? "present" : "not_ready", v106.preparedAssetBindingReady, v106.preparedAssetBindingReady ? null : "BLOCKED_V081_VIDEO_ASSET_MISSING_NO_UPLOAD", v106.preparedAssetBindingReady ? "No action. Binding evidence is ready." : "Attach server-accessible prepared HTTPS video asset evidence."),
    row("Prepared asset", "Prepared asset bridge ready", v106.preparedAssetBridgeReady ? "present" : "not_ready", v106.preparedAssetBridgeReady, v106.preparedAssetBridgeReady ? null : "BLOCKED_V081_VIDEO_ASSET_MISSING_NO_UPLOAD", v106.preparedAssetBridgeReady ? "No action. Bridge evidence is ready." : "Attach server-accessible prepared HTTPS video asset evidence."),
    row("Prepared asset", "Prepared asset blocker", v106.preparedAssetBlocker ? "blocked" : "present", v106.preparedAssetBlocker, v106.preparedAssetBlocker, v106.preparedAssetBlocker ? "Resolve prepared asset blocker before any upload readiness review." : "No action. Prepared asset blocker is clear."),
    row("Prepared asset", "Prepared asset uploadable", v106.preparedAssetUploadable ? "present" : "not_ready", v106.preparedAssetUploadable, v106.preparedAssetUploadable ? null : "BLOCKED_V081_VIDEO_ASSET_MISSING_NO_UPLOAD", v106.preparedAssetUploadable ? "No action. Prepared asset uploadable evidence is ready." : "Attach server-accessible prepared HTTPS video asset evidence."),
    row("Decision", "Current blocker", input.currentBlocker ? "blocked" : "present", input.currentBlocker, input.currentBlocker, input.currentBlocker ? "Resolve this blocker before any fresh upload approval review." : "No action. Owner table has no evidence blocker, but upload remains disabled."),
    row("Safety", "Safe to upload", "safe_disabled", false, null, "No action. Upload remains intentionally disabled."),
    row("Safety", "Safe to public upload", "safe_disabled", false, null, "No action. Upload remains intentionally disabled.")
  ];

  return rows;
}

function row(
  section: string,
  label: string,
  status: V107OwnerReviewRowStatus,
  valueSanitized: string | boolean | null,
  blocker: string | null,
  ownerAction: string
): V107OwnerReviewRow {
  return {
    section,
    label,
    status,
    valueSanitized: sanitizeValue(valueSanitized),
    blocker,
    ownerAction
  };
}

function buildMarkdownTable(rows: V107OwnerReviewRow[]) {
  if (rows.length === 0) return "";
  const header = "| Label | Status | Value | Blocker | Owner action |";
  const divider = "| --- | --- | --- | --- | --- |";
  const lines = rows.map((item) =>
    `| ${escapeMarkdown(item.label)} | ${item.status} | ${escapeMarkdown(formatValue(item.valueSanitized))} | ${escapeMarkdown(item.blocker ?? "")} | ${escapeMarkdown(item.ownerAction)} |`
  );
  return [header, divider, ...lines].join("\n");
}

function resolveCurrentBlocker(
  v106Report: V106UploadPackageEvidenceReport,
  v102Report: V102FirstVideoSettingsReport,
  v105Report: V105QueueToGenerateOnlyNextBatchReport
): V107CurrentBlocker {
  return v106Report.currentBlocker ?? v102Report.currentBlocker ?? v105Report.currentBlocker ?? null;
}

async function resolveQueueItemsForV107(input: {
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

function resolveSelectedQueueItemForV107(input: {
  queueItems: ProductQueueItem[];
  selectedChannelKey: ChannelKey;
  v105Report: V105QueueToGenerateOnlyNextBatchReport;
}) {
  const selectedItemShortId = input.v105Report.selectedItemShortId;
  if (!selectedItemShortId) return null;

  return input.queueItems.find((item) =>
    getItemChannelKey(item) === input.selectedChannelKey &&
    hashPrefix(item.id) === selectedItemShortId &&
    item.queue_status === input.v105Report.selectedItemStatus &&
    item.manual_review_status === input.v105Report.selectedManualReviewStatus
  ) ?? null;
}

function assertSelectedItemConsistency(input: {
  v105Report: V105QueueToGenerateOnlyNextBatchReport;
  v102Report: V102FirstVideoSettingsReport;
  v106Report: V106UploadPackageEvidenceReport;
  selectedQueueItem: ProductQueueItem;
  v102InputConstrainedToSelectedItem: boolean;
}): V107SourceItemConsistency {
  const selectedItemShortId = input.v105Report.selectedItemShortId;
  const selectedQueueItemMatchesV105 = Boolean(
    selectedItemShortId &&
    getItemChannelKey(input.selectedQueueItem) === input.v105Report.selectedChannelKey &&
    hashPrefix(input.selectedQueueItem.id) === selectedItemShortId &&
    input.selectedQueueItem.queue_status === input.v105Report.selectedItemStatus &&
    input.selectedQueueItem.manual_review_status === input.v105Report.selectedManualReviewStatus
  );
  const v102SelectedItemMatchesV105 = Boolean(
    selectedItemShortId &&
    input.v102Report.selectedItemShortId === selectedItemShortId
  );
  const v106SelectedItemMatchesV105 = Boolean(
    selectedItemShortId &&
    input.v106Report.selectedItemShortId === selectedItemShortId
  );

  return {
    v102SelectedItemMatchesV105,
    v106SelectedItemMatchesV105,
    sourceItemConsistency: Boolean(
      selectedQueueItemMatchesV105 &&
      input.v102InputConstrainedToSelectedItem &&
      v102SelectedItemMatchesV105 &&
      v106SelectedItemMatchesV105
    )
  };
}

function baseSafeReport(input: {
  selectedChannelKey: ChannelKey;
  requestedMode: V107OwnerReviewMode;
}): V107OwnerReviewFirstVideoSettingsTableReport {
  return {
    version: "v107",
    mode: "owner_review_first_video_settings_table_no_upload",
    requestedMode: input.requestedMode,
    FINAL_STATUS: "BLOCKED_V107_OWNER_REVIEW_TABLE_INCOMPLETE_NO_UPLOAD",
    selectedChannelKey: input.selectedChannelKey,
    selectedItemFound: false,
    selectedItemShortId: null,
    eventSanitized: null,
    themeSanitized: null,
    productNameSanitized: null,
    queueStatus: null,
    manualReviewStatus: null,
    plannedPayloadMode: null,
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
    preparedAssetBindingReady: false,
    preparedAssetBridgeReady: false,
    preparedAssetBlocker: null,
    preparedAssetProviderAllowed: false,
    preparedAssetExpired: null,
    preparedAssetUploadable: false,
    v102Status: "BLOCKED_NO_FIRST_VIDEO_CANDIDATE_NO_UPLOAD",
    v105Status: "BLOCKED_V105_NO_QUEUE_ITEM_FOR_NEXT_BATCH_NO_UPLOAD",
    v106Status: "BLOCKED_V105_NO_QUEUE_ITEM_FOR_NEXT_BATCH_NO_UPLOAD",
    v102SelectedItemShortId: null,
    v106SelectedItemShortId: null,
    v102InputConstrainedToSelectedItem: false,
    v102SelectedItemMatchesV105: false,
    v106SelectedItemMatchesV105: false,
    sourceItemConsistency: false,
    currentBlocker: null,
    ownerReviewRows: [],
    ownerReviewMarkdownTable: "",
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
    sourceReports: null
  };
}

function statusFromFinalStatus(value: string, successStatus: string): V107OwnerReviewRowStatus {
  if (value === successStatus) return "present";
  return value.startsWith("BLOCKED_") ? "blocked" : "not_ready";
}

function statusForString(value: unknown): V107OwnerReviewRowStatus {
  return typeof value === "string" && value.trim() ? "present" : "missing";
}

function joinSanitized(a: string | null, b: string | null) {
  const parts = [a, b].filter((value): value is string => Boolean(value));
  return parts.length ? parts.join(" / ") : null;
}

function sanitizeValue(value: string | boolean | null): string | boolean | null {
  if (typeof value !== "string") return value;
  return sanitizeLabel(value);
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
    .slice(0, 120);
}

function formatValue(value: string | boolean | null) {
  if (value === null) return "";
  return String(value);
}

function escapeMarkdown(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function resolveChannelKey(value: unknown): ChannelKey {
  return isChannelKey(value) ? value : "father_jobs";
}

function resolveMode(value: unknown): V107OwnerReviewMode {
  return value === "execute" ? "execute" : "dry_run";
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

function hashPrefix(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 10);
}

function resolveNow(value: string | Date | undefined) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? new Date() : value;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }
  return new Date();
}

function sourceSummary<TVersion extends string, TFinalStatus extends string, TBlocker extends string | null>(
  report: {
    version: TVersion;
    FINAL_STATUS: TFinalStatus;
    currentBlocker: TBlocker;
  }
) {
  return {
    version: report.version,
    FINAL_STATUS: report.FINAL_STATUS,
    currentBlocker: report.currentBlocker
  };
}
