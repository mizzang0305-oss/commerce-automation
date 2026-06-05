import type { AutomationRepository } from "@/lib/repositories/types";
import type { ProductAsset, ProductCandidate } from "@/types/automation";

export type CandidateAnalyticsFilters = {
  keyword?: string;
  category?: string;
  risk_flag?: string;
  status?: string;
  min_score?: number;
  max_score?: number;
  from?: string;
  to?: string;
  collected_mode?: string;
  collector_version?: string;
  sort?: CandidateAnalyticsSort;
  limit?: number;
};

export type CandidateAnalyticsSort =
  | "newest"
  | "oldest"
  | "final_score_desc"
  | "final_score_asc"
  | "duplicate_rate_desc"
  | "risk_rate_desc";

export type AppliedCandidateAnalyticsFilters = {
  from?: string;
  to?: string;
  keyword?: string;
  category?: string;
  risk_flag?: string;
  status: string;
  min_score?: number;
  max_score?: number;
  collected_mode: string;
  collector_version?: string;
  sort: CandidateAnalyticsSort;
  limit: number;
};

export type CandidateAnalyticsResponse = {
  ok: true;
  filters: CandidateAnalyticsFilters;
  applied_filters?: AppliedCandidateAnalyticsFilters;
  available_filters?: CandidateAnalyticsAvailableFilters;
  summary: CandidateAnalyticsSummary;
  score_summary: CandidateScoreSummary;
  keyword_performance: KeywordPerformance[];
  risk_flag_performance: RiskFlagPerformance[];
  source_trace_summary: SourceTraceSummary[];
  recommendations: CandidateAnalyticsRecommendation[];
  seed_strategy?: CollectorSeedStrategy;
  side_effects: {
    queue_created: false;
    worker_jobs_created: false;
    upload_triggered: false;
    collector_executed?: false;
  };
};

export type CandidateAnalyticsAvailableFilters = {
  keywords: string[];
  categories: string[];
  risk_flags: string[];
  statuses: string[];
  collected_modes: string[];
  collector_versions: string[];
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

export interface CollectorSeedStrategy {
  keep_keywords: SeedKeywordRecommendation[];
  expand_keywords: SeedKeywordRecommendation[];
  review_keywords: SeedKeywordRecommendation[];
  avoid_keywords: SeedKeywordRecommendation[];
  risk_flags_to_watch: RiskFlagRecommendation[];
  generated_at: string;
  side_effects: {
    collector_executed: false;
    queue_created: false;
    worker_jobs_created: false;
    upload_triggered: false;
  };
}

export interface SeedKeywordRecommendation {
  keyword: string;
  reason: string;
  avg_final_score: number;
  duplicate_rate: number;
  manual_review_rate: number;
  rejected_rate: number;
  suggested_action: "keep" | "expand" | "review" | "avoid";
}

export interface RiskFlagRecommendation {
  risk_flag: string;
  reason: string;
  candidate_count: number;
  suggested_action: "watch";
}

export async function buildCandidateAnalytics(
  repository: AutomationRepository,
  filters: CandidateAnalyticsFilters = {}
): Promise<CandidateAnalyticsResponse> {
  const [allCandidates, assets] = await Promise.all([
    repository.getProductCandidates(),
    repository.getProductAssets()
  ]);
  const appliedFilters = normalizeCandidateAnalyticsFilters(filters);
  const candidates = sortCandidates(allCandidates.filter((candidate) => matchesFilters(candidate, appliedFilters)), appliedFilters)
    .slice(0, appliedFilters.limit);
  const queueAssetGroups = groupAssetsByQueueId(assets);
  const summary = summarizeCandidates(candidates);
  const scoreSummary = summarizeScores(candidates);
  const keywordPerformance = summarizeKeywords(candidates, queueAssetGroups);
  const riskFlagPerformance = summarizeRiskFlags(candidates);
  const sourceTraceSummary = summarizeSourceTraces(candidates);

  return {
    ok: true,
    filters,
    applied_filters: appliedFilters,
    available_filters: buildAvailableFilters(allCandidates),
    summary,
    score_summary: scoreSummary,
    keyword_performance: keywordPerformance,
    risk_flag_performance: riskFlagPerformance,
    source_trace_summary: sourceTraceSummary,
    recommendations: buildRecommendations(keywordPerformance, riskFlagPerformance),
    seed_strategy: buildCollectorSeedStrategy(keywordPerformance, riskFlagPerformance),
    side_effects: {
      queue_created: false,
      worker_jobs_created: false,
      upload_triggered: false,
      collector_executed: false
    }
  };
}

export function normalizeCandidateAnalyticsFilters(filters: CandidateAnalyticsFilters = {}): AppliedCandidateAnalyticsFilters {
  const minScore = clampScore(filters.min_score);
  const maxScore = clampScore(filters.max_score);
  return {
    from: validDate(filters.from) ? filters.from : undefined,
    to: validDate(filters.to) ? filters.to : undefined,
    keyword: filters.keyword?.trim() || undefined,
    category: filters.category?.trim() || undefined,
    risk_flag: filters.risk_flag?.trim() && filters.risk_flag !== "all" ? filters.risk_flag.trim() : undefined,
    status: filters.status?.trim() || "all",
    min_score: minScore,
    max_score: maxScore,
    collected_mode: filters.collected_mode?.trim() || "all",
    collector_version: filters.collector_version?.trim() || undefined,
    sort: normalizeAnalyticsSort(filters.sort),
    limit: clampLimit(filters.limit)
  };
}

export function validateCandidateAnalyticsFilters(filters: AppliedCandidateAnalyticsFilters) {
  if (filters.min_score !== undefined && filters.max_score !== undefined && filters.min_score > filters.max_score) {
    return {
      ok: false as const,
      status: 400,
      error_code: "INVALID_SCORE_RANGE",
      message: "Candidate score filter range is invalid.",
      safe_error: "min_score must be less than or equal to max_score."
    };
  }
  return { ok: true as const };
}

function matchesFilters(candidate: ProductCandidate, filters: AppliedCandidateAnalyticsFilters) {
  if (filters.from && candidate.created_at < `${filters.from}T00:00:00.000Z`) {
    return false;
  }
  if (filters.to && candidate.created_at > `${filters.to}T23:59:59.999Z`) {
    return false;
  }
  if (filters.keyword && !sourceKeyword(candidate).toLowerCase().includes(filters.keyword.toLowerCase())) {
    return false;
  }
  if (filters.category && !categoryOf(candidate).toLowerCase().includes(filters.category.toLowerCase())) {
    return false;
  }
  if (filters.risk_flag && !riskFlags(candidate).includes(filters.risk_flag)) {
    return false;
  }
  if (filters.status !== "all" && candidateStatus(candidate) !== filters.status) {
    return false;
  }
  if (filters.min_score !== undefined && finalScore(candidate) < filters.min_score) {
    return false;
  }
  if (filters.max_score !== undefined && finalScore(candidate) > filters.max_score) {
    return false;
  }
  if (filters.collected_mode !== "all" && collectedMode(candidate) !== filters.collected_mode) {
    return false;
  }
  if (filters.collector_version && collectorVersion(candidate) !== filters.collector_version) {
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

function buildCollectorSeedStrategy(
  keywordPerformance: KeywordPerformance[],
  riskFlagPerformance: RiskFlagPerformance[]
): CollectorSeedStrategy {
  const keep: SeedKeywordRecommendation[] = [];
  const expand: SeedKeywordRecommendation[] = [];
  const review: SeedKeywordRecommendation[] = [];
  const avoid: SeedKeywordRecommendation[] = [];

  for (const item of keywordPerformance) {
    const base = {
      keyword: item.source_keyword,
      avg_final_score: item.avg_final_score,
      duplicate_rate: item.duplicate_rate,
      manual_review_rate: item.manual_review_rate,
      rejected_rate: item.rejected_rate
    };
    if (item.avg_final_score >= 75 && item.duplicate_rate <= 0.2 && item.rejected_rate <= 0.2) {
      keep.push({
        ...base,
        reason: "Strong average score with low duplicate and rejection rates.",
        suggested_action: "keep"
      });
    }
    if (item.avg_final_score >= 80 && item.candidate_count <= 2 && item.duplicate_rate <= 0.2 && item.rejected_rate <= 0.2) {
      expand.push({
        ...base,
        reason: "Strong score with limited sample count; consider adding related candidate-only seed terms.",
        suggested_action: "expand"
      });
    } else if (item.rejected_rate >= 0.5 || item.duplicate_rate >= 0.5) {
      avoid.push({
        ...base,
        reason: "High duplicate or rejection rate; avoid as a near-term collector seed.",
        suggested_action: "avoid"
      });
    } else if (item.manual_review_rate > 0 || item.avg_final_score < 60) {
      review.push({
        ...base,
        reason: "Manual review or lower score suggests operator review before reuse.",
        suggested_action: "review"
      });
    }
  }

  return {
    keep_keywords: keep,
    expand_keywords: expand,
    review_keywords: review,
    avoid_keywords: avoid,
    risk_flags_to_watch: riskFlagPerformance.map((item) => ({
      risk_flag: item.risk_flag,
      candidate_count: item.candidate_count,
      reason: "Risk flag appears in filtered candidate analytics.",
      suggested_action: "watch"
    })),
    generated_at: new Date().toISOString(),
    side_effects: {
      collector_executed: false,
      queue_created: false,
      worker_jobs_created: false,
      upload_triggered: false
    }
  };
}

function buildAvailableFilters(candidates: ProductCandidate[]): CandidateAnalyticsAvailableFilters {
  return {
    keywords: uniqueSorted(candidates.map(sourceKeyword)),
    categories: uniqueSorted(candidates.map(categoryOf)),
    risk_flags: uniqueSorted(candidates.flatMap(riskFlags)),
    statuses: uniqueSorted(candidates.map(candidateStatus)),
    collected_modes: uniqueSorted(candidates.map(collectedMode)),
    collector_versions: uniqueSorted(candidates.map(collectorVersion))
  };
}

function sortCandidates(candidates: ProductCandidate[], filters: AppliedCandidateAnalyticsFilters) {
  return [...candidates].sort((left, right) => {
    if (filters.sort === "oldest") {
      return left.created_at.localeCompare(right.created_at);
    }
    if (filters.sort === "final_score_asc") {
      return finalScore(left) - finalScore(right);
    }
    if (filters.sort === "final_score_desc") {
      return finalScore(right) - finalScore(left);
    }
    return right.created_at.localeCompare(left.created_at);
  });
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

function collectorVersion(candidate: ProductCandidate) {
  const trace = recordValue(candidate.payload.source_trace);
  return stringValue(trace.collector_version) || stringValue(candidate.payload.collector_version) || "unknown";
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

function clampScore(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.min(100, Math.max(0, value));
}

function clampLimit(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) {
    return 50;
  }
  return Math.min(200, Math.max(1, Math.floor(value)));
}

function normalizeAnalyticsSort(value: unknown): CandidateAnalyticsSort {
  return value === "newest" ||
    value === "oldest" ||
    value === "final_score_asc" ||
    value === "duplicate_rate_desc" ||
    value === "risk_rate_desc"
    ? value
    : "final_score_desc";
}

function validDate(value: string | undefined) {
  return !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
