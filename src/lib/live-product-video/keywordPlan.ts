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

function context(input: { event: { eventId: string; name: string }; plan: LiveProductKeywordContext["plan"]; keyword: string }): LiveProductKeywordContext {
  return { keyword: input.keyword, eventId: input.event.eventId, eventName: input.event.name, plan: { ...input.plan, primaryKeywords: [input.keyword, ...input.plan.primaryKeywords.filter((value) => value !== input.keyword)] } };
}
