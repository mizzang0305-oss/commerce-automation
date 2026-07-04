import type { ChannelKey } from "./channelProfiles";
import type { V057ReuploadAssetProfile } from "./v057ReuploadAssetBinding";

export type V073UploadPackageProductSourceKind =
  | "product_queue_item_generated_content_pair"
  | "v057_review_package_metadata"
  | "generated_content"
  | "product_queue_item"
  | "trusted_upstream_manifest";

export type V073YouTubeAdvancedSettings = {
  privacyStatus: "public";
  selfDeclaredMadeForKids: false;
  containsSyntheticMedia: true;
  paidProductPlacementDetails: {
    hasPaidProductPlacement: true;
  };
  license: "youtube";
  embeddable: true;
  publicStatsViewable: true;
  defaultLanguage: "ko";
  defaultAudioLanguage: "ko";
};

export type V073UploadPackage = {
  packageId: string;
  queueItemId: string | null;
  generatedContentId: string | null;
  channelKey: ChannelKey;
  assetProfile: V057ReuploadAssetProfile;
  productSource: {
    rawCoupangUrl: string;
    productName: string;
    sourceKind: V073UploadPackageProductSourceKind;
    sourceEvidenceHash: string;
    runtimeSourceApproved: true;
  };
  deeplink: {
    selectedAffiliateUrl: string | null;
    source: "deeplink";
    status: "ready" | "pending";
    sanitizedEvidence: {
      affiliateUrlPresent: boolean;
      affiliateUrlPrinted: false;
      affiliateHashPrefix: string | null;
    };
  };
  videoAsset: {
    path: string;
    basename: string;
    hashEvidence: string;
    firstFramePath: string;
    firstFrameBasename: string;
    firstFrameHashEvidence: string;
    duration: null;
    resolution: null;
  };
  youtubeMetadata: {
    title: string;
    description: string;
    tags: string[];
    categoryId: "26";
    defaultLanguage: "ko";
    defaultAudioLanguage: "ko";
  };
  youtubeAdvancedSettings: V073YouTubeAdvancedSettings;
  commentPackage: {
    commentText: string;
    affiliateUrlRequiredBeforeExecution: true;
    coupangPartnersDisclosurePresent: boolean;
  };
  targetChannel: {
    channelKey: ChannelKey;
    channelIdHashPrefix: string | null;
    formatValid: boolean;
    rawChannelIdPrinted: false;
  };
  duplicateGuard: {
    ready: boolean;
    duplicateUploadRisk: boolean;
    signature: string;
  };
  quotaGuard: {
    ready: boolean;
    publicUploadExecutionDisabled: true;
  };
  approvalGate: {
    freshApprovalRequired: true;
    approvalPresent: false;
    publicUploadExecutionDisabled: true;
  };
  resultStore: {
    status: "placeholder";
    rawUrlsStored: false;
    secretsStored: false;
  };
};

export type V073UploadPackageReportItem = {
  packageId: string;
  channelKey: ChannelKey;
  assetProfile: V057ReuploadAssetProfile;
  productSourcePresent: boolean;
  productSourceKind: V073UploadPackageProductSourceKind | "missing" | "invalid";
  productSourceHashPrefix: string | null;
  rawCoupangUrlPresent: boolean;
  rawCoupangUrlPrinted: false;
  affiliateUrlPresent: boolean;
  affiliateUrlPrinted: false;
  videoAssetPresent: boolean;
  videoAssetHashPrefix: string | null;
  firstFramePresent: boolean;
  disclosureReady: boolean;
  targetChannelReady: boolean;
  targetChannelPresent: boolean;
  targetChannelFormatValid: boolean;
  targetChannelDuplicateDetected: boolean;
  targetChannelHashPrefix: string | null;
  duplicateGuardReady: boolean;
  approvalRequired: true;
  uploadExecutionCalled: false;
  safeToUpload: false;
};

export type V073UploadPackageBlocker =
  | "BLOCKED_REUPLOAD_ASSET_PROFILE_NOT_SELECTED"
  | "BLOCKED_V073_UPLOAD_PACKAGE_PRODUCT_SOURCE_MISSING"
  | "BLOCKED_V073_UPLOAD_PACKAGE_RAW_COUPANG_URL_MISSING"
  | "BLOCKED_V073_UPLOAD_PACKAGE_RAW_COUPANG_URL_INVALID"
  | "BLOCKED_V073_UPLOAD_PACKAGE_VIDEO_ASSET_MISSING"
  | "BLOCKED_V073_UPLOAD_PACKAGE_FIRST_FRAME_MISSING"
  | "BLOCKED_V073_UPLOAD_PACKAGE_DISCLOSURE_MISSING"
  | "BLOCKED_V073_UPLOAD_PACKAGE_TARGET_CHANNEL_MISSING"
  | "BLOCKED_V073_UPLOAD_PACKAGE_TARGET_CHANNEL_DUPLICATE"
  | "BLOCKED_V073_UPLOAD_PACKAGE_DEEPLINK_PENDING"
  | "BLOCKED_V073_UPLOAD_PACKAGE_INVALID_MANIFEST"
  | "BLOCKED_V073_UPLOAD_PACKAGE_NOT_READY";

export type V073UploadPackageReport = {
  version: "v073";
  FINAL_STATUS:
    | "SUCCESS_V073_UPLOAD_PACKAGES_GENERATED_NO_UPLOAD"
    | "BLOCKED_V073_UPLOAD_PACKAGE_NOT_READY";
  SAFE_TO_UPLOAD: false;
  safeToUpload: false;
  selected_profile: V057ReuploadAssetProfile | null;
  upload_package_generator_ready: boolean;
  upload_package_count: number;
  blocker: V073UploadPackageBlocker | null;
  manualAffiliateUrlInputRequired: false;
  manualRawCoupangUrlInputRequired: false;
  productionDefaultAffiliatePath: "coupang_deeplink";
  packages: V073UploadPackageReportItem[];
  uploadExecutionCalled: false;
  youtube_execute_called: false;
  videos_insert_called: false;
  videos_insert_total_count: 0;
  comment_create_update_delete_called: false;
  visibility_changed: false;
  R2_upload: false;
  DB_write: false;
  product_assets_write: false;
  raw_urls_printed: false;
  raw_channel_ids_printed: false;
  secrets_printed: false;
  fake_success: false;
};

export type V073UploadPackageGenerationResult = {
  version: "v073";
  packages: V073UploadPackage[];
  report: V073UploadPackageReport;
};
