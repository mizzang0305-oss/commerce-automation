import type { ChannelKey } from "../multi-channel/channelProfiles";
import type { V073UploadPackage } from "../multi-channel/v073UploadPackage";
import {
  buildV074YouTubeAdvancedSettings,
  type V074YouTubeAdvancedSettings
} from "./v074YouTubeAdvancedSettings";

export type V074VideoAssetRef = {
  path: string;
  basename: string;
  hashEvidence: string;
  firstFramePath: string;
  firstFrameBasename: string;
  firstFrameHashEvidence: string;
};

export type V074PublicUploadApprovalStatus = {
  freshApprovalRequired: true;
  approvalPresent: boolean;
};

export type V074YouTubeUploadRequest = {
  uploadPackageId: string;
  channelKey: ChannelKey;
  videoAssetRef: V074VideoAssetRef;
  title: string;
  description: string;
  tags: string[];
  categoryId: "26";
  defaultLanguage: "ko";
  defaultAudioLanguage: "ko";
  advancedSettings: V074YouTubeAdvancedSettings;
  affiliateDisclosurePresent: boolean;
  descriptionDisclosurePresent: boolean;
  commentDisclosurePresent: boolean;
  commentPackagePending: true;
  duplicateGuardSignature: string;
  duplicateUploadRisk: boolean;
  quotaGuardReady: boolean;
  approvalStatus: V074PublicUploadApprovalStatus;
  targetChannelVerified: boolean;
  targetChannelHashPrefix: string | null;
  productSourceReady: boolean;
  deeplinkReady: boolean;
  affiliateUrlReady: boolean;
  metadataReady: boolean;
};

export type V074YouTubeUploadRequestSanitizedReport = {
  packageId: string;
  channelKey: ChannelKey;
  videoAssetHashPrefix: string | null;
  metadataReady: boolean;
  disclosureReady: boolean;
  targetChannelHashPrefix: string | null;
  advancedSettingsReady: boolean;
  safetyGateReady: boolean;
  adapterMode: "not_selected";
  uploadExecutionCalled: false;
  videos_insert_called: false;
  safeToUpload: false;
  raw_urls_printed: false;
  raw_channel_ids_printed: false;
  secrets_printed: false;
};

export function buildV074YouTubeUploadRequest(uploadPackage: V073UploadPackage): V074YouTubeUploadRequest {
  const descriptionDisclosurePresent = hasCoupangDisclosure(uploadPackage.youtubeMetadata.description);
  const commentDisclosurePresent = uploadPackage.commentPackage.coupangPartnersDisclosurePresent &&
    hasCoupangDisclosure(uploadPackage.commentPackage.commentText);
  const advancedSettings = buildV074YouTubeAdvancedSettings();

  return {
    uploadPackageId: uploadPackage.packageId,
    channelKey: uploadPackage.channelKey,
    videoAssetRef: {
      path: uploadPackage.videoAsset.path,
      basename: uploadPackage.videoAsset.basename,
      hashEvidence: uploadPackage.videoAsset.hashEvidence,
      firstFramePath: uploadPackage.videoAsset.firstFramePath,
      firstFrameBasename: uploadPackage.videoAsset.firstFrameBasename,
      firstFrameHashEvidence: uploadPackage.videoAsset.firstFrameHashEvidence
    },
    title: uploadPackage.youtubeMetadata.title,
    description: uploadPackage.youtubeMetadata.description,
    tags: [...uploadPackage.youtubeMetadata.tags],
    categoryId: uploadPackage.youtubeMetadata.categoryId,
    defaultLanguage: uploadPackage.youtubeMetadata.defaultLanguage,
    defaultAudioLanguage: uploadPackage.youtubeMetadata.defaultAudioLanguage,
    advancedSettings,
    affiliateDisclosurePresent: descriptionDisclosurePresent && commentDisclosurePresent,
    descriptionDisclosurePresent,
    commentDisclosurePresent,
    commentPackagePending: true,
    duplicateGuardSignature: uploadPackage.duplicateGuard.signature,
    duplicateUploadRisk: uploadPackage.duplicateGuard.duplicateUploadRisk,
    quotaGuardReady: uploadPackage.quotaGuard.ready,
    approvalStatus: {
      freshApprovalRequired: true,
      approvalPresent: uploadPackage.approvalGate.approvalPresent
    },
    targetChannelVerified: uploadPackage.targetChannel.formatValid && Boolean(uploadPackage.targetChannel.channelIdHashPrefix),
    targetChannelHashPrefix: uploadPackage.targetChannel.channelIdHashPrefix,
    productSourceReady: Boolean(uploadPackage.productSource.rawCoupangUrl && uploadPackage.productSource.runtimeSourceApproved),
    deeplinkReady: uploadPackage.deeplink.status === "ready",
    affiliateUrlReady: Boolean(uploadPackage.deeplink.selectedAffiliateUrl),
    metadataReady: isMetadataReady(uploadPackage)
  };
}

export function buildV074YouTubeUploadRequestSanitizedReport(
  request: V074YouTubeUploadRequest
): V074YouTubeUploadRequestSanitizedReport {
  return {
    packageId: request.uploadPackageId,
    channelKey: request.channelKey,
    videoAssetHashPrefix: safePrefix(request.videoAssetRef.hashEvidence),
    metadataReady: request.metadataReady,
    disclosureReady: request.descriptionDisclosurePresent && request.commentDisclosurePresent,
    targetChannelHashPrefix: request.targetChannelHashPrefix,
    advancedSettingsReady: isAdvancedSettingsReady(request.advancedSettings),
    safetyGateReady: false,
    adapterMode: "not_selected",
    uploadExecutionCalled: false,
    videos_insert_called: false,
    safeToUpload: false,
    raw_urls_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false
  };
}

export function isV074RequestDisclosureReady(request: V074YouTubeUploadRequest) {
  return request.descriptionDisclosurePresent && request.commentDisclosurePresent;
}

export function isV074RequestVideoAssetReady(request: V074YouTubeUploadRequest) {
  return Boolean(
    request.videoAssetRef.path &&
    request.videoAssetRef.basename &&
    request.videoAssetRef.hashEvidence
  );
}

export function isV074RequestFirstFrameReady(request: V074YouTubeUploadRequest) {
  return Boolean(
    request.videoAssetRef.firstFramePath &&
    request.videoAssetRef.firstFrameBasename &&
    request.videoAssetRef.firstFrameHashEvidence
  );
}

export function isAdvancedSettingsReady(settings: V074YouTubeAdvancedSettings) {
  return settings.privacyStatus === "public" &&
    settings.selfDeclaredMadeForKids === false &&
    settings.containsSyntheticMedia === true &&
    settings.paidProductPlacementDetails.hasPaidProductPlacement === true &&
    settings.license === "youtube" &&
    settings.embeddable === true &&
    settings.publicStatsViewable === true &&
    settings.defaultLanguage === "ko" &&
    settings.defaultAudioLanguage === "ko";
}

function isMetadataReady(uploadPackage: V073UploadPackage) {
  return Boolean(
    uploadPackage.youtubeMetadata.title.trim() &&
    uploadPackage.youtubeMetadata.description.trim() &&
    uploadPackage.youtubeMetadata.categoryId === "26" &&
    uploadPackage.youtubeMetadata.defaultLanguage === "ko" &&
    uploadPackage.youtubeMetadata.defaultAudioLanguage === "ko"
  );
}

function hasCoupangDisclosure(value: string) {
  const normalized = value.replace(/\s+/g, "");
  return normalized.includes("쿠팡파트너스") && normalized.includes("수수료");
}

function safePrefix(value: string | null | undefined) {
  return value ? value.slice(0, 10) : null;
}
