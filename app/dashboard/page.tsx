import { DashboardView } from "@/components/DashboardView";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { getN8nConfigStatus } from "@/lib/server/n8nClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const repository = getAutomationRepository();
  const [settings, items, summary, runs] = await Promise.all([
    repository.getSettings(),
    repository.getQueue(),
    repository.getQueueSummary(),
    repository.getRuns()
  ]);

  return (
    <DashboardView
      settings={settings}
      items={items}
      summary={summary}
      runs={runs}
      diagnostics={getN8nConfigStatus()}
    />
  );
}
