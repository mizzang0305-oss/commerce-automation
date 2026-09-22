import type { StudioModel, StudioSlot, StudioContent } from "@/lib/commerce-studio/model";
import { emptyStudioModel } from "@/lib/commerce-studio/model";
import type { StudioSnapshot, StudioSnapshotPayload } from "./contracts";

type Stored = { envelope: StudioSnapshot; payload: StudioSnapshotPayload; receivedAt: string };
const CHANNELS = [
  { key: "neoman_moleulgeol" as const, title: "너만모를껄?", expectedChannelId: "UCOdvPLaFnvzAI-_VyIXTdOw" },
  { key: "father_jobs" as const, title: "father jobs", expectedChannelId: "UC38rroV6ZRTIzqKgWr5vWrw" }
];

export function studioModelFromSnapshot(stored: Stored | null, now = new Date(), commandsAvailable = false): StudioModel {
  const model = emptyStudioModel(now);
  model.commandsAvailable = false;
  model.youtubeChannels = CHANNELS.map((channel) => ({ ...channel, credentialConfigured: false, historicalPublicationObserved: false }));
  if (!stored) {
    model.producerSafeError = "STUDIO_HOST_SNAPSHOT_NOT_RECEIVED";
    model.publisherSafeError = "STUDIO_HOST_SNAPSHOT_NOT_RECEIVED";
    return model;
  }
  const { payload, envelope, receivedAt } = stored;
  const producer = payload.producer;
  const publisher = payload.publisher;
  const today = kstDate(now);
  const dates = Array.from({ length: 21 }, (_, index) => {
    const start = Date.parse(`${today}T00:00:00Z`);
    return new Date(start + (index - 14) * 86_400_000).toISOString().slice(0, 10);
  });
  const jobs = publisher?.jobs ?? [];
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const records = producer?.slots ?? [];
  const recordByKey = new Map(records.map((record) => [`${record.date}|${record.slot}`, record]));
  const planByKey = new Map((payload.plans ?? []).map((plan) => [plan.planId, plan]));
  const keys = new Set(records.map((record) => `${record.date}|${record.slot}`));
  if (producer) for (const date of dates.filter((value) => value >= today))
    for (const slot of producer.settings.generationSlots) keys.add(`${date}|${slot}`);
  for (const plan of payload.plans ?? []) keys.add(plan.planId);
  const slots: StudioSlot[] = [...keys].sort().map((key) => {
    const [date, time] = key.split("|");
    const record = recordByKey.get(key);
    const job = record?.uploadJobId ? jobById.get(record.uploadJobId) : undefined;
    const plan = planByKey.get(key);
    const candidate = (payload.candidates ?? []).find((item) => item.snapshotId === plan?.candidateSnapshotId && item.productId === plan?.exactProductId);
    return {
      date, time,
      status: record?.status ?? (producer?.settings.enabled === false ? "disabled" :
        `${date}T${time}` <= kstDateTime(now) ? "unknown" : "scheduled"),
      productName: job?.productName ?? candidate?.productName ?? null,
      productId: record?.productId || plan?.exactProductId || null,
      planVersion: plan?.version ?? 0,
      planStatus: plan?.status ?? null,
      channelKey: job?.channelKey ?? plan?.channelKey ?? null,
      publishStatus: job?.status ?? null,
      youtubeUrl: safeYouTubeUrl(job?.youtubeUrl),
      safeError: record?.safeError || null
    };
  });
  const contents: StudioContent[] = jobs.map((job) => ({
    id: job.id, evidenceSource: "job", productName: job.productName, channelKey: job.channelKey,
    status: job.status, createdAt: job.createdAt, publishedAt: job.publishedAt,
    youtubeUrl: safeYouTubeUrl(job.youtubeUrl), title: job.title
  }));
  const jobVideoIds = new Set(jobs.map((job) => job.youtubeVideoId).filter(Boolean));
  for (const ledger of publisher?.ledger ?? []) {
    if (jobVideoIds.has(ledger.youtubeVideoId)) continue;
    contents.push({ id: `ledger:${ledger.youtubeVideoId}`, evidenceSource: "ledger",
      productName: "상품명 기록 없음", channelKey: ledger.channelKey, status: "uploaded",
      createdAt: ledger.recordedAt, publishedAt: ledger.publishedAt,
      youtubeUrl: safeYouTubeUrl(ledger.youtubeUrl), title: "" });
  }
  contents.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const stale = now.getTime() - Date.parse(envelope.observedAt) > 180_000 || now.getTime() - Date.parse(receivedAt) > 180_000;
  return {
    ...model, observedAt: envelope.observedAt, queriedAt: now.toISOString(),
    producerObservedAt: producer ? envelope.observedAt : null,
    publisherObservedAt: publisher ? envelope.observedAt : null,
    receivedAt, sourceStale: stale, commandsAvailable: commandsAvailable && !stale,
    producerSource: producer ? "connected" : "unavailable",
    publisherSource: publisher ? "connected" : "unavailable",
    producerSafeError: producer ? null : "STUDIO_PRODUCER_SOURCE_UNKNOWN",
    publisherSafeError: publisher ? null : "STUDIO_PUBLISHER_SOURCE_UNKNOWN",
    settings: producer ? { enabled: producer.settings.enabled, dailyGenerateTarget: producer.settings.dailyGenerateTarget,
      generationSlots: producer.settings.generationSlots, maxItemsPerRun: producer.settings.maxItemsPerRun,
      revision: producer.settings.revision } : null,
    calendarDates: dates, slots, contents,
    candidates: (payload.candidates ?? []).map((candidate) => ({ snapshotId: candidate.snapshotId,
      slotId: candidate.slotId, productId: candidate.productId, productName: candidate.productName,
      channelKey: candidate.channelKey, eligible: candidate.eligible, safeBlockers: candidate.safeBlockers })),
    youtubeChannels: CHANNELS.map((channel) => ({ ...channel, credentialConfigured: false,
      historicalPublicationObserved: Boolean(publisher?.ledger.some((entry) => entry.channelKey === channel.key &&
        entry.channelId === channel.expectedChannelId && entry.visibility === "public")) }))
  };
}

function kstDate(now: Date) { return kstDateTime(now).slice(0, 10); }
function kstDateTime(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`;
}
function safeYouTubeUrl(raw?: string | null) {
  try {
    const url = new URL(raw || "");
    return url.protocol === "https:" && ["youtu.be", "youtube.com", "www.youtube.com"].includes(url.hostname) ? url.toString() : null;
  } catch { return null; }
}
