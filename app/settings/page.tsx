import { SettingsForm } from "@/components/SettingsForm";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getAutomationRepository().getSettings();
  return <SettingsForm initialSettings={settings} />;
}
