import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { ProductQueueItem } from "@/types/automation";
import type { ChannelKey } from "@/uploads/multi-channel/channelProfiles";
import { isChannelKey } from "@/uploads/multi-channel/channelProfiles";

export type V105QueueToGenerateOnlyNextBatchMode = "dry_run" | "plan_only" | "execute";

export type V105QueueToGenerateOnlyNextBatchFinalStatus =
  | "SUCCESS_V105_QUEUE_TO_GENERATE_ONLY_NEXT_BATCH_PLANNED_NO_UPLOAD"
  | "BLOCKED_V105_NO_QUEUE_ITEM_FOR_NEXT_BATCH_NO_UPLOAD"
  | "BLOCKED_V105_EXECUTE_NOT_APPROVED_NO_UPLOAD";

export type V105GenerateOnlyNextBatchPayload = {
  type: "next_batch";
  mode: "generate_only";
  channelKey: ChannelKey;
  itemCount: number;
  uploadExecutionDisabled: true;
  commentAutomationDisabled: true;
  schedulerExecutionDisabled: true;
  items: Array<{
    itemHashPrefix: string;
    channelKey: ChannelKey;
    queueRank: number;
    scheduledAtPresent: boolean;
    queueStatus: ProductQueueItem["queue_status"];
    manualReviewStatus: ProductQueueItem["manual_review_status"];
    productNameSanitized: string;
    keywordSanitized: string;
    themeSanitized: string;
    categoryPathSanitized: string;
    rawUrlPresent: boolean;
    affiliateUrlPresent: boolean;
    uploadReadinessPromoted: false;
  }>;
};

export type V105QueueToGenerateOnlyNextBatchReport = {
  version: "v105";
  mode: "queue_to_generate_only_next_batch_no_upload";
  FINAL_STATUS: V105QueueToGenerateOnlyNextBatchFinalStatus;
  selectedChannelKey: ChannelKey;
  requestedMode: V105QueueToGenerateOnlyNextBatchMode;
  queueItemFound: boolean;
  selectedItemShortId: string | null;
  selectedItemStatus: ProductQueueItem["queue_status"] | null;
  selectedManualReviewStatus: ProductQueueItem["manual_review_status"] | null;
  selectedItemPromotedToUploadReadiness: false;
  plannedBatchSize: number;
  plannedPayloadCreated: boolean;
  plannedPayloadMode: "generate_only" | null;
  plannedPayloadSanitized: boolean;
  plannedPayload: V105GenerateOnlyNextBatchPayload | null;
  n8nWebhookPlanned: boolean;
  n8nWebhookCalled: false;
  uploadExecuteAllowed: false;
  videosInsertCalled: false;
  videosInsertTotalCount: 0;
  commentThreadsInsertCalled: false;
  schedulerExecutionCalled: false;
  DB_write: false;
  Supabase_write: false;
  R2_upload: false;
  storage_write: false;
  raw_urls_printed: false;
  raw_video_ids_printed: false;
  raw_channel_ids_printed: false;
  secrets_printed: false;
  fake_success: false;
  SAFE_TO_UPLOAD: false;
  SAFE_TO_PUBLIC_UPLOAD: false;
  currentBlocker: V105QueueToGenerateOnlyNextBatchFinalStatus | null;
};

export type V105QueueToGenerateOnlyNextBatchInput = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  selectedChannelKey?: string;
  maxBatchSize?: number | string;
  mode?: string;
  now?: string | Date;
  queueItems?: ProductQueueItem[];
  readQueueItems?: () => Promise<ProductQueueItem[]>;
};

export async function buildV105QueueToGenerateOnlyNextBatchReport(
  input: V105QueueToGenerateOnlyNextBatchInput = {}
): Promise<V105QueueToGenerateOnlyNextBatchReport> {
  const env = input.env ?? process.env;
  const cwd = input.cwd ?? process.cwd();
  const selectedChannelKey = resolveChannelKey(input.selectedChannelKey ?? env.V105_CHANNEL_KEY);
  const requestedMode = resolveMode(input.mode ?? env.V105_MODE);
  const maxBatchSize = resolveBatchSize(input.maxBatchSize ?? env.V105_BATCH_SIZE);
  const now = resolveNow(input.now);

  if (requestedMode === "execute") {
    return {
      ...baseSafeReport({
        selectedChannelKey,
        requestedMode,
        plannedBatchSize: maxBatchSize
      }),
      FINAL_STATUS: "BLOCKED_V105_EXECUTE_NOT_APPROVED_NO_UPLOAD",
      currentBlocker: "BLOCKED_V105_EXECUTE_NOT_APPROVED_NO_UPLOAD"
    };
  }

  const queueItems = await readQueueItems({
    cwd,
    env,
    queueItems: input.queueItems,
    readQueueItems: input.readQueueItems
  });
  const selectedItems = selectGenerateOnlyQueueItems({
    items: queueItems,
    channelKey: selectedChannelKey,
    maxBatchSize,
    now
  });

  if (selectedItems.length === 0) {
    return {
      ...baseSafeReport({
        selectedChannelKey,
        requestedMode,
        plannedBatchSize: 0
      }),
      FINAL_STATUS: "BLOCKED_V105_NO_QUEUE_ITEM_FOR_NEXT_BATCH_NO_UPLOAD",
      currentBlocker: "BLOCKED_V105_NO_QUEUE_ITEM_FOR_NEXT_BATCH_NO_UPLOAD"
    };
  }

  const plannedPayload = buildGenerateOnlyPayload(selectedChannelKey, selectedItems);
  const firstItem = selectedItems[0];
  return {
    ...baseSafeReport({
      selectedChannelKey,
      requestedMode,
      plannedBatchSize: selectedItems.length
    }),
    FINAL_STATUS: "SUCCESS_V105_QUEUE_TO_GENERATE_ONLY_NEXT_BATCH_PLANNED_NO_UPLOAD",
    queueItemFound: true,
    selectedItemShortId: hashPrefix(firstItem.id),
    selectedItemStatus: firstItem.queue_status,
    selectedManualReviewStatus: firstItem.manual_review_status,
    plannedPayloadCreated: true,
    plannedPayloadMode: "generate_only",
    plannedPayloadSanitized: true,
    plannedPayload,
    n8nWebhookPlanned: true
  };
}

function selectGenerateOnlyQueueItems(input: {
  items: ProductQueueItem[];
  channelKey: ChannelKey;
  maxBatchSize: number;
  now: Date;
}) {
  const channelItems = input.items.filter((item) => getItemChannelKey(item) === input.channelKey);
  const scheduledDue = channelItems
    .filter((item) => item.queue_status === "scheduled")
    .filter((item) => isDue(item.scheduled_at, input.now))
    .sort(compareQueueItems);
  const readyForManualUpload = channelItems
    .filter((item) => item.queue_status === "ready_for_manual_upload")
    .sort(compareQueueItems);
  const manualReviewFallback = channelItems
    .filter((item) => item.queue_status === "manual_review" && item.manual_review_status === "not_ready")
    .sort(compareQueueItems);

  return [
    ...scheduledDue,
    ...readyForManualUpload,
    ...manualReviewFallback
  ].slice(0, input.maxBatchSize);
}

function buildGenerateOnlyPayload(
  channelKey: ChannelKey,
  selectedItems: ProductQueueItem[]
): V105GenerateOnlyNextBatchPayload {
  return {
    type: "next_batch",
    mode: "generate_only",
    channelKey,
    itemCount: selectedItems.length,
    uploadExecutionDisabled: true,
    commentAutomationDisabled: true,
    schedulerExecutionDisabled: true,
    items: selectedItems.map((item) => ({
      itemHashPrefix: hashPrefix(item.id),
      channelKey: getItemChannelKey(item),
      queueRank: item.queue_rank,
      scheduledAtPresent: Boolean(item.scheduled_at.trim()),
      queueStatus: item.queue_status,
      manualReviewStatus: item.manual_review_status,
      productNameSanitized: sanitizeLabel(item.product_name),
      keywordSanitized: sanitizeLabel(item.keyword),
      themeSanitized: sanitizeLabel(item.theme),
      categoryPathSanitized: sanitizeLabel(item.category_path),
      rawUrlPresent: Boolean(item.raw_coupang_url.trim()),
      affiliateUrlPresent: Boolean(item.selected_affiliate_url.trim()),
      uploadReadinessPromoted: false
    }))
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

function baseSafeReport(input: {
  selectedChannelKey: ChannelKey;
  requestedMode: V105QueueToGenerateOnlyNextBatchMode;
  plannedBatchSize: number;
}): V105QueueToGenerateOnlyNextBatchReport {
  return {
    version: "v105",
    mode: "queue_to_generate_only_next_batch_no_upload",
    FINAL_STATUS: "SUCCESS_V105_QUEUE_TO_GENERATE_ONLY_NEXT_BATCH_PLANNED_NO_UPLOAD",
    selectedChannelKey: input.selectedChannelKey,
    requestedMode: input.requestedMode,
    queueItemFound: false,
    selectedItemShortId: null,
    selectedItemStatus: null,
    selectedManualReviewStatus: null,
    selectedItemPromotedToUploadReadiness: false,
    plannedBatchSize: input.plannedBatchSize,
    plannedPayloadCreated: false,
    plannedPayloadMode: null,
    plannedPayloadSanitized: true,
    plannedPayload: null,
    n8nWebhookPlanned: false,
    n8nWebhookCalled: false,
    uploadExecuteAllowed: false,
    videosInsertCalled: false,
    videosInsertTotalCount: 0,
    commentThreadsInsertCalled: false,
    schedulerExecutionCalled: false,
    DB_write: false,
    Supabase_write: false,
    R2_upload: false,
    storage_write: false,
    raw_urls_printed: false,
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

function resolveMode(value: unknown): V105QueueToGenerateOnlyNextBatchMode {
  if (value === "dry_run" || value === "plan_only" || value === "execute") {
    return value;
  }
  return "dry_run";
}

function resolveBatchSize(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 1;
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

function isDue(value: string, now: Date) {
  const dueAt = new Date(value);
  return !Number.isNaN(dueAt.getTime()) && dueAt.getTime() <= now.getTime();
}

function compareQueueItems(a: ProductQueueItem, b: ProductQueueItem) {
  return (
    a.queue_rank - b.queue_rank ||
    new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime() ||
    a.id.localeCompare(b.id)
  );
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

function sanitizeLabel(value: string) {
  return value
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function hashPrefix(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 10);
}
