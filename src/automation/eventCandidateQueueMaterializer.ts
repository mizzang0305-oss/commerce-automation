import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { ProductQueueItem } from "@/types/automation";
import type { ChannelKey } from "@/uploads/multi-channel/channelProfiles";
import { isChannelKey } from "@/uploads/multi-channel/channelProfiles";
import {
  buildV103EventCandidateScoutReport,
  type V103EventCandidate,
  type V103EventCandidateScoutReport
} from "@/automation/eventCandidateScout";
import {
  buildV102FirstVideoSettingsPreflight,
  type V102FirstVideoSettingsFinalStatus
} from "@/uploads/youtube/v102FirstVideoSettingsPreflight";

export type V104EventCandidateMaterializationMode = "dry_run" | "local_write" | "supabase_write";

export type V104EventCandidateToQueueFinalStatus =
  | "SUCCESS_V104_EVENT_CANDIDATE_TO_QUEUE_READY_NO_UPLOAD"
  | "BLOCKED_V104_NO_SELECTED_CANDIDATE_NO_UPLOAD"
  | "BLOCKED_SUPABASE_WRITE_NOT_APPROVED_NO_UPLOAD"
  | "BLOCKED_V104_LOCAL_QUEUE_WRITE_FAILED_NO_UPLOAD";

export type V104EventCandidateQueueItemSummary = {
  queueItemShortId: string;
  channelKey: ChannelKey;
  queue_date: string;
  queue_rank: number;
  upload_slot: number;
  queue_status: ProductQueueItem["queue_status"];
  manual_review_status: ProductQueueItem["manual_review_status"];
  youtube_upload_status: ProductQueueItem["youtube_upload_status"];
  productNameSanitized: string;
  eventNameSanitized: string;
  themeSanitized: string;
  rawUrlPresent: boolean;
  affiliateUrlPresent: boolean;
};

export type V104EventCandidateToQueueReport = {
  version: "v104";
  mode: "event_candidate_to_queue_no_upload";
  FINAL_STATUS: V104EventCandidateToQueueFinalStatus;
  materializationMode: V104EventCandidateMaterializationMode;
  selectedCandidateFound: boolean;
  selectedChannelKey: ChannelKey;
  selectedEvent: string | null;
  selectedTheme: string | null;
  queueItemCreated: boolean;
  queueItemAlreadyExists: boolean;
  queueItemShortId: string | null;
  plannedQueueItem: V104EventCandidateQueueItemSummary | null;
  queueWritePlanned: boolean;
  localQueueWrite: boolean;
  duplicateGuard: {
    duplicateDetected: boolean;
    duplicatePrevented: boolean;
    duplicateKeyHashPrefix: string | null;
  };
  currentBlocker: V104EventCandidateToQueueFinalStatus | V102FirstVideoSettingsFinalStatus | null;
  v103Scout: {
    executed: boolean;
    FINAL_STATUS: V103EventCandidateScoutReport["FINAL_STATUS"] | null;
    generatedCandidateCount: number;
    selectedFirstCandidateFound: boolean;
  };
  v102AfterMaterialization: {
    executed: boolean;
    selectedItemFound: boolean;
    FINAL_STATUS: V102FirstVideoSettingsFinalStatus | null;
    currentBlocker: V102FirstVideoSettingsFinalStatus | null;
  } | null;
  DB_write: false;
  Supabase_write: false;
  n8nWebhookCalled: false;
  schedulerExecutionCalled: false;
  videosInsertCalled: false;
  videosInsertTotalCount: 0;
  commentThreadsInsertCalled: false;
  raw_urls_printed: false;
  raw_video_ids_printed: false;
  raw_channel_ids_printed: false;
  secrets_printed: false;
  fake_success: false;
  SAFE_TO_UPLOAD: false;
  SAFE_TO_PUBLIC_UPLOAD: false;
};

export type V104EventCandidateToQueueInput = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  today?: string | Date;
  selectedChannelKey?: ChannelKey;
  materializationMode?: V104EventCandidateMaterializationMode;
  runV102AfterMaterialization?: boolean;
  readQueueItems?: () => Promise<ProductQueueItem[]>;
  writeQueueItems?: (items: ProductQueueItem[]) => Promise<void>;
};

export async function buildV104EventCandidateToQueueReport(
  input: V104EventCandidateToQueueInput = {}
): Promise<V104EventCandidateToQueueReport> {
  const env = input.env ?? process.env;
  const cwd = input.cwd ?? process.cwd();
  const materializationMode = resolveMaterializationMode(input.materializationMode ?? env.V104_MODE);
  const selectedChannelKey = resolveSelectedChannelKey(input.selectedChannelKey ?? env.V104_CHANNEL_KEY);
  const today = input.today ?? env.V103_SCOUT_TODAY ?? new Date();
  const runV102AfterMaterialization = input.runV102AfterMaterialization ?? true;
  const scout = await buildV103EventCandidateScoutReport({
    today,
    runV102LinkedDryRun: false
  });
  const selectedCandidate = selectCandidateForChannel(scout, selectedChannelKey);
  const baseReport = baseSafeReport({
    materializationMode,
    selectedChannelKey,
    scout,
    selectedCandidate
  });

  if (!selectedCandidate) {
    const v102AfterMaterialization = runV102AfterMaterialization
      ? await runV102ForQueue({
        selectedChannelKey,
        queueItems: [],
        now: scout.scoutWindowStart
      })
      : null;
    return {
      ...baseReport,
      FINAL_STATUS: "BLOCKED_V104_NO_SELECTED_CANDIDATE_NO_UPLOAD",
      currentBlocker: "BLOCKED_V104_NO_SELECTED_CANDIDATE_NO_UPLOAD",
      v102AfterMaterialization
    };
  }

  const plannedQueueItem = buildQueueItemFromCandidate(selectedCandidate, scout.scoutWindowStart);
  const existingQueueItems = await readQueueItems(cwd, env, input.readQueueItems);
  const duplicate = findDuplicate(existingQueueItems, plannedQueueItem);
  const queueForV102 = duplicate ? existingQueueItems : [plannedQueueItem, ...existingQueueItems];
  const v102AfterMaterialization = runV102AfterMaterialization
    ? await runV102ForQueue({
      selectedChannelKey,
      queueItems: queueForV102,
      now: scout.scoutWindowStart
    })
    : null;

  if (materializationMode === "supabase_write") {
    return {
      ...baseReport,
      FINAL_STATUS: "BLOCKED_SUPABASE_WRITE_NOT_APPROVED_NO_UPLOAD",
      selectedEvent: sanitizeLabel(selectedCandidate.eventName),
      selectedTheme: sanitizeLabel(selectedCandidate.theme),
      queueItemShortId: hashPrefix(plannedQueueItem.id),
      plannedQueueItem: summarizeQueueItem(plannedQueueItem, selectedCandidate),
      queueWritePlanned: true,
      duplicateGuard: buildDuplicateGuard(plannedQueueItem, duplicate),
      currentBlocker: "BLOCKED_SUPABASE_WRITE_NOT_APPROVED_NO_UPLOAD",
      v102AfterMaterialization
    };
  }

  if (materializationMode === "local_write" && !duplicate) {
    try {
      await writeQueueItems(cwd, env, queueForV102, input.writeQueueItems);
    } catch {
      return {
        ...baseReport,
        FINAL_STATUS: "BLOCKED_V104_LOCAL_QUEUE_WRITE_FAILED_NO_UPLOAD",
        selectedEvent: sanitizeLabel(selectedCandidate.eventName),
        selectedTheme: sanitizeLabel(selectedCandidate.theme),
        queueItemShortId: hashPrefix(plannedQueueItem.id),
        plannedQueueItem: summarizeQueueItem(plannedQueueItem, selectedCandidate),
        queueWritePlanned: true,
        duplicateGuard: buildDuplicateGuard(plannedQueueItem, duplicate),
        currentBlocker: "BLOCKED_V104_LOCAL_QUEUE_WRITE_FAILED_NO_UPLOAD",
        v102AfterMaterialization
      };
    }
  }

  return {
    ...baseReport,
    FINAL_STATUS: "SUCCESS_V104_EVENT_CANDIDATE_TO_QUEUE_READY_NO_UPLOAD",
    selectedEvent: sanitizeLabel(selectedCandidate.eventName),
    selectedTheme: sanitizeLabel(selectedCandidate.theme),
    queueItemCreated: materializationMode === "local_write" && !duplicate,
    queueItemAlreadyExists: Boolean(duplicate),
    queueItemShortId: hashPrefix((duplicate ?? plannedQueueItem).id),
    plannedQueueItem: summarizeQueueItem(duplicate ?? plannedQueueItem, selectedCandidate),
    queueWritePlanned: true,
    localQueueWrite: materializationMode === "local_write" && !duplicate,
    duplicateGuard: buildDuplicateGuard(plannedQueueItem, duplicate),
    currentBlocker: v102AfterMaterialization?.currentBlocker ?? null,
    v102AfterMaterialization
  };
}

function buildQueueItemFromCandidate(candidate: V103EventCandidate, today: string): ProductQueueItem {
  const createdAt = `${today}T00:00:00.000Z`;
  const productName = sanitizeQueueValue(candidate.productTheme || candidate.theme || candidate.eventName);
  const keyword = sanitizeQueueValue(candidate.theme);
  const categoryPath = `event/${candidate.eventType}/${candidate.eventKey}`;
  return {
    id: buildQueueItemId({
      channelKey: candidate.channelKey,
      categoryPath,
      keyword,
      queueDate: today
    }),
    channelKey: candidate.channelKey,
    queue_date: today,
    queue_rank: 1,
    upload_slot: 1,
    scheduled_at: createdAt,
    keyword,
    theme: sanitizeQueueValue(candidate.eventName),
    product_name: productName,
    category_path: categoryPath,
    price_now_text: "",
    thumbnail_url: "",
    raw_coupang_url: "",
    selected_affiliate_url: "",
    product_score: candidate.score,
    score_reason: sanitizeQueueValue(candidate.selectedReason),
    video_angle: `${sanitizeQueueValue(candidate.eventName)} ${sanitizeQueueValue(candidate.theme)} shorts candidate`,
    queue_status: "manual_review",
    video_url: "",
    video_snapshot_url: "",
    blog_draft_url: "",
    youtube_upload_status: "not_ready",
    tiktok_upload_status: "not_ready",
    threads_post_status: "not_ready",
    manual_review_status: "not_ready",
    error_message: "",
    created_at: createdAt,
    updated_at: createdAt
  };
}

function buildQueueItemId(input: {
  channelKey: ChannelKey;
  categoryPath: string;
  keyword: string;
  queueDate: string;
}) {
  return `v104-${hashPrefix([
    input.channelKey,
    input.categoryPath,
    input.keyword,
    input.queueDate
  ].join("|"))}`;
}

function selectCandidateForChannel(
  scout: V103EventCandidateScoutReport,
  selectedChannelKey: ChannelKey
): V103EventCandidate | null {
  if (scout.selectedFirstCandidate?.channelKey === selectedChannelKey) {
    return scout.selectedFirstCandidate;
  }
  return scout.topCandidates.find((candidate) => candidate.channelKey === selectedChannelKey) ?? null;
}

async function readQueueItems(
  cwd: string,
  env: NodeJS.ProcessEnv,
  readQueueItemsOverride?: () => Promise<ProductQueueItem[]>
) {
  if (readQueueItemsOverride) {
    return readQueueItemsOverride();
  }
  const queuePath = getQueuePath(cwd, env);
  try {
    const parsed = JSON.parse(await fs.readFile(queuePath, "utf8")) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isProductQueueItem);
  } catch {
    return [];
  }
}

async function writeQueueItems(
  cwd: string,
  env: NodeJS.ProcessEnv,
  queueItems: ProductQueueItem[],
  writeQueueItemsOverride?: (items: ProductQueueItem[]) => Promise<void>
) {
  if (writeQueueItemsOverride) {
    await writeQueueItemsOverride(queueItems);
    return;
  }
  const queuePath = getQueuePath(cwd, env);
  await fs.mkdir(path.dirname(queuePath), { recursive: true });
  await fs.writeFile(
    queuePath,
    `${JSON.stringify(sortQueue(queueItems), null, 2)}\n`,
    "utf8"
  );
}

async function runV102ForQueue(input: {
  selectedChannelKey: ChannelKey;
  queueItems: ProductQueueItem[];
  now: string;
}): Promise<NonNullable<V104EventCandidateToQueueReport["v102AfterMaterialization"]>> {
  const report = await buildV102FirstVideoSettingsPreflight({
    selectedChannelKey: input.selectedChannelKey,
    queueItems: input.queueItems,
    uploadPackages: [],
    now: () => `${input.now}T00:00:00.000Z`
  });

  return {
    executed: true,
    selectedItemFound: report.selectedItemFound,
    FINAL_STATUS: report.FINAL_STATUS,
    currentBlocker: report.currentBlocker
  };
}

function findDuplicate(queueItems: ProductQueueItem[], planned: ProductQueueItem) {
  const key = duplicateKey(planned);
  return queueItems.find((item) => duplicateKey(item) === key) ?? null;
}

function duplicateKey(item: ProductQueueItem) {
  return [
    item.channelKey ?? "",
    item.category_path,
    item.keyword,
    item.queue_date
  ].join("|");
}

function buildDuplicateGuard(planned: ProductQueueItem, duplicate: ProductQueueItem | null) {
  return {
    duplicateDetected: Boolean(duplicate),
    duplicatePrevented: Boolean(duplicate),
    duplicateKeyHashPrefix: hashPrefix(duplicateKey(planned))
  };
}

function summarizeQueueItem(
  item: ProductQueueItem,
  candidate: V103EventCandidate
): V104EventCandidateQueueItemSummary {
  return {
    queueItemShortId: hashPrefix(item.id),
    channelKey: candidate.channelKey,
    queue_date: item.queue_date,
    queue_rank: item.queue_rank,
    upload_slot: item.upload_slot,
    queue_status: item.queue_status,
    manual_review_status: item.manual_review_status,
    youtube_upload_status: item.youtube_upload_status,
    productNameSanitized: sanitizeLabel(item.product_name),
    eventNameSanitized: sanitizeLabel(candidate.eventName),
    themeSanitized: sanitizeLabel(candidate.theme),
    rawUrlPresent: Boolean(item.raw_coupang_url.trim()),
    affiliateUrlPresent: Boolean(item.selected_affiliate_url.trim())
  };
}

function baseSafeReport(input: {
  materializationMode: V104EventCandidateMaterializationMode;
  selectedChannelKey: ChannelKey;
  scout: V103EventCandidateScoutReport;
  selectedCandidate: V103EventCandidate | null;
}): V104EventCandidateToQueueReport {
  return {
    version: "v104",
    mode: "event_candidate_to_queue_no_upload",
    FINAL_STATUS: "SUCCESS_V104_EVENT_CANDIDATE_TO_QUEUE_READY_NO_UPLOAD",
    materializationMode: input.materializationMode,
    selectedCandidateFound: Boolean(input.selectedCandidate),
    selectedChannelKey: input.selectedChannelKey,
    selectedEvent: input.selectedCandidate ? sanitizeLabel(input.selectedCandidate.eventName) : null,
    selectedTheme: input.selectedCandidate ? sanitizeLabel(input.selectedCandidate.theme) : null,
    queueItemCreated: false,
    queueItemAlreadyExists: false,
    queueItemShortId: null,
    plannedQueueItem: null,
    queueWritePlanned: false,
    localQueueWrite: false,
    duplicateGuard: {
      duplicateDetected: false,
      duplicatePrevented: false,
      duplicateKeyHashPrefix: null
    },
    currentBlocker: null,
    v103Scout: {
      executed: true,
      FINAL_STATUS: input.scout.FINAL_STATUS,
      generatedCandidateCount: input.scout.generatedCandidateCount,
      selectedFirstCandidateFound: Boolean(input.scout.selectedFirstCandidate)
    },
    v102AfterMaterialization: null,
    DB_write: false,
    Supabase_write: false,
    n8nWebhookCalled: false,
    schedulerExecutionCalled: false,
    videosInsertCalled: false,
    videosInsertTotalCount: 0,
    commentThreadsInsertCalled: false,
    raw_urls_printed: false,
    raw_video_ids_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false,
    fake_success: false,
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false
  };
}

function resolveMaterializationMode(value: string | undefined): V104EventCandidateMaterializationMode {
  if (value === "local_write" || value === "supabase_write" || value === "dry_run") {
    return value;
  }
  return "dry_run";
}

function resolveSelectedChannelKey(value: string | undefined): ChannelKey {
  return isChannelKey(value) ? value : "father_jobs";
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
    typeof record.queue_status === "string"
  );
}

function sortQueue(items: ProductQueueItem[]) {
  return [...items].sort((a, b) =>
    a.queue_rank - b.queue_rank ||
    a.channelKey?.localeCompare(b.channelKey ?? "") ||
    a.id.localeCompare(b.id)
  );
}

function sanitizeQueueValue(value: string) {
  return sanitizeLabel(value).trim();
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
