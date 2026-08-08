import { buildRollingEventWindow, listCommerceEventsForWindow } from "@/lib/coupang/eventCalendar";
import { buildEventProductKeywordPlan } from "@/lib/coupang/eventProductKeywordPlanner";
import type { LiveProductKeywordContext } from "./types";
import { SUPPORTED_USAGE_EVIDENCE_USE_CASES, type SupportedUsageEvidenceUseCase } from "@/lib/usage-evidence";

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

export function buildDaily69KeywordContexts(today: string | Date = new Date(), maximum = 30, supportedUseCases: SupportedUsageEvidenceUseCase[] = Object.keys(SUPPORTED_USAGE_EVIDENCE_USE_CASES) as SupportedUsageEvidenceUseCase[]): {
  window: ReturnType<typeof buildRollingEventWindow>;
  contexts: LiveProductKeywordContext[];
} {
  const base = buildLiveProductKeywordContexts(today);
  const template = (pattern: RegExp) => base.contexts.find((entry) => pattern.test(entry.keyword)) ?? base.contexts[0];
  if (!template(/./u)) return base;
  const contexts: LiveProductKeywordContext[] = [];
  const maximumKeywordCount = Math.max(...supportedUseCases.map((useCase) => SUPPORTED_USAGE_EVIDENCE_USE_CASES[useCase].keywords.length), 0);
  for (let keywordIndex = 0; keywordIndex < maximumKeywordCount; keywordIndex += 1) {
    for (const useCase of supportedUseCases) {
      const definition = SUPPORTED_USAGE_EVIDENCE_USE_CASES[useCase];
      const source = template(useCase.startsWith("vehicle") ? /차량/u : useCase.includes("laundry") ? /빨래|건조/u : /책상/u);
      const keyword = definition.keywords[keywordIndex];
      if (!source || !keyword) continue;
      contexts.push({ ...source, keyword, plan: { ...source.plan, primaryKeywords: [keyword, ...source.plan.primaryKeywords.filter((value) => value !== keyword)] } });
    }
  }
  return { window: base.window, contexts: [...new Map(contexts.map((entry) => [entry.keyword, entry])).values()].slice(0, Math.max(1, Math.min(30, maximum))) };
}

function context(input: { event: { eventId: string; name: string }; plan: LiveProductKeywordContext["plan"]; keyword: string }): LiveProductKeywordContext {
  return { keyword: input.keyword, eventId: input.event.eventId, eventName: input.event.name, plan: { ...input.plan, primaryKeywords: [input.keyword, ...input.plan.primaryKeywords.filter((value) => value !== input.keyword)] } };
}
