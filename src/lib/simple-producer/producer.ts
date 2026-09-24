import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { YouTubePublicPublisherChannelKey } from "@/lib/youtube-public-publisher/channelConfig";
import {
  enqueueYouTubePublicUploadJob,
  type YouTubePublicPublisherStore,
  type YouTubePublicUploadJob
} from "@/lib/youtube-public-publisher/publisher";
import type { SimpleProducerStore } from "@/lib/simple-producer/state";
import type {
  SimpleProducerConfig,
  SimpleProducerPipelineInput,
  SimpleProducerPipelineResult,
  SimpleProducerRunResult,
  SimpleProducerSlotRecord
} from "@/lib/simple-producer/types";

export type SimpleProducerRunInput = {
  config: SimpleProducerConfig;
  producerStore: SimpleProducerStore;
  publisherStore: YouTubePublicPublisherStore;
  executePipeline: (input: SimpleProducerPipelineInput) => Promise<SimpleProducerPipelineResult>;
  now?: Date;
};

export async function runSimpleProducerOnce(input: SimpleProducerRunInput): Promise<SimpleProducerRunResult> {
  const now = input.now ?? new Date();
  const time = kstTime(now);
  if (!input.config.enabled) return noOp("disabled", "SIMPLE_PRODUCER_DISABLED", time.date, null);
  if (!input.config.generationSlots.includes(time.slot)) return noOp("outside_slot", "SIMPLE_PRODUCER_OUTSIDE_GENERATION_SLOT", time.date, null);

  const claim = await claimSlot(input.producerStore, input.config, time);
  if (claim.kind === "settings_reconcile_required") return noOp("settings_reconcile_required", "SIMPLE_PRODUCER_SETTINGS_RECONCILE_REQUIRED", time.date, time.slot);
  if (claim.kind === "existing") return noOp("slot_already_recorded", "SIMPLE_PRODUCER_SLOT_ALREADY_RECORDED", time.date, time.slot);
  if (claim.kind === "daily_target_reached") return noOp("daily_target_reached", "SIMPLE_PRODUCER_DAILY_TARGET_REACHED", time.date, time.slot);
  if (claim.kind === "held") return noOp("plan_held", "SIMPLE_PRODUCER_PLAN_HELD", time.date, time.slot);

  const publisherState = await input.publisherStore.read();
  const excludedProductIds = [...new Set([
    ...publisherState.ledger.map((entry) => entry.productId),
    ...publisherState.jobs.map((entry) => entry.productId)
  ])].sort();
  const runId = `simple-producer-${time.date.replace(/-/gu, "")}-${time.slot.replace(/:/gu, "")}`;
  let pipeline: SimpleProducerPipelineResult;
  try {
    pipeline = await input.executePipeline({
      runId,
      outputRoot: input.config.evidenceRoot,
      excludedProductIds,
      lockedProductId: claim.lockedProductId
    });
  } catch (error) {
    const safeError = safeErrorOf(error, "SIMPLE_PRODUCER_PIPELINE_FAILED");
    await completeSlot(input.producerStore, time, { status: "failed", safeError });
    return failed(time, safeError, 0, 0, 0);
  }
  if (!pipeline.ok || !pipeline.item || !pipeline.item.machineQaPassed) {
    const safeError = pipeline.safeError || "SIMPLE_PRODUCER_MACHINE_QA_NOT_PASS";
    await completeSlot(input.producerStore, time, { status: "failed", safeError });
    return failed(time, safeError, pipeline.searchCalls, pipeline.rawProductsFound, pipeline.eligibleProductsFound);
  }

  if (claim.lockedProductId && pipeline.item.productId !== claim.lockedProductId) {
    await completeSlot(input.producerStore, time, { status: "failed", safeError: "SIMPLE_PRODUCER_LOCKED_PRODUCT_MISMATCH" });
    return failed(time, "SIMPLE_PRODUCER_LOCKED_PRODUCT_MISMATCH", pipeline.searchCalls, pipeline.rawProductsFound, pipeline.eligibleProductsFound);
  }

  const channelKey = channelForUseCase(pipeline.item.useCase);
  if (!channelKey) {
    await completeSlot(input.producerStore, time, { status: "failed", safeError: "SIMPLE_PRODUCER_CHANNEL_NOT_SUPPORTED" });
    return failed(time, "SIMPLE_PRODUCER_CHANNEL_NOT_SUPPORTED", pipeline.searchCalls, pipeline.rawProductsFound, pipeline.eligibleProductsFound);
  }
  if (claim.lockedChannelKey && channelKey !== claim.lockedChannelKey) {
    await completeSlot(input.producerStore, time, { status: "failed", safeError: "SIMPLE_PRODUCER_LOCKED_CHANNEL_MISMATCH" });
    return failed(time, "SIMPLE_PRODUCER_LOCKED_CHANNEL_MISMATCH", pipeline.searchCalls, pipeline.rawProductsFound, pipeline.eligibleProductsFound);
  }
  const videoSha256 = await sha256File(pipeline.item.videoPath);
  if (!videoSha256) {
    await completeSlot(input.producerStore, time, { status: "failed", safeError: "SIMPLE_PRODUCER_VIDEO_ASSET_NOT_READY" });
    return failed(time, "SIMPLE_PRODUCER_VIDEO_ASSET_NOT_READY", pipeline.searchCalls, pipeline.rawProductsFound, pipeline.eligibleProductsFound);
  }

  const job = createReadyJob({
    date: time.date,
    slot: time.slot,
    now: time.now,
    item: pipeline.item,
    channelKey,
    videoSha256
  });
  const enqueued = await enqueueYouTubePublicUploadJob(input.publisherStore, job);
  if (!enqueued.created) {
    await completeSlot(input.producerStore, time, { status: "failed", safeError: enqueued.safeError });
    return failed(time, enqueued.safeError, pipeline.searchCalls, pipeline.rawProductsFound, pipeline.eligibleProductsFound);
  }
  await completeSlot(input.producerStore, time, {
    status: "succeeded",
    productId: pipeline.item.productId,
    uploadJobId: job.id,
    safeError: ""
  });
  return {
    status: "ready_job_created",
    safeError: "",
    date: time.date,
    slot: time.slot,
    productId: pipeline.item.productId,
    uploadJobId: job.id,
    channelKey,
    readyJobCreated: 1,
    videosInsertCalls: 0,
    searchCalls: pipeline.searchCalls,
    rawProductsFound: pipeline.rawProductsFound,
    eligibleProductsFound: pipeline.eligibleProductsFound
  };
}

function createReadyJob(input: {
  date: string;
  slot: string;
  now: string;
  item: NonNullable<SimpleProducerPipelineResult["item"]>;
  channelKey: YouTubePublicPublisherChannelKey;
  videoSha256: string;
}): YouTubePublicUploadJob {
  const disclosureText = "이 포스팅은 쿠팡 파트너스 활동의 일환으로 일정액의 수수료를 제공받습니다.";
  const title = input.item.canonicalProductName.slice(0, 100);
  const description = `${input.item.canonicalProductName}\n\n${input.item.affiliateUrl}\n\n${disclosureText}`;
  const idMaterial = `${input.date}|${input.slot}|${input.item.productId}|${input.videoSha256}`;
  return {
    id: `simple-producer-${createHash("sha256").update(idMaterial).digest("hex").slice(0, 24)}`,
    productId: input.item.productId,
    channelKey: input.channelKey,
    videoPath: input.item.videoPath,
    videoSha256: input.videoSha256,
    affiliateUrl: input.item.affiliateUrl,
    affiliateProductId: input.item.productId,
    canonicalProductName: input.item.canonicalProductName,
    metadataProductName: input.item.canonicalProductName,
    title,
    description,
    disclosureText,
    machineQaStatus: "passed",
    status: "ready",
    attemptCount: 0,
    claimedAt: "",
    claimOwner: "",
    lastError: "",
    youtubeVideoId: "",
    youtubeUrl: "",
    publishedAt: "",
    createdAt: input.now,
    updatedAt: input.now
  };
}

async function claimSlot(store: SimpleProducerStore, config: SimpleProducerConfig, time: KstTime) {
  return store.mutate((state) => {
    if ((state.studioSettingsRevision ?? 0) !== (config.studioSettingsRevision ?? 0))
      return { kind: "settings_reconcile_required" } as const;
    const today = state.slots.filter((record) => record.date === time.date);
    if (today.some((record) => record.slot === time.slot)) return { kind: "existing" } as const;
    if (today.filter((record) => record.status === "succeeded").length >= config.dailyGenerateTarget) return { kind: "daily_target_reached" } as const;
    const plan = state.studioPlans?.find((entry) => entry.date === time.date && entry.slot === time.slot);
    if (plan?.status === "held") return { kind: "held" } as const;
    const lockedProductId = plan?.status === "selected" && plan.selectionMode === "manual" ? plan.exactProductId : null;
    const lockedChannelKey = lockedProductId ? plan?.channelKey : null;
    if (plan?.status === "selected" && plan.selectionMode === "manual" && !lockedProductId) throw new Error("SIMPLE_PRODUCER_MANUAL_PLAN_INVALID");
    if (plan && plan.status !== "unassigned" && plan.status !== "selected") return { kind: "existing" } as const;
    if (plan && lockedProductId) {
      plan.status = "claimed";
      plan.lockedAt = time.now;
    }
    state.slots.push({
      date: time.date,
      slot: time.slot,
      status: "running",
      createdAt: time.now,
      updatedAt: time.now,
      productId: "",
      uploadJobId: "",
      safeError: ""
    });
    return { kind: "claimed", lockedProductId, lockedChannelKey } as const;
  });
}

async function completeSlot(store: SimpleProducerStore, time: KstTime, update: Pick<SimpleProducerSlotRecord, "status" | "safeError"> & Partial<Pick<SimpleProducerSlotRecord, "productId" | "uploadJobId">>) {
  return store.mutate((state) => {
    const record = state.slots.find((candidate) => candidate.date === time.date && candidate.slot === time.slot);
    if (!record || record.status !== "running") throw new Error("SIMPLE_PRODUCER_SLOT_CLAIM_LOST");
    record.status = update.status;
    record.safeError = update.safeError;
    record.productId = update.productId ?? "";
    record.uploadJobId = update.uploadJobId ?? "";
    record.updatedAt = time.now;
    const plan = state.studioPlans?.find((entry) => entry.date === time.date && entry.slot === time.slot && entry.status === "claimed");
    if (plan) {
      plan.status = update.status === "succeeded" ? "completed" : "failed";
      plan.executionRecordId = `${time.date}|${time.slot}`;
    }
  });
}

function channelForUseCase(value: "vehicle_organization" | "laundry_drying"): YouTubePublicPublisherChannelKey | null {
  if (value === "laundry_drying") return "neoman_moleulgeol";
  if (value === "vehicle_organization") return "father_jobs";
  return null;
}

async function sha256File(path: string) {
  try {
    return createHash("sha256").update(await readFile(path)).digest("hex");
  } catch {
    return "";
  }
}

type KstTime = { date: string; slot: string; now: string };

function kstTime(now: Date): KstTime {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${value("year")}-${value("month")}-${value("day")}`, slot: `${value("hour")}:${value("minute")}`, now: now.toISOString() };
}

function noOp(status: Extract<SimpleProducerRunResult["status"], "disabled" | "outside_slot" | "daily_target_reached" | "slot_already_recorded" | "plan_held" | "settings_reconcile_required">, safeError: string, date: string, slot: string | null): SimpleProducerRunResult {
  return { status, safeError, date, slot, productId: null, uploadJobId: null, channelKey: null, readyJobCreated: 0, videosInsertCalls: 0, searchCalls: 0, rawProductsFound: 0, eligibleProductsFound: 0 };
}

function failed(time: KstTime, safeError: string, searchCalls: number, rawProductsFound: number, eligibleProductsFound: number): SimpleProducerRunResult {
  return { status: "failed", safeError, date: time.date, slot: time.slot, productId: null, uploadJobId: null, channelKey: null, readyJobCreated: 0, videosInsertCalls: 0, searchCalls, rawProductsFound, eligibleProductsFound };
}

function safeErrorOf(error: unknown, fallback: string) {
  const value = error instanceof Error ? error.message : String(error);
  return /^[A-Z0-9_:-]+$/u.test(value) ? value : fallback;
}

export function safeVideoFilename(path: string) {
  return basename(path);
}
