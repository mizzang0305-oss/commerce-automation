import { NextResponse } from "next/server";
import {
  buildCandidateAnalytics,
  normalizeCandidateAnalyticsFilters,
  validateCandidateAnalyticsFilters,
  type CandidateAnalyticsFilters
} from "@/lib/candidates/candidateAnalytics";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const filters: CandidateAnalyticsFilters = {
    from: valueOrUndefined(url.searchParams.get("from")),
    to: valueOrUndefined(url.searchParams.get("to")),
    keyword: valueOrUndefined(url.searchParams.get("keyword")),
    category: valueOrUndefined(url.searchParams.get("category")),
    risk_flag: valueOrUndefined(url.searchParams.get("risk_flag")),
    status: valueOrUndefined(url.searchParams.get("status")),
    min_score: numberOrUndefined(url.searchParams.get("min_score")),
    max_score: numberOrUndefined(url.searchParams.get("max_score")),
    collected_mode: valueOrUndefined(url.searchParams.get("collected_mode")),
    collector_version: valueOrUndefined(url.searchParams.get("collector_version")),
    sort: valueOrUndefined(url.searchParams.get("sort")) as CandidateAnalyticsFilters["sort"],
    limit: numberOrUndefined(url.searchParams.get("limit"))
  };
  const appliedFilters = normalizeCandidateAnalyticsFilters(filters);
  const validation = validateCandidateAnalyticsFilters(appliedFilters);
  if (!validation.ok) {
    return NextResponse.json(validation, { status: validation.status });
  }
  const analytics = await buildCandidateAnalytics(getAutomationRepository(), filters);
  return NextResponse.json(analytics);
}

function valueOrUndefined(value: string | null) {
  return value?.trim() || undefined;
}

function numberOrUndefined(value: string | null) {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
