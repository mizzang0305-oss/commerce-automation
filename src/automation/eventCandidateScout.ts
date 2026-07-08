import crypto from "node:crypto";

import type { ProductQueueItem } from "@/types/automation";
import type { ChannelKey } from "@/uploads/multi-channel/channelProfiles";
import { buildV102FirstVideoSettingsPreflight } from "@/uploads/youtube/v102FirstVideoSettingsPreflight";
import type { V102FirstVideoSettingsFinalStatus } from "@/uploads/youtube/v102FirstVideoSettingsPreflight";

export type V103EventWindow = {
  scoutWindowStart: string;
  scoutWindowEnd: string;
  daysAhead: 30;
  timezone: "Asia/Seoul";
};

export type V103EventType =
  | "boknal"
  | "weather"
  | "season"
  | "holiday"
  | "school"
  | "leisure";

export type V103EventCandidate = {
  candidateIdHashPrefix: string;
  channelKey: ChannelKey;
  eventName: string;
  eventKey: string;
  eventType: V103EventType;
  eventDate: string;
  daysUntilEvent: number;
  theme: string;
  productTheme: string;
  score: number;
  selectedReason: string;
  queue_status: ProductQueueItem["queue_status"];
  manual_review_status: ProductQueueItem["manual_review_status"];
};

export type V103EventCandidateScoutReport = {
  version: "v103";
  mode: "event_based_candidate_scout_30d_no_upload";
  FINAL_STATUS:
    | "SUCCESS_V103_EVENT_CANDIDATE_SCOUT_READY_NO_UPLOAD"
    | "BLOCKED_V103_NO_EVENT_CANDIDATES_CREATED";
  scoutWindowStart: string;
  scoutWindowEnd: string;
  generatedCandidateCount: number;
  channelCandidateCounts: Record<ChannelKey, number>;
  topCandidates: V103EventCandidate[];
  selectedFirstCandidate: V103EventCandidate | null;
  selectedChannelKey: ChannelKey;
  selectedTheme: string | null;
  selectedEvent: string | null;
  selectedReason: string | null;
  currentBlocker: string | null;
  v102MemoryFixture: {
    queueItems: ProductQueueItem[];
    uploadPackagesProvided: false;
  };
  v102LinkedDryRun: {
    executed: boolean;
    FINAL_STATUS: V102FirstVideoSettingsFinalStatus | null;
    selectedItemFound: boolean;
    currentBlocker: V102FirstVideoSettingsFinalStatus | null;
    uploadExecuteCalled: false;
    videosInsertCalled: false;
    videosInsertTotalCount: 0;
    commentThreadsInsertCalled: false;
    SAFE_TO_UPLOAD: false;
    SAFE_TO_PUBLIC_UPLOAD: false;
  } | null;
  queueWritePlanned: false;
  DB_write: false;
  n8nWebhookCalled: false;
  videosInsertCalled: false;
  videosInsertTotalCount: 0;
  commentThreadsInsertCalled: false;
  schedulerExecutionCalled: false;
  raw_urls_printed: false;
  raw_video_ids_printed: false;
  raw_channel_ids_printed: false;
  secrets_printed: false;
  fake_success: false;
  SAFE_TO_UPLOAD: false;
  SAFE_TO_PUBLIC_UPLOAD: false;
};

export type V103EventCandidateScoutInput = {
  today?: string | Date;
  runV102LinkedDryRun?: boolean;
};

type EventSeed = {
  eventKey: string;
  eventName: string;
  eventType: V103EventType;
  date?: string;
  startDate?: string;
  endDate?: string;
  prepDate?: string;
  priority: number;
  seasonalityScore: number;
  shortsScore: number;
  foodFitScore: number;
  repeatabilityScore: number;
  inventoryFitScore: number;
  channelWeights: Record<ChannelKey, number>;
  themes: string[];
  preCandidateOnly?: boolean;
};

const CHANNEL_KEYS: ChannelKey[] = ["father_jobs", "neoman_moleulgeol", "lets_buy"];

const EVENT_SEEDS_2026: EventSeed[] = [
  boknalSeed("chobok", "초복", "2026-07-15", ["삼계탕", "닭다리", "훈제오리", "보양식 세트", "냉면/막국수 사이드"]),
  boknalSeed("jungbok", "중복", "2026-07-25", ["삼계탕", "닭다리", "보양식 세트", "냉면/막국수 사이드"]),
  {
    ...boknalSeed("malbok-prep", "말복 사전 준비", "2026-08-08", ["보양식 세트", "훈제오리", "닭다리"]),
    preCandidateOnly: true,
    priority: 82
  },
  weatherSeed("heatwave", "폭염", "2026-07-09", "2026-08-08", ["냉면", "동치미육수", "아이스/냉동 간편식", "간단 조리 식품"]),
  weatherSeed("tropical-night", "열대야", "2026-07-09", "2026-08-08", ["냉면", "간단 조리 식품", "동치미육수"]),
  {
    eventKey: "rainy-season-tail",
    eventName: "장마 끝물",
    eventType: "weather",
    startDate: "2026-07-09",
    endDate: "2026-07-20",
    priority: 76,
    seasonalityScore: 86,
    shortsScore: 78,
    foodFitScore: 60,
    repeatabilityScore: 72,
    inventoryFitScore: 68,
    channelWeights: { father_jobs: 8, neoman_moleulgeol: 10, lets_buy: 6 },
    themes: ["실내 보관 간편식", "냉동식품 보관", "장마 끝물 메뉴"]
  },
  {
    eventKey: "summer-vacation",
    eventName: "여름휴가",
    eventType: "season",
    startDate: "2026-07-20",
    endDate: "2026-08-08",
    priority: 84,
    seasonalityScore: 90,
    shortsScore: 84,
    foodFitScore: 82,
    repeatabilityScore: 82,
    inventoryFitScore: 80,
    channelWeights: { father_jobs: 10, neoman_moleulgeol: 7, lets_buy: 9 },
    themes: ["바비큐", "돈삼겹/목살", "튀김/간식", "만두/치킨텐더"]
  },
  {
    eventKey: "camping-valley",
    eventName: "캠핑/펜션/계곡",
    eventType: "leisure",
    startDate: "2026-07-15",
    endDate: "2026-08-08",
    priority: 84,
    seasonalityScore: 90,
    shortsScore: 86,
    foodFitScore: 84,
    repeatabilityScore: 80,
    inventoryFitScore: 78,
    channelWeights: { father_jobs: 10, neoman_moleulgeol: 6, lets_buy: 9 },
    themes: ["바비큐", "돈삼겹/목살", "튀김/간식", "만두/치킨텐더"]
  },
  {
    eventKey: "summer-break",
    eventName: "여름방학",
    eventType: "school",
    startDate: "2026-07-20",
    endDate: "2026-08-08",
    priority: 78,
    seasonalityScore: 86,
    shortsScore: 78,
    foodFitScore: 78,
    repeatabilityScore: 82,
    inventoryFitScore: 76,
    channelWeights: { father_jobs: 8, neoman_moleulgeol: 7, lets_buy: 9 },
    themes: ["아이 간식", "만두", "돈까스", "치킨텐더", "떡볶이류"]
  },
  {
    eventKey: "constitution-day",
    eventName: "제헌절",
    eventType: "holiday",
    date: "2026-07-17",
    priority: 35,
    seasonalityScore: 35,
    shortsScore: 42,
    foodFitScore: 20,
    repeatabilityScore: 30,
    inventoryFitScore: 25,
    channelWeights: { father_jobs: 1, neoman_moleulgeol: 2, lets_buy: 1 },
    themes: ["국경일 간단 상차림"]
  },
  {
    eventKey: "liberation-day-prep",
    eventName: "광복절 사전 준비",
    eventType: "holiday",
    date: "2026-08-15",
    prepDate: "2026-08-01",
    priority: 54,
    seasonalityScore: 58,
    shortsScore: 52,
    foodFitScore: 42,
    repeatabilityScore: 46,
    inventoryFitScore: 48,
    channelWeights: { father_jobs: 3, neoman_moleulgeol: 4, lets_buy: 4 },
    themes: ["국경일 사전 준비 간편식"],
    preCandidateOnly: true
  }
];

export function buildV103EventWindow(today: string | Date = new Date()): V103EventWindow {
  const start = toDateOnly(today);
  return {
    scoutWindowStart: start,
    scoutWindowEnd: addDays(start, 30),
    daysAhead: 30,
    timezone: "Asia/Seoul"
  };
}

export async function buildV103EventCandidateScoutReport(
  input: V103EventCandidateScoutInput = {}
): Promise<V103EventCandidateScoutReport> {
  const today = input.today ?? new Date();
  const eventWindow = buildV103EventWindow(today);
  const candidates = buildV103EventCandidates(eventWindow);
  const selectedFirstCandidate =
    candidates.find((candidate) => candidate.channelKey === "father_jobs") ?? candidates[0] ?? null;
  const queueItems = selectedFirstCandidate
    ? [buildQueueItemFromCandidate(selectedFirstCandidate, eventWindow.scoutWindowStart)]
    : [];
  const v102LinkedDryRun = input.runV102LinkedDryRun
    ? await runV102MemoryFixture({
      selectedChannelKey: selectedFirstCandidate?.channelKey ?? "father_jobs",
      queueItems,
      now: eventWindow.scoutWindowStart
    })
    : null;

  return {
    version: "v103",
    mode: "event_based_candidate_scout_30d_no_upload",
    FINAL_STATUS: candidates.length
      ? "SUCCESS_V103_EVENT_CANDIDATE_SCOUT_READY_NO_UPLOAD"
      : "BLOCKED_V103_NO_EVENT_CANDIDATES_CREATED",
    scoutWindowStart: eventWindow.scoutWindowStart,
    scoutWindowEnd: eventWindow.scoutWindowEnd,
    generatedCandidateCount: candidates.length,
    channelCandidateCounts: countByChannel(candidates),
    topCandidates: candidates,
    selectedFirstCandidate,
    selectedChannelKey: selectedFirstCandidate?.channelKey ?? "father_jobs",
    selectedTheme: selectedFirstCandidate?.theme ?? null,
    selectedEvent: selectedFirstCandidate?.eventName ?? null,
    selectedReason: selectedFirstCandidate?.selectedReason ?? null,
    currentBlocker: candidates.length ? v102LinkedDryRun?.currentBlocker ?? null : "BLOCKED_V103_NO_EVENT_CANDIDATES_CREATED",
    v102MemoryFixture: {
      queueItems,
      uploadPackagesProvided: false
    },
    v102LinkedDryRun,
    queueWritePlanned: false,
    DB_write: false,
    n8nWebhookCalled: false,
    videosInsertCalled: false,
    videosInsertTotalCount: 0,
    commentThreadsInsertCalled: false,
    schedulerExecutionCalled: false,
    raw_urls_printed: false,
    raw_video_ids_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false,
    fake_success: false,
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false
  };
}

export function buildV103EventCandidates(window: V103EventWindow): V103EventCandidate[] {
  return EVENT_SEEDS_2026
    .filter((seed) => seedInScoutWindow(seed, window))
    .flatMap((seed) => CHANNEL_KEYS.map((channelKey) => buildCandidate(seed, channelKey, window)))
    .sort((a, b) =>
      b.score - a.score ||
      a.daysUntilEvent - b.daysUntilEvent ||
      CHANNEL_KEYS.indexOf(a.channelKey) - CHANNEL_KEYS.indexOf(b.channelKey)
    );
}

function buildCandidate(
  seed: EventSeed,
  channelKey: ChannelKey,
  window: V103EventWindow
): V103EventCandidate {
  const anchorDate = resolveSeedAnchorDate(seed, window);
  const daysUntilEvent = daysBetween(window.scoutWindowStart, anchorDate);
  const score = scoreSeedForChannel(seed, channelKey, daysUntilEvent);
  const theme = pickThemeForChannel(seed, channelKey);
  const id = `${seed.eventKey}:${channelKey}:${theme}`;

  return {
    candidateIdHashPrefix: hashPrefix(id),
    channelKey,
    eventName: seed.eventName,
    eventKey: seed.eventKey,
    eventType: seed.eventType,
    eventDate: anchorDate,
    daysUntilEvent,
    theme,
    productTheme: theme,
    score,
    selectedReason: `${seed.eventName} ${theme} 후보를 ${channelKey} 채널용으로 자동 선정`,
    queue_status: "manual_review",
    manual_review_status: "not_ready"
  };
}

function buildQueueItemFromCandidate(candidate: V103EventCandidate, today: string): ProductQueueItem {
  const createdAt = `${today}T00:00:00.000Z`;
  return {
    id: `v103-${candidate.candidateIdHashPrefix}`,
    channelKey: candidate.channelKey,
    queue_date: today,
    queue_rank: 1,
    upload_slot: 1,
    scheduled_at: createdAt,
    keyword: candidate.theme,
    theme: candidate.eventName,
    product_name: candidate.productTheme,
    category_path: `event/${candidate.eventType}`,
    price_now_text: "",
    thumbnail_url: "",
    raw_coupang_url: "",
    selected_affiliate_url: "",
    product_score: candidate.score,
    score_reason: candidate.selectedReason,
    video_angle: `${candidate.eventName} ${candidate.theme} 쇼츠 후보`,
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

async function runV102MemoryFixture(input: {
  selectedChannelKey: ChannelKey;
  queueItems: ProductQueueItem[];
  now: string;
}): Promise<NonNullable<V103EventCandidateScoutReport["v102LinkedDryRun"]>> {
  const report = await buildV102FirstVideoSettingsPreflight({
    selectedChannelKey: input.selectedChannelKey,
    queueItems: input.queueItems,
    uploadPackages: [],
    now: () => `${input.now}T00:00:00.000Z`
  });

  return {
    executed: true,
    FINAL_STATUS: report.FINAL_STATUS,
    selectedItemFound: report.selectedItemFound,
    currentBlocker: report.currentBlocker,
    uploadExecuteCalled: false,
    videosInsertCalled: false,
    videosInsertTotalCount: 0,
    commentThreadsInsertCalled: false,
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false
  };
}

function scoreSeedForChannel(seed: EventSeed, channelKey: ChannelKey, daysUntilEvent: number) {
  const proximityScore = Math.max(0, 100 - daysUntilEvent * 2);
  const baseScore =
    seed.priority * 0.26 +
    seed.foodFitScore * 0.2 +
    seed.seasonalityScore * 0.18 +
    seed.shortsScore * 0.16 +
    seed.channelWeights[channelKey] * 3 +
    seed.inventoryFitScore * 0.08 +
    seed.repeatabilityScore * 0.07 +
    proximityScore * 0.05;
  const prepPenalty = seed.preCandidateOnly ? 8 : 0;
  return Math.round(Math.max(0, Math.min(100, baseScore - prepPenalty)));
}

function seedInScoutWindow(seed: EventSeed, window: V103EventWindow) {
  const directDate = seed.date ?? seed.startDate;
  if (directDate && isBetweenInclusive(directDate, window.scoutWindowStart, window.scoutWindowEnd)) {
    return true;
  }
  if (seed.prepDate && isBetweenInclusive(seed.prepDate, window.scoutWindowStart, window.scoutWindowEnd)) {
    return true;
  }
  return false;
}

function resolveSeedAnchorDate(seed: EventSeed, window: V103EventWindow) {
  if (seed.date && isBetweenInclusive(seed.date, window.scoutWindowStart, window.scoutWindowEnd)) {
    return seed.date;
  }
  if (seed.prepDate && isBetweenInclusive(seed.prepDate, window.scoutWindowStart, window.scoutWindowEnd)) {
    return seed.prepDate;
  }
  return seed.startDate ?? seed.date ?? window.scoutWindowStart;
}

function pickThemeForChannel(seed: EventSeed, channelKey: ChannelKey) {
  if (channelKey === "father_jobs") {
    return seed.themes[0] ?? "가성비 간편식";
  }
  if (channelKey === "neoman_moleulgeol") {
    return seed.themes[Math.min(1, seed.themes.length - 1)] ?? seed.themes[0] ?? "비교형 간편식";
  }
  return seed.themes[Math.min(2, seed.themes.length - 1)] ?? seed.themes[0] ?? "특가 구성";
}

function countByChannel(candidates: V103EventCandidate[]): Record<ChannelKey, number> {
  return {
    father_jobs: candidates.filter((candidate) => candidate.channelKey === "father_jobs").length,
    neoman_moleulgeol: candidates.filter((candidate) => candidate.channelKey === "neoman_moleulgeol").length,
    lets_buy: candidates.filter((candidate) => candidate.channelKey === "lets_buy").length
  };
}

function boknalSeed(eventKey: string, eventName: string, date: string, themes: string[]): EventSeed {
  return {
    eventKey,
    eventName,
    eventType: "boknal",
    date,
    priority: 94,
    seasonalityScore: 96,
    shortsScore: 88,
    foodFitScore: 96,
    repeatabilityScore: 86,
    inventoryFitScore: 88,
    channelWeights: { father_jobs: 10, neoman_moleulgeol: 8, lets_buy: 9 },
    themes
  };
}

function weatherSeed(
  eventKey: string,
  eventName: string,
  startDate: string,
  endDate: string,
  themes: string[]
): EventSeed {
  return {
    eventKey,
    eventName,
    eventType: "weather",
    startDate,
    endDate,
    priority: 86,
    seasonalityScore: 92,
    shortsScore: 84,
    foodFitScore: 86,
    repeatabilityScore: 84,
    inventoryFitScore: 82,
    channelWeights: { father_jobs: 10, neoman_moleulgeol: 8, lets_buy: 8 },
    themes
  };
}

function toDateOnly(value: string | Date) {
  if (value instanceof Date) {
    return formatAsiaSeoulDate(value);
  }
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid V103 scout date");
  }
  return formatAsiaSeoulDate(parsed);
}

function formatAsiaSeoulDate(value: Date) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error("Unable to format V103 scout date");
  }
  return `${year}-${month}-${day}`;
}

function addDays(date: string, days: number) {
  const parsed = parseDateOnly(date);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string) {
  return Math.round((parseDateOnly(end).getTime() - parseDateOnly(start).getTime()) / 86_400_000);
}

function isBetweenInclusive(date: string, start: string, end: string) {
  return date >= start && date <= end;
}

function parseDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function hashPrefix(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 10);
}
