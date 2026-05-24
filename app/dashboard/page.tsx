import { DashboardView } from "@/components/DashboardView";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { getN8nConfigStatus } from "@/lib/server/n8nClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const repository = getAutomationRepository();
  const [settings, items, summary, runs, workerJobs, workerHeartbeats] = await Promise.all([
    repository.getSettings(),
    repository.getQueue(),
    repository.getQueueSummary(),
    repository.getRuns(),
    repository.getWorkerJobs(),
    repository.getWorkerHeartbeats()
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
    />
  );
}
