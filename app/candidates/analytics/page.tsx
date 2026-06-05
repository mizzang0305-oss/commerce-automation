import { CandidateAnalyticsDashboard } from "@/components/CandidateAnalyticsDashboard";
import { buildCandidateAnalytics, type CandidateAnalyticsFilters } from "@/lib/candidates/candidateAnalytics";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

export default async function CandidateAnalyticsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const analytics = await buildCandidateAnalytics(getAutomationRepository(), {
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
  });
  return <CandidateAnalyticsDashboard analytics={analytics} />;
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
