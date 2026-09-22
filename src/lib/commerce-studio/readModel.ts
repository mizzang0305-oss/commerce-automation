import "server-only";

import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { readConfiguredSimpleProducerConfig } from "@/lib/simple-producer/config";
import type { SimpleProducerSlotRecord, SimpleProducerState } from "@/lib/simple-producer/types";
import type { YouTubePublicPublisherState, YouTubePublicUploadJob, YouTubePublicUploadLedgerEntry } from "@/lib/youtube-public-publisher/publisher";
import { resolvePublisherChannel } from "@/lib/youtube-public-publisher/channelConfig";
import type { StudioContent, StudioModel, StudioSlot } from "@/lib/commerce-studio/model";

const CHANNELS = ["neoman_moleulgeol", "father_jobs"] as const;

export async function readCommerceStudioModel(now = new Date()): Promise<StudioModel> {
  const configResult = await readConfiguredSimpleProducerConfig();
  const config = configResult.ok ? configResult.config : null;
  const producerState = config
    ? await readJsonFile<SimpleProducerState>(resolve(config.evidenceRoot, "simple-producer-state.json"))
    : null;
  const publisherPath = process.env.YOUTUBE_PUBLIC_PUBLISHER_STATE_PATH?.trim() ?? "";
  const publisherState = publisherPath && isAbsolute(publisherPath)
    ? await readJsonFile<YouTubePublicPublisherState>(publisherPath)
    : null;
  const producerReady = Boolean(config && producerState && producerState.schema === "simple-producer/v1" && Array.isArray(producerState.slots) && producerState.slots.every(isProducerSlot));
  const publisherReady = Boolean(publisherState && Array.isArray(publisherState.jobs) && publisherState.jobs.every(isPublisherJob) && Array.isArray(publisherState.ledger) && publisherState.ledger.every(isPublisherLedgerEntry));
  const jobs = publisherReady ? publisherState!.jobs : [];
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const records = producerReady ? producerState!.slots : [];
  const recordByDateSlot = new Map(records.map((record) => [`${record.date}|${record.slot}`, record]));
  const dates = surroundingKstDates(now);
  const currentKst = kstDateTime(now);
  const slots: StudioSlot[] = config
    ? dates.flatMap((date) => config.generationSlots.map((time) => {
      const record = recordByDateSlot.get(`${date}|${time}`);
      const job = record?.uploadJobId ? jobById.get(record.uploadJobId) : undefined;
      return {
        date,
        time,
        status: record?.status ?? (!config.enabled ? "disabled" : `${date}T${time}` <= currentKst ? "unknown" : "scheduled"),
        productName: job?.canonicalProductName ?? null,
        channelKey: job?.channelKey ?? null,
        publishStatus: job?.status ?? null,
        youtubeUrl: job?.youtubeUrl || null,
        safeError: record?.safeError || null
      };
    }))
    : [];
  const jobContents: StudioContent[] = jobs
    .filter((job) => job.canonicalProductName && job.channelKey && job.status)
    .map((job) => ({
      id: job.id,
      evidenceSource: "job" as const,
      productName: job.canonicalProductName,
      channelKey: job.channelKey,
      status: job.status,
      createdAt: job.createdAt,
      publishedAt: job.publishedAt || null,
      youtubeUrl: safeYouTubeUrl(job.youtubeUrl),
      title: job.title
    }));
  const knownVideoIds = new Set(jobs.map((job) => job.youtubeVideoId).filter(Boolean));
  const ledgerContents: StudioContent[] = (publisherReady ? publisherState!.ledger : [])
    .filter((entry) => !knownVideoIds.has(entry.youtubeVideoId))
    .map((entry) => ({
      id: `ledger:${entry.youtubeVideoId}`,
      evidenceSource: "ledger" as const,
      productName: "상품명 기록 없음",
      channelKey: entry.channelKey,
      status: "uploaded" as const,
      createdAt: entry.recordedAt,
      publishedAt: entry.publishedAt,
      youtubeUrl: safeYouTubeUrl(entry.youtubeUrl),
      title: ""
    }));
  const contents = [...jobContents, ...ledgerContents].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    observedAt: now.toISOString(),
    timeZone: "Asia/Seoul",
    producerSource: producerReady ? "connected" : "unavailable",
    publisherSource: publisherReady ? "connected" : "unavailable",
    producerSafeError: producerReady ? null : configResult.ok ? "PRODUCER_STATE_NOT_READABLE" : configResult.safeError,
    publisherSafeError: publisherReady ? null : "PUBLISHER_STATE_NOT_READABLE",
    settings: config ? {
      enabled: config.enabled,
      dailyGenerateTarget: config.dailyGenerateTarget,
      generationSlots: config.generationSlots,
      maxItemsPerRun: config.maxItemsPerRun
    } : null,
    slots,
    contents,
    youtubeChannels: CHANNELS.map((key) => {
      const channel = resolvePublisherChannel(key);
      return {
        key,
        title: channel.expectedChannelTitle,
        expectedChannelId: channel.expectedChannelId,
        credentialConfigured: Boolean(channel.tokenFilePath),
        historicalPublicationObserved: Boolean(publisherReady && publisherState!.ledger.some((entry) =>
          entry.channelKey === key && entry.channelId === channel.expectedChannelId && entry.visibility === "public"))
      };
    })
  };
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function surroundingKstDates(now: Date) {
  const today = kstDateTime(now).slice(0, 10);
  const start = new Date(`${today}T00:00:00.000Z`);
  return Array.from({ length: 21 }, (_, index) =>
    new Date(start.getTime() + (index - 14) * 86_400_000).toISOString().slice(0, 10));
}

function kstDateTime(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`;
}

function safeYouTubeUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["youtu.be", "www.youtube.com", "youtube.com"].includes(url.hostname)
      ? url.toString() : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isProducerSlot(value: unknown): value is SimpleProducerSlotRecord {
  return isRecord(value) && typeof value.date === "string" && typeof value.slot === "string" &&
    ["running", "succeeded", "failed"].includes(String(value.status)) &&
    typeof value.uploadJobId === "string" && typeof value.safeError === "string";
}

function isPublisherJob(value: unknown): value is YouTubePublicUploadJob {
  return isRecord(value) && typeof value.id === "string" && typeof value.canonicalProductName === "string" &&
    typeof value.createdAt === "string" && typeof value.publishedAt === "string" &&
    typeof value.youtubeUrl === "string" && typeof value.youtubeVideoId === "string" &&
    typeof value.title === "string" && ["neoman_moleulgeol", "father_jobs"].includes(String(value.channelKey)) &&
    ["ready", "uploading", "uploaded", "error", "manual_review"].includes(String(value.status));
}

function isPublisherLedgerEntry(value: unknown): value is YouTubePublicUploadLedgerEntry {
  return isRecord(value) && typeof value.channelId === "string" && typeof value.youtubeVideoId === "string" &&
    typeof value.youtubeUrl === "string" && typeof value.recordedAt === "string" &&
    (value.publishedAt === null || typeof value.publishedAt === "string") &&
    ["neoman_moleulgeol", "father_jobs"].includes(String(value.channelKey)) && value.visibility === "public";
}
