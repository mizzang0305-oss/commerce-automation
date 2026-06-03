import { SettingsForm } from "@/components/SettingsForm";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { getAiProviderConfigStatus } from "@/lib/server/aiProviderConfig";
import { countKstDailyVideoRenderJobs } from "@/lib/workerDailyLimit";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const repository = getAutomationRepository();
  const [settings, jobs] = await Promise.all([repository.getSettings(), repository.getWorkerJobs()]);
  return (
    <SettingsForm
      initialSettings={settings}
      todayVideoJobs={countKstDailyVideoRenderJobs(jobs)}
      contentAiStatus={getAiProviderConfigStatus()}
    />
  );
}
