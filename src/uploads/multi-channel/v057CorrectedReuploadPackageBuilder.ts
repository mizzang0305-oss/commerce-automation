import { CHANNEL_KEYS, type ChannelKey } from "./channelProfiles";
import {
  buildV057CommentPreview,
  buildV057MetadataPreview,
  buildV057UploadSettingsPreview
} from "../../rendering/shorts/v057HookFirstFrameOptimization";
import {
  buildSanitizedTargetChannelEvidence,
  buildV057CorrectedReuploadPackage,
  type V057CorrectedReuploadDisclosurePreview,
  type V057CorrectedReuploadPackage,
  type V057CorrectedReuploadTargetChannelEvidence
} from "./v057CorrectedReuploadPackage";
import type { V066AffiliateBridgeReport } from "./v066CoupangDeeplinkAffiliateBridge";
import type { V057ProductSourceLoaderReport } from "./v057CorrectedReuploadProductSourceLoader";
import type { V057ReuploadAssetBindingReport } from "./v057ReuploadAssetBinding";

export type V057DisclosureOverride = Partial<Record<ChannelKey, Partial<V057CorrectedReuploadDisclosurePreview>>>;

export type V057CorrectedReuploadPackageBuildResult = {
  packages: V057CorrectedReuploadPackage[];
  targetChannelEvidence: Record<ChannelKey, V057CorrectedReuploadTargetChannelEvidence>;
  disclosurePreviews: Record<ChannelKey, V057CorrectedReuploadDisclosurePreview>;
  disclosure_blocker: "BLOCKED_V069_DISCLOSURE_PREVIEW_MISSING" | null;
};

export function buildV057CorrectedReuploadPackages(input: {
  assetReport: V057ReuploadAssetBindingReport;
  productSourceReport: V057ProductSourceLoaderReport;
  affiliateBridgeReport: V066AffiliateBridgeReport | null;
  targetChannelIds: Partial<Record<ChannelKey, string>>;
  duplicateUploadRisk: boolean;
  disclosureOverrides?: V057DisclosureOverride;
}): V057CorrectedReuploadPackageBuildResult {
  const targetChannelEvidence = Object.fromEntries(CHANNEL_KEYS.map((channelKey) => [
    channelKey,
    buildSanitizedTargetChannelEvidence({
      channelKey,
      targetChannelIds: input.targetChannelIds
    })
  ])) as Record<ChannelKey, V057CorrectedReuploadTargetChannelEvidence>;
  const disclosurePreviews = Object.fromEntries(CHANNEL_KEYS.map((channelKey) => [
    channelKey,
    buildDisclosurePreview(channelKey, input.disclosureOverrides?.[channelKey])
  ])) as Record<ChannelKey, V057CorrectedReuploadDisclosurePreview>;

  const packages = CHANNEL_KEYS.map((channelKey) => buildV057CorrectedReuploadPackage({
    channelKey,
    assetReport: input.assetReport,
    productEvidence: input.productSourceReport.channels.find((channel) => channel.channel_key === channelKey),
    affiliateEvidence: input.affiliateBridgeReport?.channels.find((channel) => channel.channel_key === channelKey),
    targetEvidence: targetChannelEvidence[channelKey],
    disclosure: disclosurePreviews[channelKey],
    duplicateUploadRisk: input.duplicateUploadRisk
  }));
  const disclosureBlocker = Object.values(disclosurePreviews).every((preview) => (
    preview.containsSyntheticMedia &&
    preview.paidProductPlacement &&
    preview.descriptionDisclosurePresent &&
    preview.commentDisclosurePresent
  ))
    ? null
    : "BLOCKED_V069_DISCLOSURE_PREVIEW_MISSING";

  return {
    packages,
    targetChannelEvidence,
    disclosurePreviews,
    disclosure_blocker: disclosureBlocker
  };
}

function buildDisclosurePreview(
  channelKey: ChannelKey,
  override: Partial<V057CorrectedReuploadDisclosurePreview> | undefined
): V057CorrectedReuploadDisclosurePreview {
  const metadata = buildV057MetadataPreview(channelKey);
  const comment = buildV057CommentPreview(channelKey);
  const settings = buildV057UploadSettingsPreview(channelKey);
  return {
    containsSyntheticMedia: Boolean(metadata.status.containsSyntheticMedia && settings.containsSyntheticMedia),
    paidProductPlacement: Boolean(
      metadata.paidProductPlacementDetails.hasPaidProductPlacement &&
      settings.paidProductPlacementDetails.hasPaidProductPlacement
    ),
    descriptionDisclosurePresent: Boolean(metadata.coupang_disclosure_in_description),
    commentDisclosurePresent: Boolean(comment.comment_text_has_coupang_disclosure),
    ...override
  };
}
