import { DashboardView } from "@/components/DashboardView";
import { listArtifactQaSummaries } from "@/lib/artifacts/artifactQa";
import { buildCandidateAnalytics, buildCandidateSeedDryRunPlan } from "@/lib/candidates/candidateAnalytics";
import { buildProductionReadinessSummary } from "@/lib/ops/productionReadiness";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { getN8nConfigStatus } from "@/lib/server/n8nClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const repository = getAutomationRepository();
  const [settings, items, summary, runs, workerJobs, workerHeartbeats, candidates, artifactQa, candidateAnalytics, candidateSeedPlan] = await Promise.all([
    repository.getSettings(),
    repository.getQueue(),
    repository.getQueueSummary(),
    repository.getRuns(),
    repository.getWorkerJobs(),
    repository.getWorkerHeartbeats(),
    repository.getProductCandidates(),
    listArtifactQaSummaries(repository),
    buildCandidateAnalytics(repository),
    buildCandidateSeedDryRunPlan(repository)
  ]);
  const contents = new Map(
    await Promise.all(
      items.map(async (item) => [item.id, await repository.getGeneratedContentByQueueItem(item.id)] as const)
    )
  );

  return (
    <DashboardView
      settings={settings}
      items={items}
      summary={summary}
      runs={runs}
      workerJobs={workerJobs}
      workerHeartbeats={workerHeartbeats}
      contents={contents}
      diagnostics={getN8nConfigStatus()}
      productionReadiness={buildProductionReadinessSummary()}
      candidateSummary={{
        total: candidates.length,
        collected: candidates.filter((candidate) => candidate.promotion_status !== "promoted").length,
        promoted: candidates.filter((candidate) => candidate.promotion_status === "promoted").length,
        duplicate: candidates.filter((candidate) => candidate.duplicate_status && candidate.duplicate_status !== "unique").length,
        manual_review: candidates.filter((candidate) => candidate.promotion_status === "needs_review").length
      }}
      candidateAnalyticsSummary={{
        top_keyword: candidateAnalytics.keyword_performance[0]?.source_keyword ?? "-",
        avg_final_score: candidateAnalytics.score_summary.avg_final_score,
        duplicate_rate:
          candidateAnalytics.summary.total_candidates === 0
            ? 0
            : candidateAnalytics.summary.duplicate / candidateAnalytics.summary.total_candidates,
        risk_heavy_keywords: candidateAnalytics.risk_flag_performance.slice(0, 3).map((item) => item.risk_flag),
        active_filter_count: Object.entries(candidateAnalytics.applied_filters ?? {}).filter(
          ([key, value]) => value !== undefined && value !== "" && key !== "limit" && key !== "sort" && key !== "status" && key !== "collected_mode"
        ).length,
        seed_strategy_generated_at: candidateAnalytics.seed_strategy?.generated_at ?? ""
      }}
      candidateSeedPlanSummary={{
        strategy: candidateSeedPlan.strategy,
        keyword_count: candidateSeedPlan.plan_summary.keyword_count,
        estimated_candidate_limit: candidateSeedPlan.plan_summary.estimated_candidate_limit,
        collector_executed: candidateSeedPlan.side_effects.collector_executed
      }}
      artifactQaSummary={artifactQa.summary}
      artifactQaProductivitySummary={{
        pending_queue_count: artifactQa.summary.pending,
        needs_fix_count: artifactQa.summary.needs_fix,
        missing_assets_count:
          artifactQa.summary.missing_video +
          artifactQa.summary.missing_thumbnail +
          artifactQa.summary.missing_subtitle +
          artifactQa.summary.missing_upload_package,
        today_reviewed_count: artifactQa.summary.passed + artifactQa.summary.needs_fix + artifactQa.summary.rejected
      }}
    />
  );
}
