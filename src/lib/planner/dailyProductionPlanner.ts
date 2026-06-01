import type {
  ChannelProfile,
  DailyProductionPlan,
  DailyProductionPlanItem,
  EventCalendarItem,
  ProductCandidate,
  ProductionHistory
} from "@/types/automation";
import { matchCandidateToEvents, scoreEventCandidate, type EventCandidateMatch } from "@/lib/events/eventMatching";

export type DailyProductionPlanInput = {
  date: string;
  candidates: ProductCandidate[];
  events: EventCalendarItem[];
  channelProfiles: ChannelProfile[];
  targetCount: number;
  productionHistory?: ProductionHistory[];
  now?: Date;
};

export type ExcludedPlanCandidate = {
  candidate_id: string;
  product_name: string;
  reason: string;
};

export type DailyProductionPlanBuildResult = {
  plan: DailyProductionPlan;
  items: DailyProductionPlanItem[];
  matches: Array<EventCandidateMatch & { candidate_id: string; target_channel_id: string }>;
  excluded: ExcludedPlanCandidate[];
  channel_safety: {
    youtube_upload_enabled: boolean;
    manual_upload_only: boolean;
  };
};

function nowIso(now = new Date()) {
  return now.toISOString();
}

function normalize(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function getCandidateCategory(candidate: ProductCandidate) {
  const payloadCategory = candidate.payload?.category_path ?? candidate.payload?.category;
  return normalize(candidate.category || payloadCategory);
}

function getHistoryProductKey(history: ProductionHistory) {
  const value = history.metadata?.product_key;
  return typeof value === "string" ? value : "";
}

function createdOnDate(history: ProductionHistory, date: string) {
  return history.created_at.slice(0, 10) === date;
}

function activeChannels(channels: ChannelProfile[]) {
  return channels.filter((channel) => channel.status === "active");
}

export function assignChannelProfile(candidate: ProductCandidate, channels: ChannelProfile[]) {
  const category = getCandidateCategory(candidate);
  const availableChannels = activeChannels(channels);
  const matched = availableChannels.find((channel) => {
    const excluded = channel.excluded_categories.some((item) => category.includes(normalize(item)));
    if (excluded) {
      return false;
    }
    return channel.allowed_categories.some((item) => category.includes(normalize(item)));
  });

  return matched ?? availableChannels[0] ?? null;
}

export function explainPlanItem(candidate: ProductCandidate, match: EventCandidateMatch, channel: ChannelProfile) {
  return [
    `${match.event_name} 이벤트 매칭`,
    match.match_reason,
    `${channel.channel_name} 채널 수동 업로드 패키지 대상`,
    candidate.candidate_score ? `후보 점수 ${candidate.candidate_score}` : ""
  ].filter(Boolean).join(" · ");
}

export function rankPlanItems<T extends { match_score: number; candidate_score: number; event_key: string }>(items: T[]) {
  return [...items].sort(
    (a, b) => b.match_score - a.match_score || b.candidate_score - a.candidate_score || a.event_key.localeCompare(b.event_key)
  );
}

export function buildDailyProductionPlan(input: DailyProductionPlanInput): DailyProductionPlanBuildResult {
  const now = input.now ?? new Date();
  const createdAt = nowIso(now);
  const targetCount = Math.max(0, input.targetCount);
  const producedToday = new Set(
    (input.productionHistory ?? [])
      .filter((history) => createdOnDate(history, input.date))
      .map(getHistoryProductKey)
      .filter(Boolean)
  );
  const excluded: ExcludedPlanCandidate[] = [];

  const scored = input.candidates.flatMap((candidate) => {
    if (!candidate.selected_affiliate_url?.trim()) {
      excluded.push({
        candidate_id: candidate.id,
        product_name: candidate.product_name,
        reason: "제휴 링크가 없어 당일 제작 계획에서 제외했습니다."
      });
      return [];
    }
    if (candidate.duplicate_status && candidate.duplicate_status !== "unique" && candidate.duplicate_status !== "unknown") {
      excluded.push({
        candidate_id: candidate.id,
        product_name: candidate.product_name,
        reason: "중복 후보는 당일 제작 계획에서 제외했습니다."
      });
      return [];
    }
    if (candidate.promotion_status && candidate.promotion_status !== "ready") {
      excluded.push({
        candidate_id: candidate.id,
        product_name: candidate.product_name,
        reason: "승격 준비 상태가 아니어서 당일 제작 계획에서 제외했습니다."
      });
      return [];
    }
    if (candidate.product_key && producedToday.has(candidate.product_key)) {
      excluded.push({
        candidate_id: candidate.id,
        product_name: candidate.product_name,
        reason: "오늘 이미 제작한 product_key라 당일 제작 계획에서 제외했습니다."
      });
      return [];
    }

    return matchCandidateToEvents(candidate, input.events, now).map((match) => {
      const channel = assignChannelProfile(candidate, input.channelProfiles);
      if (!channel) {
        return null;
      }
      return {
        candidate,
        channel,
        match,
        match_score: match.match_score,
        candidate_score: candidate.candidate_score ?? 0,
        event_key: match.event_key
      };
    }).filter((item): item is NonNullable<typeof item> => Boolean(item));
  });

  const selected = rankPlanItems(scored).slice(0, targetCount);
  const plan: DailyProductionPlan = {
    id: `daily-plan-${input.date}`,
    plan_date: input.date,
    status: "draft",
    target_video_count: targetCount,
    created_at: createdAt,
    updated_at: createdAt
  };
  const items: DailyProductionPlanItem[] = selected.map((item, index) => ({
    id: `${plan.id}-${index + 1}`,
    plan_id: plan.id,
    product_candidate_id: item.candidate.id,
    product_queue_id: item.candidate.promoted_queue_id ?? "",
    event_key: item.match.event_key,
    target_channel_id: item.channel.id,
    rank: index + 1,
    status: "planned",
    reason: explainPlanItem(item.candidate, item.match, item.channel),
    created_at: createdAt
  }));

  return {
    plan,
    items,
    matches: selected.map((item) => ({
      ...item.match,
      candidate_id: item.candidate.id,
      target_channel_id: item.channel.id
    })),
    excluded,
    channel_safety: {
      youtube_upload_enabled: selected.some((item) => item.channel.upload_enabled),
      manual_upload_only: selected.length === 0 || selected.every((item) => item.channel.manual_upload_only)
    }
  };
}

export function scoreCandidateAgainstEventForPlanner(candidate: ProductCandidate, event: EventCalendarItem) {
  return scoreEventCandidate(candidate, event);
}
