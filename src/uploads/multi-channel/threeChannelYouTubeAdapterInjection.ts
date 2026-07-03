import type { ChannelKey } from "./channelProfiles";

export type V050UploadAdapterStatus = {
  upload_adapter_injected: boolean;
  token_provider_injected: boolean;
  proven_v035_adapter_path: "src/lib/uploads/youtube/youtubeUploadAdapter.ts";
  adapter_mode: "injected_check_only";
  videos_insert_allowed_in_v050: false;
  external_api_called: false;
  blocker: string | null;
};

export type V050DuplicateUploadCandidate = {
  channel_key: ChannelKey;
  video_path: string;
  video_sha256?: string;
};

export type V050DuplicateUploadGuard = {
  duplicate_upload_guard_injected: true;
  duplicate_upload_risk: boolean;
  same_asset_previously_uploaded: boolean;
  blocker: "DUPLICATE_VIDEO_ASSET_REUSE" | null;
  checked_channel_count: number;
  checked_video_paths: string[];
  raw_urls_printed: false;
};

export function buildV050UploadAdapterInjectionStatus(input: {
  uploadAdapterInjected?: boolean;
  tokenProviderInjected?: boolean;
} = {}): V050UploadAdapterStatus {
  const uploadAdapterInjected = input.uploadAdapterInjected !== false;
  const tokenProviderInjected = input.tokenProviderInjected !== false;
  return {
    upload_adapter_injected: uploadAdapterInjected,
    token_provider_injected: tokenProviderInjected,
    proven_v035_adapter_path: "src/lib/uploads/youtube/youtubeUploadAdapter.ts",
    adapter_mode: "injected_check_only",
    videos_insert_allowed_in_v050: false,
    external_api_called: false,
    blocker: uploadAdapterInjected && tokenProviderInjected ? null : "UPLOAD_ADAPTER_OR_TOKEN_PROVIDER_MISSING"
  };
}

export function buildV050DuplicateUploadGuard(candidates: V050DuplicateUploadCandidate[]): V050DuplicateUploadGuard {
  const keys = candidates.map((candidate) => safeAssetKey(candidate)).filter(Boolean);
  const duplicateUploadRisk = new Set(keys).size !== keys.length;

  return {
    duplicate_upload_guard_injected: true,
    duplicate_upload_risk: duplicateUploadRisk,
    same_asset_previously_uploaded: false,
    blocker: duplicateUploadRisk ? "DUPLICATE_VIDEO_ASSET_REUSE" : null,
    checked_channel_count: candidates.length,
    checked_video_paths: candidates.map((candidate) => candidate.video_path),
    raw_urls_printed: false
  };
}

export function createV050NoopUploadAdapter() {
  return async function uploadVideo() {
    throw new Error("V050 check-only upload adapter must never be called.");
  };
}

function safeAssetKey(candidate: V050DuplicateUploadCandidate) {
  return candidate.video_sha256?.trim() || candidate.video_path.trim().toLowerCase();
}
