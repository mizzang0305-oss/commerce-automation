import type { EventCalendarItem, ProductCandidate } from "@/types/automation";

export type EventCandidateMatch = {
  event_key: string;
  event_name: string;
  match_score: number;
  match_reason: string;
  recommended_publish_date: string;
  recommended_production_date: string;
  excluded: boolean;
  excluded_reason: string;
};

const DAY_MS = 86_400_000;

function normalize(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysUntil(from: Date, target: Date) {
  return Math.ceil((startOfUtcDay(target).getTime() - startOfUtcDay(from).getTime()) / DAY_MS);
}

function includesAny(haystack: string, needles: string[]) {
  return needles.some((needle) => {
    const normalizedNeedle = normalize(needle);
    return normalizedNeedle && haystack.includes(normalizedNeedle);
  });
}

function getCandidateSearchText(candidate: ProductCandidate) {
  return [
    candidate.product_name,
    candidate.category,
    candidate.source_name,
    candidate.source_type,
    candidate.platform,
    ...Object.values(candidate.payload ?? {}).flatMap((value) => {
      if (Array.isArray(value)) {
        return value.map(String);
      }
      return typeof value === "string" || typeof value === "number" ? [String(value)] : [];
    })
  ]
    .map(normalize)
    .filter(Boolean)
    .join(" ");
}

function getCandidateCategory(candidate: ProductCandidate) {
  const payloadCategory = candidate.payload?.category_path ?? candidate.payload?.category;
  return normalize(candidate.category || payloadCategory);
}

function recommendedPublishDate(event: EventCalendarItem) {
  const startsAt = new Date(event.starts_at);
  return dateOnly(new Date(startsAt.getTime() - Math.max(1, event.lead_days_min) * DAY_MS));
}

export function getUpcomingEvents(events: EventCalendarItem[], now = new Date(), windowDays = 30) {
  return events
    .filter((event) => event.status === "active")
    .filter((event) => {
      const days = daysUntil(now, new Date(event.starts_at));
      return days >= event.lead_days_min && days <= Math.min(windowDays, event.lead_days_max);
    })
    .sort((a, b) => {
      const daysA = daysUntil(now, new Date(a.starts_at));
      const daysB = daysUntil(now, new Date(b.starts_at));
      return daysA - daysB || b.priority - a.priority || b.seasonality_score - a.seasonality_score;
    });
}

export function explainEventMatch(candidate: ProductCandidate, event: EventCalendarItem) {
  const text = getCandidateSearchText(candidate);
  const category = getCandidateCategory(candidate);
  const matchedKeywords = event.target_keywords.filter((keyword) => includesAny(text, [keyword]));
  const matchedCategories = event.target_categories.filter((targetCategory) => {
    const normalizedCategory = normalize(targetCategory);
    return normalizedCategory && category.includes(normalizedCategory);
  });

  const reasons = [
    matchedKeywords.length ? `키워드 ${matchedKeywords.join(", ")} 일치` : "",
    matchedCategories.length ? `카테고리 ${matchedCategories.join(", ")} 일치` : "",
    event.priority >= 80 ? `이벤트 우선순위 ${event.priority}` : "",
    candidate.candidate_score ? `후보 점수 ${candidate.candidate_score}` : ""
  ].filter(Boolean);

  return reasons.length ? reasons.join(" · ") : "이벤트 키워드와 후보 정보의 직접 매칭은 약하지만 제작 후보로 평가했습니다.";
}

export function scoreEventCandidate(candidate: ProductCandidate, event: EventCalendarItem): EventCandidateMatch {
  const text = getCandidateSearchText(candidate);
  const category = getCandidateCategory(candidate);

  if (!candidate.selected_affiliate_url?.trim()) {
    return excludedMatch(event, "제휴 링크가 없어 이벤트 제작 후보에서 제외했습니다.");
  }
  if (candidate.duplicate_status && candidate.duplicate_status !== "unique" && candidate.duplicate_status !== "unknown") {
    return excludedMatch(event, "중복 후보는 이벤트 제작 후보에서 제외했습니다.");
  }
  if (event.excluded_keywords.length > 0 && includesAny(text, event.excluded_keywords)) {
    return excludedMatch(event, "제외 키워드가 포함되어 이벤트 제작 후보에서 제외했습니다.");
  }

  const keywordScore = event.target_keywords.reduce((score, keyword) => score + (includesAny(text, [keyword]) ? 18 : 0), 0);
  const categoryScore = event.target_categories.reduce((score, targetCategory) => {
    const normalizedCategory = normalize(targetCategory);
    return score + (normalizedCategory && category.includes(normalizedCategory) ? 28 : 0);
  }, 0);
  const candidateScore = Math.max(0, Math.min(100, candidate.candidate_score ?? 0)) * 0.45;
  const readinessBonus = candidate.promotion_status === "ready" ? 20 : 0;
  const eventPayloadBonus = normalize(candidate.payload?.event_key) === normalize(event.event_key) ? 20 : 0;
  const matchScore = Math.round(
    event.priority +
      event.seasonality_score +
      keywordScore +
      categoryScore +
      candidateScore +
      readinessBonus +
      eventPayloadBonus
  );

  return {
    event_key: event.event_key,
    event_name: event.event_name,
    match_score: matchScore,
    match_reason: explainEventMatch(candidate, event),
    recommended_publish_date: recommendedPublishDate(event),
    recommended_production_date: dateOnly(new Date()),
    excluded: false,
    excluded_reason: ""
  };
}

export function matchCandidateToEvents(candidate: ProductCandidate, events: EventCalendarItem[], now = new Date()) {
  return getUpcomingEvents(events, now, 30)
    .map((event) => ({
      ...scoreEventCandidate(candidate, event),
      recommended_production_date: dateOnly(now)
    }))
    .filter((match) => !match.excluded)
    .sort((a, b) => b.match_score - a.match_score || a.event_key.localeCompare(b.event_key));
}

function excludedMatch(event: EventCalendarItem, reason: string): EventCandidateMatch {
  return {
    event_key: event.event_key,
    event_name: event.event_name,
    match_score: 0,
    match_reason: "",
    recommended_publish_date: recommendedPublishDate(event),
    recommended_production_date: dateOnly(new Date()),
    excluded: true,
    excluded_reason: reason
  };
}
