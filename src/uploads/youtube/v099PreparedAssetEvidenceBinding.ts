import type { ChannelKey } from "../multi-channel/channelProfiles";
import { V057_REUPLOAD_ASSET_PROFILE } from "../multi-channel/v057ReuploadAssetBinding";
import type { PreparedVideoAssetRef } from "@/lib/uploads/youtube/uploadAssetContract";
import type { V094UploadPackageLoader } from "./v094UploadPackageRequestResolutionCore";
import {
  bindV099PreparedVideoAssetEvidence,
  type V099PreparedAssetEvidenceBindingResult
} from "./v099PreparedAssetEvidenceBindingCore";
import {
  buildV097UploadPackageResolutionDryRun
} from "./v097UploadPackageResolutionBridge";

export { bindV099PreparedVideoAssetEvidence };

export type V099PreparedAssetEvidenceDryRunStatus = "blocked" | "prepared_asset_evidence_ready";

export type V099PreparedAssetEvidenceDryRunReport = {
  version: "v099";
  status: V099PreparedAssetEvidenceDryRunStatus;
  mode: "prepared_asset_evidence_binding_no_upload";
  contextFound: boolean;
  contextLoaded: boolean;
  packageFound: boolean;
  videoAssetEvidencePresent: boolean;
  preparedAssetEvidencePresent: boolean;
  preparedAssetServerAccessible: boolean;
  preparedAssetUploadableUrlPresent: boolean;
  preparedAssetExpired: boolean | null;
  preparedAssetProviderLabel: string | null;
  preparedAssetHashPrefix: string | null;
  uploadRequestBuilt: boolean;
  resolverBlocker: string | null;
  videosInsertCalled: false;
  videosInsertTotalCount: 0;
  commentThreadsInsertCalled: false;
  publicUploadAllowed: false;
  unlistedUploadAllowed: false;
  schedulerExecutionAllowed: false;
  commentAutomationAllowed: false;
  raw_urls_printed: false;
  raw_file_paths_printed: false;
  raw_video_ids_printed: false;
  raw_channel_ids_printed: false;
  secrets_printed: false;
  fake_success: false;
  SAFE_TO_UPLOAD: false;
  SAFE_TO_PUBLIC_UPLOAD: false;
};

export type V099PreparedAssetEvidenceDryRunInput = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  loadUploadPackages?: V094UploadPackageLoader;
  preparedVideoAssetRefs?: Partial<Record<ChannelKey, PreparedVideoAssetRef | null>>;
};

export async function buildV099PreparedAssetEvidenceDryRun(
  input: V099PreparedAssetEvidenceDryRunInput = {}
): Promise<V099PreparedAssetEvidenceDryRunReport> {
  const env = input.env ?? process.env;
  const channelKey = "father_jobs";
  const preparedBinding = bindV099PreparedVideoAssetEvidence({
    preparedVideoAssetRef: input.preparedVideoAssetRefs?.[channelKey],
    videoAssetHashPrefix: null
  });
  const v097Report = await buildV097UploadPackageResolutionDryRun({
    cwd: input.cwd,
    env: {
      ...env,
      V051_UPLOAD_ASSET_PROFILE: env.V051_UPLOAD_ASSET_PROFILE ?? V057_REUPLOAD_ASSET_PROFILE
    },
    loadUploadPackages: input.loadUploadPackages,
    preparedVideoAssetRefs: input.preparedVideoAssetRefs
  });
  const effectiveBinding = mergeBindingWithV097(preparedBinding, v097Report);
  const ready = v097Report.resolverUploadRequestBuilt && !v097Report.resolverBlocker;

  return {
    version: "v099",
    status: ready ? "prepared_asset_evidence_ready" : "blocked",
    mode: "prepared_asset_evidence_binding_no_upload",
    contextFound: v097Report.contextFound,
    contextLoaded: v097Report.contextLoaded,
    packageFound: v097Report.resolverPackageFound,
    videoAssetEvidencePresent: v097Report.videoAssetEvidencePresent,
    preparedAssetEvidencePresent: v097Report.preparedAssetEvidencePresent,
    preparedAssetServerAccessible: v097Report.preparedAssetServerAccessible,
    preparedAssetUploadableUrlPresent: v097Report.preparedAssetUploadableUrlPresent,
    preparedAssetExpired: effectiveBinding.preparedAssetExpired,
    preparedAssetProviderLabel: effectiveBinding.preparedAssetProviderLabel,
    preparedAssetHashPrefix: effectiveBinding.preparedAssetHashPrefix,
    uploadRequestBuilt: v097Report.resolverUploadRequestBuilt,
    resolverBlocker: v097Report.resolverBlocker,
    videosInsertCalled: false,
    videosInsertTotalCount: 0,
    commentThreadsInsertCalled: false,
    publicUploadAllowed: false,
    unlistedUploadAllowed: false,
    schedulerExecutionAllowed: false,
    commentAutomationAllowed: false,
    raw_urls_printed: false,
    raw_file_paths_printed: false,
    raw_video_ids_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false,
    fake_success: false,
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false
  };
}

function mergeBindingWithV097(
  binding: V099PreparedAssetEvidenceBindingResult,
  v097Report: {
    preparedAssetEvidencePresent: boolean;
    preparedAssetServerAccessible: boolean;
    preparedAssetUploadableUrlPresent: boolean;
  }
): V099PreparedAssetEvidenceBindingResult {
  if (binding.preparedAssetEvidencePresent || !v097Report.preparedAssetEvidencePresent) {
    return binding;
  }

  return {
    ...binding,
    preparedAssetEvidencePresent: v097Report.preparedAssetEvidencePresent,
    preparedAssetServerAccessible: v097Report.preparedAssetServerAccessible,
    preparedAssetUploadableUrlPresent: v097Report.preparedAssetUploadableUrlPresent
  };
}
