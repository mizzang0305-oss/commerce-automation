import type { AutomationRepository } from "@/lib/repositories/types";
import type { ProductAsset, ProductCandidate } from "@/types/automation";

export type CandidateAnalyticsFilters = {
  keyword?: string;
  category?: string;
  risk_flag?: string;
  status?: string;
  min_score?: number;
  from?: string;
  to?: string;
};

export type CandidateAnalyticsResponse = {
  ok: true;
  filters: CandidateAnalyticsFilters;
  summary: CandidateAnalyticsSummary;
  score_summary: CandidateScoreSummary;
  keyword_performance: KeywordPerformance[];
  risk_flag_performance: RiskFlagPerformance[];
  source_trace_summary: SourceTraceSummary[];
  recommendations: CandidateAnalyticsRecommendation[];
  side_effects: {
    queue_created: false;
    worker_jobs_created: false;
    upload_triggered: false;
  };
};

export interface CandidateAnalyticsSummary {
  total_candidates: number;
  collected: number;
  scored: number;
  duplicate: number;
  manual_review: number;
  rejected: number;
  promoted: number;
}

export interface CandidateScoreSummary {
  avg_final_score: number;
  avg_demand_score: number;
  avg_price_score: number;
  avg_content_angle_score: number;
  avg_risk_penalty: number;
  avg_duplicate_penalty: number;
}

export interface KeywordPerformance {
  source_keyword: string;
  candidate_count: number;
  avg_final_score: number;
  duplicate_rate: number;
  manual_review_rate: number;
  rejected_rate: number;
  promoted_rate: number;
  qa_pass_rate: number | null;
}

export interface RiskFlagPerformance {
  risk_flag: string;
  candidate_count: number;
  manual_review_rate: number;
  rejected_rate: number;
}

export interface SourceTraceSummary {
  collected_mode: string;
  candidate_count: number;
  latest_collected_at: string;
}

export interface CandidateAnalyticsRecommendation {
  type: "keyword" | "risk_flag" | "category" | "collector_seed";
  label: string;
  reason: string;
  suggested_action: string;
}

export async function buildCandidateAnalytics(
  repository: AutomationRepository,
  filters: CandidateAnalyticsFilters = {}
): Promise<CandidateAnalyticsResponse> {
  const [allCandidates, assets] = await Promise.all([
    repository.getProductCandidates(),
    repository.getProductAssets()
  ]);
  const candidates = allCandidates.filter((candidate) => matchesFilters(candidate, filters));
  const queueAssetGroups = groupAssetsByQueueId(assets);
  const summary = summarizeCandidates(candidates);
  const scoreSummary = summarizeScores(candidates);
  const keywordPerformance = summarizeKeywords(candidates, queueAssetGroups);
  const riskFlagPerformance = summarizeRiskFlags(candidates);
  const sourceTraceSummary = summarizeSourceTraces(candidates);

  return {
    ok: true,
    filters,
    summary,
    score_summary: scoreSummary,
    keyword_performance: keywordPerformance,
    risk_flag_performance: riskFlagPerformance,
    source_trace_summary: sourceTraceSummary,
    recommendations: buildRecommendations(keywordPerformance, riskFlagPerformance),
    side_effects: {
      queue_created: false,
      worker_jobs_created: false,
      upload_triggered: false
    }
  };
}

function matchesFilters(candidate: ProductCandidate, filters: CandidateAnalyticsFilters) {
  if (filters.from && candidate.created_at < `${filters.from}T00:00:00.000Z`) {
    return false;
  }
  if (filters.to && candidate.created_at > `${filters.to}T23:59:59.999Z`) {
    return false;
  }
  if (filters.keyword && sourceKeyword(candidate).toLowerCase() !== filters.keyword.toLowerCase()) {
    return false;
  }
  if (filters.category && categoryOf(candidate).toLowerCase() !== filters.category.toLowerCase()) {
    return false;
  }
  if (filters.risk_flag && !riskFlags(candidate).includes(filters.risk_flag)) {
    return false;
  }
  if (filters.status && candidateStatus(candidate) !== filters.status) {
    return false;
  }
  if (filters.min_score !== undefined && finalScore(candidate) < filters.min_score) {
    return false;
  }
  return true;
}

function summarizeCandidates(candidates: ProductCandidate[]): CandidateAnalyticsSummary {
  return {
    total_candidates: candidates.length,
    collected: candidates.filter((candidate) => candidateStatus(candidate) === "collected").length,
    scored: candidates.filter((candidate) => finalScore(candidate) > 0).length,
    duplicate: candidates.filter((candidate) => isDuplicate(candidate)).length,
    manual_review: candidates.filter((candidate) => candidateStatus(candidate) === "manual_review").length,
    rejected: candidates.filter((candidate) => candidateStatus(candidate) === "rejected").length,
    promoted: candidates.filter((candidate) => candidateStatus(candidate) === "promoted").length
  };
}

function summarizeScores(candidates: ProductCandidate[]): CandidateScoreSummary {
  return {
    avg_final_score: average(candidates.map(finalScore)),
    avg_demand_score: average(candidates.map((candidate) => scorePart(candidate, "demand_score"))),
    avg_price_score: average(candidates.map((candidate) => scorePart(candidate, "price_score"))),
    avg_content_angle_score: average(candidates.map((candidate) => scorePart(candidate, "content_angle_score"))),
    avg_risk_penalty: average(candidates.map((candidate) => scorePart(candidate, "risk_penalty"))),
    avg_duplicate_penalty: average(candidates.map((candidate) => scorePart(candidate, "duplicate_penalty")))
  };
}

function summarizeKeywords(
  candidates: ProductCandidate[],
  queueAssetGroups: Map<string, ProductAsset[]>
): KeywordPerformance[] {
  const groups = groupBy(candidates, sourceKeyword);
  return [...groups.entries()]
    .map(([keyword, items]) => ({
      source_keyword: keyword,
      candidate_count: items.length,
      avg_final_score: average(items.map(finalScore)),
      duplicate_rate: rate(items.filter(isDuplicate).length, items.length),
      manual_review_rate: rate(items.filter((candidate) => candidateStatus(candidate) === "manual_review").length, items.length),
      rejected_rate: rate(items.filter((candidate) => candidateStatus(candidate) === "rejected").length, items.length),
      promoted_rate: rate(items.filter((candidate) => candidateStatus(candidate) === "promoted").length, items.length),
      qa_pass_rate: keywordQaPassRate(items, queueAssetGroups)
    }))
    .sort((a, b) => b.avg_final_score - a.avg_final_score || b.candidate_count - a.candidate_count);
}

function summarizeRiskFlags(candidates: ProductCandidate[]): RiskFlagPerformance[] {
  const rows: Array<{ risk_flag: string; candidate: ProductCandidate }> = [];
  for (const candidate of candidates) {
    for (const riskFlag of riskFlags(candidate)) {
      rows.push({ risk_flag: riskFlag, candidate });
    }
  }
  const groups = groupBy(rows, (row) => row.risk_flag);
  return [...groups.entries()]
    .map(([riskFlag, rowsForFlag]) => {
      const candidatesForFlag = rowsForFlag.map((row) => row.candidate);
      return {
        risk_flag: riskFlag,
        candidate_count: candidatesForFlag.length,
        manual_review_rate: rate(
          candidatesForFlag.filter((candidate) => candidateStatus(candidate) === "manual_review").length,
          candidatesForFlag.length
        ),
        rejected_rate: rate(
          candidatesForFlag.filter((candidate) => candidateStatus(candidate) === "rejected").length,
          candidatesForFlag.length
        )
      };
    })
    .sort((a, b) => b.candidate_count - a.candidate_count || a.risk_flag.localeCompare(b.risk_flag));
}

function summarizeSourceTraces(candidates: ProductCandidate[]): SourceTraceSummary[] {
  const groups = groupBy(candidates, collectedMode);
  return [...groups.entries()]
    .map(([mode, items]) => {
      const collectedDates = items.map(collectedAt).sort();
      return {
        collected_mode: mode,
        candidate_count: items.length,
        latest_collected_at: collectedDates[collectedDates.length - 1] ?? ""
      };
    })
    .sort((a, b) => b.candidate_count - a.candidate_count || a.collected_mode.localeCompare(b.collected_mode));
}

function buildRecommendations(
  keywordPerformance: KeywordPerformance[],
  riskFlagPerformance: RiskFlagPerformance[]
): CandidateAnalyticsRecommendation[] {
  const recommendations: CandidateAnalyticsRecommendation[] = [];
  const strongKeyword = keywordPerformance.find((item) => item.candidate_count > 0 && item.avg_final_score >= 60);
  if (strongKeyword) {
    recommendations.push({
      type: "keyword",
      label: strongKeyword.source_keyword,
      reason: "High candidate quality proxy with usable average score.",
      suggested_action: "Use as a collector seed reference; do not auto-run collection."
    });
  }
  const riskyFlag = riskFlagPerformance.find((item) => item.candidate_count > 0);
  if (riskyFlag) {
    recommendations.push({
      type: "risk_flag",
      label: riskyFlag.risk_flag,
      reason: "This risk flag appears in candidate intake and may slow manual review.",
      suggested_action: "Review collector prompts or filtering rules before promoting these candidates."
    });
  }
  return recommendations;
}

function keywordQaPassRate(candidates: ProductCandidate[], queueAssetGroups: Map<string, ProductAsset[]>) {
  const linkedAssets = candidates
    .flatMap((candidate) => {
      const queueId = typeof candidate.promoted_queue_id === "string" ? candidate.promoted_queue_id : "";
      return queueId ? (queueAssetGroups.get(queueId) ?? []) : [];
    })
    .filter((asset) => asset.asset_type !== "product_image" && asset.asset_type !== "sheet_export");
  if (linkedAssets.length === 0) {
    return null;
  }
  return rate(linkedAssets.filter((asset) => asset.qa_status === "passed").length, linkedAssets.length);
}

function groupAssetsByQueueId(assets: ProductAsset[]) {
  return groupBy(assets, (asset) => asset.product_queue_id);
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = getKey(item) || "unknown";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function sourceKeyword(candidate: ProductCandidate) {
  const trace = recordValue(candidate.payload.source_trace);
  return stringValue(trace.source_keyword) || stringValue(candidate.payload.source_keyword) || candidate.category || "unknown";
}

function collectedMode(candidate: ProductCandidate) {
  const trace = recordValue(candidate.payload.source_trace);
  return stringValue(trace.collected_mode) || candidate.source_type || "unknown";
}

function collectedAt(candidate: ProductCandidate) {
  const trace = recordValue(candidate.payload.source_trace);
  return stringValue(trace.collected_at) || candidate.created_at;
}

function categoryOf(candidate: ProductCandidate) {
  return candidate.category || stringValue(candidate.payload.category_path) || "";
}

function riskFlags(candidate: ProductCandidate) {
  return Array.isArray(candidate.payload.risk_flags)
    ? candidate.payload.risk_flags.filter((flag): flag is string => typeof flag === "string")
    : [];
}

function candidateStatus(candidate: ProductCandidate) {
  if (candidate.promotion_status === "promoted") {
    return "promoted";
  }
  if (candidate.promotion_status === "needs_review" || candidate.promotion_status === "blocked_missing_affiliate") {
    return "manual_review";
  }
  if (candidate.promotion_status === "blocked_duplicate") {
    return "rejected";
  }
  return "collected";
}

function isDuplicate(candidate: ProductCandidate) {
  return Boolean(candidate.duplicate_status && candidate.duplicate_status !== "unique");
}

function finalScore(candidate: ProductCandidate) {
  return scorePart(candidate, "final_score") || candidate.candidate_score || 0;
}

function scorePart(candidate: ProductCandidate, key: string) {
  const scoreBreakdown = recordValue(candidate.payload.score_breakdown);
  const value = scoreBreakdown[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function average(values: number[]) {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (finiteValues.length === 0) {
    return 0;
  }
  return round(finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length);
}

function rate(count: number, total: number) {
  if (total === 0) {
    return 0;
  }
  return round(count / total);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
