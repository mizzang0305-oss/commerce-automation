import fs from "node:fs/promises";
import path from "node:path";

import { CHANNEL_KEYS, type ChannelKey } from "./channelProfiles";

export const V057_REUPLOAD_ASSET_PROFILE = "v057_corrected_reupload";

export type V057ReuploadAssetProfile = typeof V057_REUPLOAD_ASSET_PROFILE;

export type V057ReuploadAssetBindingBlocker =
  | "BLOCKED_V057_ASSET_MISSING"
  | "BLOCKED_V057_ASSET_PATH_MISMATCH"
  | "BLOCKED_V057_FIRST_FRAME_MISSING"
  | "BLOCKED_V048_ASSET_FALLBACK_ATTEMPTED"
  | "BLOCKED_REUPLOAD_ASSET_PROFILE_NOT_SELECTED";

export type V057ReuploadAssetBindingReport = {
  upload_asset_profile_added: true;
  selected_profile: V057ReuploadAssetProfile | null;
  father_jobs_v057_mp4_exists: boolean;
  father_jobs_v057_mp4_bound: boolean;
  father_jobs_video_path: string | null;
  neoman_moleulgeol_v057_mp4_exists: boolean;
  neoman_moleulgeol_v057_mp4_bound: boolean;
  neoman_moleulgeol_video_path: string | null;
  lets_buy_v057_mp4_exists: boolean;
  lets_buy_v057_mp4_bound: boolean;
  lets_buy_video_path: string | null;
  father_jobs_first_frame_v057_exists: boolean;
  neoman_moleulgeol_first_frame_v057_exists: boolean;
  lets_buy_first_frame_v057_exists: boolean;
  no_v048_fallback: boolean;
  asset_binding_blocker: V057ReuploadAssetBindingBlocker | null;
  videos_insert_called: false;
  comment_create_update_delete_called: false;
  new_upload_attempted: false;
  raw_urls_printed: false;
  secrets_printed: false;
  fake_success: false;
  bindings: Record<ChannelKey, {
    channel_key: ChannelKey;
    video_path: string;
    first_frame_path: string;
    v057_mp4_exists: boolean;
    first_frame_v057_exists: boolean;
    v057_mp4_bound: boolean;
    v048_fallback_exists: boolean;
    wrong_v057_fallback_filename_exists: boolean;
  }>;
};

export async function resolveV057ReuploadAssetBindings(input: {
  cwd?: string;
  uploadAssetProfile?: string | null;
} = {}): Promise<V057ReuploadAssetBindingReport> {
  const cwd = input.cwd ?? process.cwd();
  const selectedProfile = input.uploadAssetProfile === V057_REUPLOAD_ASSET_PROFILE
    ? V057_REUPLOAD_ASSET_PROFILE
    : null;
  const bindings = Object.fromEntries(await Promise.all(CHANNEL_KEYS.map(async (channelKey) => {
    const videoPath = getV057ReuploadVideoPath(cwd, channelKey);
    const firstFramePath = getV057FirstFramePath(cwd, channelKey);
    const fallbackPath = path.join(cwd, "commerce-assets", "review", "v048", channelKey, "local-review-video.mp4");
    const wrongV057FallbackPath = path.join(cwd, "commerce-assets", "review", "v057", channelKey, "local-review-video.mp4");
    const v057Mp4Exists = await fileExists(videoPath);
    const firstFrameExists = await fileExists(firstFramePath);
    const fallbackExists = await fileExists(fallbackPath);
    const wrongV057FallbackFilenameExists = await fileExists(wrongV057FallbackPath);

    return [channelKey, {
      channel_key: channelKey,
      video_path: videoPath,
      first_frame_path: firstFramePath,
      v057_mp4_exists: v057Mp4Exists,
      first_frame_v057_exists: firstFrameExists,
      v057_mp4_bound: selectedProfile === V057_REUPLOAD_ASSET_PROFILE && v057Mp4Exists,
      v048_fallback_exists: fallbackExists,
      wrong_v057_fallback_filename_exists: wrongV057FallbackFilenameExists
    }];
  }))) as V057ReuploadAssetBindingReport["bindings"];

  const noV048Fallback = selectedProfile === V057_REUPLOAD_ASSET_PROFILE &&
    CHANNEL_KEYS.every((channelKey) => bindings[channelKey].v057_mp4_exists) &&
    CHANNEL_KEYS.every((channelKey) => !bindings[channelKey].wrong_v057_fallback_filename_exists);
  const blocker = selectedProfile === null
    ? "BLOCKED_REUPLOAD_ASSET_PROFILE_NOT_SELECTED"
    : firstBlocker([
      CHANNEL_KEYS.some((channelKey) => bindings[channelKey].wrong_v057_fallback_filename_exists) ? "BLOCKED_V057_ASSET_PATH_MISMATCH" : null,
      CHANNEL_KEYS.some((channelKey) => !bindings[channelKey].v057_mp4_exists) ? "BLOCKED_V057_ASSET_MISSING" : null,
      CHANNEL_KEYS.some((channelKey) => !bindings[channelKey].first_frame_v057_exists) ? "BLOCKED_V057_FIRST_FRAME_MISSING" : null,
      noV048Fallback ? null : "BLOCKED_V048_ASSET_FALLBACK_ATTEMPTED"
    ]);

  return {
    upload_asset_profile_added: true,
    selected_profile: selectedProfile,
    father_jobs_v057_mp4_exists: bindings.father_jobs.v057_mp4_exists,
    father_jobs_v057_mp4_bound: blocker === null && bindings.father_jobs.v057_mp4_bound,
    father_jobs_video_path: selectedProfile ? bindings.father_jobs.video_path : null,
    neoman_moleulgeol_v057_mp4_exists: bindings.neoman_moleulgeol.v057_mp4_exists,
    neoman_moleulgeol_v057_mp4_bound: blocker === null && bindings.neoman_moleulgeol.v057_mp4_bound,
    neoman_moleulgeol_video_path: selectedProfile ? bindings.neoman_moleulgeol.video_path : null,
    lets_buy_v057_mp4_exists: bindings.lets_buy.v057_mp4_exists,
    lets_buy_v057_mp4_bound: blocker === null && bindings.lets_buy.v057_mp4_bound,
    lets_buy_video_path: selectedProfile ? bindings.lets_buy.video_path : null,
    father_jobs_first_frame_v057_exists: bindings.father_jobs.first_frame_v057_exists,
    neoman_moleulgeol_first_frame_v057_exists: bindings.neoman_moleulgeol.first_frame_v057_exists,
    lets_buy_first_frame_v057_exists: bindings.lets_buy.first_frame_v057_exists,
    no_v048_fallback: blocker === null && noV048Fallback,
    asset_binding_blocker: blocker,
    videos_insert_called: false,
    comment_create_update_delete_called: false,
    new_upload_attempted: false,
    raw_urls_printed: false,
    secrets_printed: false,
    fake_success: false,
    bindings
  };
}

export function getV057ReuploadVideoPath(cwd: string, channelKey: ChannelKey) {
  return path.join(cwd, "commerce-assets", "review", "v057", channelKey, "corrected-preview-v057.mp4");
}

export function getV057FirstFramePath(cwd: string, channelKey: ChannelKey) {
  return path.join(cwd, "commerce-assets", "review", "v057", channelKey, "first-frame-v057.jpg");
}

async function fileExists(filePath: string) {
  try {
    const info = await fs.stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}

function firstBlocker<T extends string>(values: Array<T | null>) {
  return values.find((value): value is T => Boolean(value)) ?? null;
}
