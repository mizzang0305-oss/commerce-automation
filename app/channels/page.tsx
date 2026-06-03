import { ChannelAdminClient, type ChannelPackageCounts } from "@/components/ChannelAdminClient";
import { getYouTubeChannelReadiness } from "@/lib/channels/channelProfileAdmin";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  const repository = getAutomationRepository();
  const [profiles, uploadPackages] = await Promise.all([
    repository.getChannelProfiles(),
    repository.getChannelUploadPackages()
  ]);
  const counts: ChannelPackageCounts = {};
  for (const profile of profiles) {
    counts[profile.id] = { manual_ready: 0, uploaded: 0, needs_fix: 0 };
  }
  for (const uploadPackage of uploadPackages) {
    const current = counts[uploadPackage.channel_profile_id] ?? { manual_ready: 0, uploaded: 0, needs_fix: 0 };
    if (uploadPackage.status === "manual_ready" || uploadPackage.status === "uploaded" || uploadPackage.status === "needs_fix") {
      current[uploadPackage.status] += 1;
    }
    counts[uploadPackage.channel_profile_id] = current;
  }

  return (
    <ChannelAdminClient
      profiles={profiles}
      packageCounts={counts}
      youtubeReadiness={getYouTubeChannelReadiness()}
    />
  );
}
