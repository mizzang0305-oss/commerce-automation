import { WebhookTestPanel } from "@/components/WebhookTestPanel";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { getN8nConfigStatus } from "@/lib/server/n8nClient";

export const dynamic = "force-dynamic";

export default async function DevWebhookTestPage() {
  const items = await getAutomationRepository().getQueue({ limit: 1 });
  return <WebhookTestPanel diagnostics={getN8nConfigStatus()} sampleItemId={items[0]?.id ?? ""} />;
}
