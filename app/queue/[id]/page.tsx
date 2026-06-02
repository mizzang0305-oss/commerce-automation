import { notFound } from "next/navigation";
import { QueueDetailView } from "@/components/QueueDetailView";
import { getDefaultChannelProfiles } from "@/lib/channels/defaultChannels";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

export default async function QueueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repository = getAutomationRepository();
  const [item, content, settings, assets, workerJobs, channelPackages] = await Promise.all([
    repository.getQueueItem(id),
    repository.getGeneratedContentByQueueItem(id),
    repository.getSettings(),
    repository.getProductAssets(id),
    repository.getWorkerJobs(),
    repository.getChannelUploadPackages(id)
  ]);

  if (!item) {
    notFound();
  }

  return (
    <QueueDetailView
      item={item}
      content={content}
      settings={settings}
      assets={assets}
      workerJobs={workerJobs}
      channels={getDefaultChannelProfiles()}
      channelPackages={channelPackages}
    />
  );
}
