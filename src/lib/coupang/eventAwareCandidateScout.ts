import { buildCoupangCandidate, type CoupangCandidateInput } from "@/lib/coupang/coupangCandidateImport";
import { buildRollingEventWindow, listCommerceEventsForWindow, type CommerceEvent, type EventWindow } from "@/lib/coupang/eventCalendar";
import { buildEventProductKeywordPlan, type EventProductKeywordPlan } from "@/lib/coupang/eventProductKeywordPlanner";
import {
  hasAffiliate,
  hasImage,
  rankEventAwareCandidates,
  type EventAwareCandidateScore
} from "@/lib/coupang/eventCandidateRanking";
import type { AutomationRepository } from "@/lib/repositories/types";
import type { ProductCandidate } from "@/types/automation";

export type EventAwareCandidateScoutSideEffects = {
  candidate_import_written: boolean;
  db_write_scope: "candidate_import_only" | "none";
  render_attempted: false;
  mp4_created: false;
  r2_uploaded: false;
  product_assets_written: false;
  youtube_execute_called: false;
  videos_insert_called: false;
  public_upload: false;
  unlisted_upload: false;
};

export type EventAwareCoupangProductSearch = (input: {
  keyword: string;
  event: CommerceEvent;
  plan: EventProductKeywordPlan;
  limit: number;
}) => Promise<CoupangCandidateInput[]>;

export type EventAwareCandidateScoutRepository = Pick<
  AutomationRepository,
  "getProductCandidates" | "upsertProductCandidates"
>;

export type EventAwareSafeCandidate = {
  id: string;
  product_name: string;
  category: string;
  affiliate_url_present: boolean;
  product_image_present: boolean;
};

export type EventAwareCandidateScoutResult = {
  ok: boolean;
  event_window: EventWindow;
  events_found: number;
  event_sources: CommerceEvent["source"][];
  selected_event: CommerceEvent | null;
  keyword_plan: EventProductKeywordPlan | null;
  selected_candidate: EventAwareSafeCandidate | null;
  selected_score: EventAwareCandidateScore | null;
  ready_for_low_cost_motion_v1_1_render: boolean;
  blocked_reasons: string[];
  safe_summary: {
    baseline_candidate_excluded: boolean;
    affiliate_url_present: boolean;
    product_image_present: boolean;
    policy_risk_clear: boolean;
    low_cost_motion_suitable: boolean;
    raw_urls_printed: false;
  };
  side_effects: EventAwareCandidateScoutSideEffects;
};

export async function scoutEventAwareCoupangCandidate(input: {
  today?: string | Date;
  baselineCandidateId: string;
  repository?: EventAwareCandidateScoutRepository;
  existingCandidates?: ProductCandidate[];
  searchProducts?: EventAwareCoupangProductSearch;
  dynamicEvents?: CommerceEvent[];
  maxKeywordsToScout?: number;
  searchLimitPerKeyword?: number;
}): Promise<EventAwareCandidateScoutResult> {
  const eventWindow = buildRollingEventWindow({ today: input.today });
  const events = listCommerceEventsForWindow(eventWindow, { dynamicEvents: input.dynamicEvents });
  const selectedEvent = events[0] ?? null;
  const keywordPlan = selectedEvent ? buildEventProductKeywordPlan(selectedEvent) : null;
  const existingCandidates = input.existingCandidates ?? await input.repository?.getProductCandidates() ?? [];
  const baseline = existingCandidates.find((candidate) => candidate.id === input.baselineCandidateId);
  const sideEffects = noSideEffects();

  if (!selectedEvent || !keywordPlan) {
    return blockedResult(eventWindow, events, selectedEvent, keywordPlan, ["EVENT_AWARE_EVENT_NOT_FOUND"], sideEffects);
  }
  if (!input.searchProducts) {
    return blockedResult(eventWindow, events, selectedEvent, keywordPlan, ["EVENT_AWARE_SCOUT_PROVIDER_NOT_CONFIGURED"], sideEffects);
  }

  const keywordInputs = await collectScoutInputs({
    searchProducts: input.searchProducts,
    event: selectedEvent,
    plan: keywordPlan,
    maxKeywordsToScout: input.maxKeywordsToScout ?? 3,
    searchLimitPerKeyword: input.searchLimitPerKeyword ?? 5
  });
  const importedCandidates = keywordInputs.flatMap((candidateInput) =>
    buildCandidate(candidateInput, existingCandidates)
  );
  const ranked = rankEventAwareCandidates(importedCandidates, keywordPlan, {
    baselineCandidateId: input.baselineCandidateId,
    baselineProductKeys: baseline?.product_key ? [baseline.product_key] : [],
    baselineProductNames: baseline?.product_name ? [baseline.product_name] : []
  });
  const selected = ranked[0] ?? null;

  if (!selected) {
    return blockedResult(eventWindow, events, selectedEvent, keywordPlan, ["EVENT_AWARE_CANDIDATE_NOT_FOUND"], sideEffects);
  }

  if (input.repository) {
    await input.repository.upsertProductCandidates([selected.candidate]);
    sideEffects.candidate_import_written = true;
    sideEffects.db_write_scope = "candidate_import_only";
  }

  return {
    ok: true,
    event_window: eventWindow,
    events_found: events.length,
    event_sources: unique(events.map((event) => event.source)),
    selected_event: selectedEvent,
    keyword_plan: keywordPlan,
    selected_candidate: toSafeCandidate(selected.candidate),
    selected_score: selected.score,
    ready_for_low_cost_motion_v1_1_render: true,
    blocked_reasons: [],
    safe_summary: {
      baseline_candidate_excluded: selected.candidate.id !== input.baselineCandidateId,
      affiliate_url_present: hasAffiliate(selected.candidate),
      product_image_present: hasImage(selected.candidate),
      policy_risk_clear: selected.score.policySafetyScore === 100,
      low_cost_motion_suitable: selected.score.motionSuitabilityScore >= 60,
      raw_urls_printed: false
    },
    side_effects: sideEffects
  };
}

async function collectScoutInputs(input: {
  searchProducts: EventAwareCoupangProductSearch;
  event: CommerceEvent;
  plan: EventProductKeywordPlan;
  maxKeywordsToScout: number;
  searchLimitPerKeyword: number;
}) {
  const keywords = [...input.plan.primaryKeywords, ...input.plan.secondaryKeywords].slice(0, input.maxKeywordsToScout);
  const results: CoupangCandidateInput[] = [];
  for (const keyword of keywords) {
    const candidates = await input.searchProducts({
      keyword,
      event: input.event,
      plan: input.plan,
      limit: input.searchLimitPerKeyword
    });
    results.push(...candidates);
  }
  return results;
}

function buildCandidate(input: CoupangCandidateInput, existingCandidates: ProductCandidate[]) {
  try {
    return [
      buildCoupangCandidate(
        {
          ...input,
          source_type: input.source_type ?? "event_aware_scout",
          source: input.source ?? "event_aware_coupang_scout"
        },
        { candidates: existingCandidates }
      ).candidate
    ];
  } catch {
    return [];
  }
}

function blockedResult(
  eventWindow: EventWindow,
  events: CommerceEvent[],
  selectedEvent: CommerceEvent | null,
  keywordPlan: EventProductKeywordPlan | null,
  blockedReasons: string[],
  sideEffects: EventAwareCandidateScoutSideEffects
): EventAwareCandidateScoutResult {
  return {
    ok: false,
    event_window: eventWindow,
    events_found: events.length,
    event_sources: unique(events.map((event) => event.source)),
    selected_event: selectedEvent,
    keyword_plan: keywordPlan,
    selected_candidate: null,
    selected_score: null,
    ready_for_low_cost_motion_v1_1_render: false,
    blocked_reasons: blockedReasons,
    safe_summary: {
      baseline_candidate_excluded: false,
      affiliate_url_present: false,
      product_image_present: false,
      policy_risk_clear: false,
      low_cost_motion_suitable: false,
      raw_urls_printed: false
    },
    side_effects: sideEffects
  };
}

function toSafeCandidate(candidate: ProductCandidate): EventAwareSafeCandidate {
  return {
    id: candidate.id,
    product_name: candidate.product_name,
    category: candidate.category ?? "",
    affiliate_url_present: hasAffiliate(candidate),
    product_image_present: hasImage(candidate)
  };
}

function noSideEffects(): EventAwareCandidateScoutSideEffects {
  return {
    candidate_import_written: false,
    db_write_scope: "none",
    render_attempted: false,
    mp4_created: false,
    r2_uploaded: false,
    product_assets_written: false,
    youtube_execute_called: false,
    videos_insert_called: false,
    public_upload: false,
    unlisted_upload: false
  };
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}
