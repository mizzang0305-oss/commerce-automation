import { CandidateAnalyticsDashboard } from "@/components/CandidateAnalyticsDashboard";
import {
  buildCandidateAnalytics,
  buildCandidateSeedDryRunPlan,
  type CandidateAnalyticsFilters,
  type CandidateSeedPlanOptions
} from "@/lib/candidates/candidateAnalytics";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

export default async function CandidateAnalyticsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const repository = getAutomationRepository();
  const filters: CandidateAnalyticsFilters = {
    from: param(params, "from"),
    to: param(params, "to"),
    keyword: param(params, "keyword"),
    category: param(params, "category"),
    risk_flag: param(params, "risk_flag"),
    status: param(params, "status"),
    min_score: numberParam(params, "min_score"),
    max_score: numberParam(params, "max_score"),
    collected_mode: param(params, "collected_mode"),
    collector_version: param(params, "collector_version"),
    sort: param(params, "sort") as CandidateAnalyticsFilters["sort"],
    limit: numberParam(params, "limit")
  };
  const [analytics, seedPlan] = await Promise.all([
    buildCandidateAnalytics(repository, filters),
    buildCandidateSeedDryRunPlan(repository, filters, {
      strategy: param(params, "strategy") as CandidateSeedPlanOptions["strategy"],
      max_keywords: numberParam(params, "max_keywords"),
      limit_per_keyword: numberParam(params, "limit_per_keyword"),
      include_keep: booleanParam(params, "include_keep"),
      include_expand: booleanParam(params, "include_expand"),
      include_review: booleanParam(params, "include_review"),
      include_avoid: booleanParam(params, "include_avoid")
    })
  ]);
  return <CandidateAnalyticsDashboard analytics={analytics} seedPlan={seedPlan} />;
}

function param(params: Record<string, string | string[] | undefined> | undefined, key: string) {
  const value = params?.[key];
  return Array.isArray(value) ? value[0] : value;
}

function numberParam(params: Record<string, string | string[] | undefined> | undefined, key: string) {
  const value = param(params, key);
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function booleanParam(params: Record<string, string | string[] | undefined> | undefined, key: string) {
  const value = param(params, key);
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return undefined;
}
