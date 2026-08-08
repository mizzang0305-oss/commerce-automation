import { buildRollingEventWindow, listCommerceEventsForWindow } from "@/lib/coupang/eventCalendar";
import { buildEventProductKeywordPlan } from "@/lib/coupang/eventProductKeywordPlanner";
import type { LiveProductKeywordContext } from "./types";

export function buildLiveProductKeywordContexts(today: string | Date = new Date()): {
  window: ReturnType<typeof buildRollingEventWindow>;
  contexts: LiveProductKeywordContext[];
} {
  const window = buildRollingEventWindow({ today });
  const events = listCommerceEventsForWindow(window);
  const plans = events.map((event) => ({ event, plan: buildEventProductKeywordPlan(event) }));
  if (plans.length === 0) return { window, contexts: [] };

  const findKeyword = (pattern: RegExp) => plans.flatMap(({ event, plan }) =>
    [...plan.primaryKeywords, ...plan.secondaryKeywords].map((keyword) => ({ event, plan, keyword }))
  ).find(({ keyword }) => pattern.test(keyword));
  const vehicle = findKeyword(/차량/u);
  const desk = findKeyword(/책상/u);
  const camping = plans.find(({ event }) => /camping/u.test(event.eventId)) ?? plans[0];
  const contexts: LiveProductKeywordContext[] = [];
  if (vehicle) contexts.push(context(vehicle));
  if (desk) contexts.push(context(desk));
  contexts.push({
    keyword: "캠핑 빨래건조대",
    eventId: camping.event.eventId,
    eventName: camping.event.name,
    plan: { ...camping.plan, primaryKeywords: ["캠핑 빨래건조대", ...camping.plan.primaryKeywords] }
  });
  for (const value of plans.slice(0, 4).flatMap(({ event, plan }) => plan.primaryKeywords.map((keyword) => ({ event, plan, keyword })))) {
    if (contexts.length >= 5) break;
    if (!contexts.some((entry) => entry.keyword === value.keyword)) contexts.push(context(value));
  }
  return { window, contexts: contexts.slice(0, 5) };
}

export function buildDaily69KeywordContexts(today: string | Date = new Date(), maximum = 15): {
  window: ReturnType<typeof buildRollingEventWindow>;
  contexts: LiveProductKeywordContext[];
} {
  const base = buildLiveProductKeywordContexts(today);
  const template = (pattern: RegExp) => base.contexts.find((entry) => pattern.test(entry.keyword)) ?? base.contexts[0];
  if (!template(/./u)) return base;
  const groups: Array<{ pattern: RegExp; keywords: string[] }> = [
    { pattern: /차량/u, keywords: ["차량용 정리함", "차량 수납함", "자동차 트렁크 정리함", "차량 컵홀더 정리", "차박 수납 정리"] },
    { pattern: /책상/u, keywords: ["책상 케이블 정리", "데스크 선정리", "충전선 정리함", "전선 정리 클립", "책상 수납 정리"] },
    { pattern: /빨래|건조/u, keywords: ["캠핑 빨래건조대", "접이식 빨래건조대", "실내 빨래 건조대", "세탁실 행거", "공간절약 건조대"] }
  ];
  const contexts: LiveProductKeywordContext[] = [];
  for (const group of groups) {
    const source = template(group.pattern);
    if (!source) continue;
    for (const keyword of group.keywords) {
      contexts.push({ ...source, keyword, plan: { ...source.plan, primaryKeywords: [keyword, ...source.plan.primaryKeywords.filter((value) => value !== keyword)] } });
    }
  }
  return { window: base.window, contexts: contexts.slice(0, Math.max(1, Math.min(15, maximum))) };
}

function context(input: { event: { eventId: string; name: string }; plan: LiveProductKeywordContext["plan"]; keyword: string }): LiveProductKeywordContext {
  return { keyword: input.keyword, eventId: input.event.eventId, eventName: input.event.name, plan: { ...input.plan, primaryKeywords: [input.keyword, ...input.plan.primaryKeywords.filter((value) => value !== input.keyword)] } };
}
