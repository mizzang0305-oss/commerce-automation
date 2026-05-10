import { notFound } from "next/navigation";
import { QueueDetailView } from "@/components/QueueDetailView";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

export default async function QueueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repository = getAutomationRepository();
  const [item, content, settings] = await Promise.all([
    repository.getQueueItem(id),
    repository.getGeneratedContentByQueueItem(id),
    repository.getSettings()
  ]);

  if (!item) {
    notFound();
  }

  return <QueueDetailView item={item} content={content} settings={settings} />;
}
