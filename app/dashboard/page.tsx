import { DashboardView } from "@/components/DashboardView";
import { listArtifactQaSummaries } from "@/lib/artifacts/artifactQa";
import { buildProductionReadinessSummary } from "@/lib/ops/productionReadiness";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { getN8nConfigStatus } from "@/lib/server/n8nClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const repository = getAutomationRepository();
  const [settings, items, summary, runs, workerJobs, workerHeartbeats, candidates, artifactQa] = await Promise.all([
    repository.getSettings(),
    repository.getQueue(),
    repository.getQueueSummary(),
    repository.getRuns(),
    repository.getWorkerJobs(),
    repository.getWorkerHeartbeats(),
    repository.getProductCandidates(),
    listArtifactQaSummaries(repository)
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
      artifactQaSummary={artifactQa.summary}
    />
  );
}
