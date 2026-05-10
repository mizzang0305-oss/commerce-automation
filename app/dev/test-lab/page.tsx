import { DevScenarioPanel } from "@/components/DevScenarioPanel";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { getRepositoryRuntimeInfo } from "@/lib/repositories/repositoryFactory";
import { getN8nConfigStatus } from "@/lib/server/n8nClient";

export const dynamic = "force-dynamic";

export default async function DevTestLabPage() {
  const settings = await getAutomationRepository().getSettings();
  return (
    <DevScenarioPanel
      settings={settings}
      repositoryInfo={getRepositoryRuntimeInfo()}
      diagnostics={getN8nConfigStatus()}
    />
  );
}
