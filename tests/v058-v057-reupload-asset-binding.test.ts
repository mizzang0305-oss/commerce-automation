import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { CHANNEL_KEYS, type ChannelKey } from "../src/uploads/multi-channel/channelProfiles";
import {
  V051_PAID_PROMOTION_CONFIRMATION_PHRASE,
  V051_UPLOAD_APPROVAL_PHRASE
} from "../src/uploads/multi-channel/v051ApprovalAliasWrapper";
import {
  executeV051MutationEnabledUploads,
  type V051MutationCommentAdapter,
  type V051MutationUploadAdapter
} from "../src/uploads/multi-channel/v051MutationEnabledExecutor";
import {
  V057_REUPLOAD_ASSET_PROFILE,
  resolveV057ReuploadAssetBindings
} from "../src/uploads/multi-channel/v057ReuploadAssetBinding";

const APPROVAL_TEXT = `${V051_UPLOAD_APPROVAL_PHRASE}\n${V051_PAID_PROMOTION_CONFIRMATION_PHRASE}`;
const AFFILIATE_URLS: Record<ChannelKey, string> = {
  father_jobs: "MASKED_AFFILIATE_FATHER",
  neoman_moleulgeol: "MASKED_AFFILIATE_NEOMAN",
  lets_buy: "MASKED_AFFILIATE_LETS_BUY"
};
const SANITIZED_REPORT_FORBIDDEN_PATTERN = new RegExp([
  "MASKED_AFFILIATE_",
  "https?:\\/\\/",
  "Authorization",
  "Bearer",
  "client" + "_secret"
].join("|"), "i");

async function makeCwd() {
  return mkdtemp(path.join(os.tmpdir(), "commerce-v058-"));
}

function expectedV057VideoPath(cwd: string, channelKey: ChannelKey) {
  return path.join(cwd, "commerce-assets", "review", "v057", channelKey, "corrected-preview-v057.mp4");
}

function expectedV057FirstFramePath(cwd: string, channelKey: ChannelKey) {
  return path.join(cwd, "commerce-assets", "review", "v057", channelKey, "first-frame-v057.jpg");
}

async function writeV057Assets(cwd: string, options: {
  skipMp4?: ChannelKey;
  wrongFilename?: ChannelKey;
  skipFirstFrame?: ChannelKey;
} = {}) {
  for (const channelKey of CHANNEL_KEYS) {
    const channelDir = path.join(cwd, "commerce-assets", "review", "v057", channelKey);
    await mkdir(channelDir, { recursive: true });
    if (options.skipMp4 !== channelKey) {
      const filename = options.wrongFilename === channelKey ? "local-review-video.mp4" : "corrected-preview-v057.mp4";
      await writeFile(path.join(channelDir, filename), `fake-v057-${channelKey}-mp4`, "utf8");
    }
    if (options.skipFirstFrame !== channelKey) {
      await writeFile(path.join(channelDir, "first-frame-v057.jpg"), `fake-v057-${channelKey}-jpg`, "utf8");
    }
  }
}

async function writeV048FallbackAssets(cwd: string) {
  for (const channelKey of CHANNEL_KEYS) {
    const fallback = path.join(cwd, "commerce-assets", "review", "v048", channelKey, "local-review-video.mp4");
    await mkdir(path.dirname(fallback), { recursive: true });
    await writeFile(fallback, `forbidden-v048-${channelKey}-mp4`, "utf8");
  }
}

function mockUploadAdapter() {
  const calls: Array<Parameters<V051MutationUploadAdapter["uploadPublicShorts"]>[0]> = [];
  const adapter: V051MutationUploadAdapter = {
    async uploadPublicShorts(request) {
      calls.push(request);
      return {
        videoId: `video-${request.channelKey}`,
        visibility: "public"
      };
    }
  };
  return { adapter, calls };
}

function mockCommentAdapter() {
  const calls: Array<Parameters<V051MutationCommentAdapter["createTopLevelComment"]>[0]> = [];
  const adapter: V051MutationCommentAdapter = {
    async createTopLevelComment(request) {
      calls.push(request);
      return {
        commentId: `comment-${request.videoId}`
      };
    }
  };
  return { adapter, calls };
}

describe("v058 v057 reupload asset binding", () => {
  test("v057 asset profile resolves exact three corrected-preview mp4 paths and first frames", async () => {
    const cwd = await makeCwd();
    try {
      await writeV057Assets(cwd);
      await writeV048FallbackAssets(cwd);

      const result = await resolveV057ReuploadAssetBindings({
        cwd,
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE
      });

      expect(result).toMatchObject({
        upload_asset_profile_added: true,
        selected_profile: V057_REUPLOAD_ASSET_PROFILE,
        father_jobs_v057_mp4_exists: true,
        father_jobs_v057_mp4_bound: true,
        neoman_moleulgeol_v057_mp4_exists: true,
        neoman_moleulgeol_v057_mp4_bound: true,
        lets_buy_v057_mp4_exists: true,
        lets_buy_v057_mp4_bound: true,
        father_jobs_first_frame_v057_exists: true,
        neoman_moleulgeol_first_frame_v057_exists: true,
        lets_buy_first_frame_v057_exists: true,
        no_v048_fallback: true,
        asset_binding_blocker: null,
        videos_insert_called: false,
        comment_create_update_delete_called: false,
        new_upload_attempted: false,
        raw_urls_printed: false,
        secrets_printed: false,
        fake_success: false
      });
      expect(result.father_jobs_video_path).toBe(expectedV057VideoPath(cwd, "father_jobs"));
      expect(result.neoman_moleulgeol_video_path).toBe(expectedV057VideoPath(cwd, "neoman_moleulgeol"));
      expect(result.lets_buy_video_path).toBe(expectedV057VideoPath(cwd, "lets_buy"));
      expect(result.bindings.father_jobs.first_frame_path).toBe(expectedV057FirstFramePath(cwd, "father_jobs"));
      expect(result.bindings.neoman_moleulgeol.first_frame_path).toBe(expectedV057FirstFramePath(cwd, "neoman_moleulgeol"));
      expect(result.bindings.lets_buy.first_frame_path).toBe(expectedV057FirstFramePath(cwd, "lets_buy"));
      expect(JSON.stringify(result)).not.toContain(path.join("review", "v048"));
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("v057 profile rejects missing mp4, wrong filename, missing first frame, and v048 fallback", async () => {
    const missing = await makeCwd();
    const wrongName = await makeCwd();
    const noFrame = await makeCwd();
    const noProfile = await makeCwd();
    try {
      await writeV057Assets(missing, { skipMp4: "father_jobs" });
      await writeV048FallbackAssets(missing);
      await writeV057Assets(wrongName, { wrongFilename: "neoman_moleulgeol" });
      await writeV048FallbackAssets(wrongName);
      await writeV057Assets(noFrame, { skipFirstFrame: "lets_buy" });
      await writeV057Assets(noProfile);

      await expect(resolveV057ReuploadAssetBindings({
        cwd: missing,
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE
      })).resolves.toMatchObject({
        father_jobs_v057_mp4_exists: false,
        no_v048_fallback: false,
        asset_binding_blocker: "BLOCKED_V057_ASSET_MISSING"
      });
      await expect(resolveV057ReuploadAssetBindings({
        cwd: wrongName,
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE
      })).resolves.toMatchObject({
        neoman_moleulgeol_v057_mp4_exists: false,
        no_v048_fallback: false,
        asset_binding_blocker: "BLOCKED_V057_ASSET_PATH_MISMATCH"
      });
      await expect(resolveV057ReuploadAssetBindings({
        cwd: noFrame,
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE
      })).resolves.toMatchObject({
        lets_buy_first_frame_v057_exists: false,
        asset_binding_blocker: "BLOCKED_V057_FIRST_FRAME_MISSING"
      });
      await expect(resolveV057ReuploadAssetBindings({
        cwd: noProfile,
        uploadAssetProfile: null
      })).resolves.toMatchObject({
        selected_profile: null,
        asset_binding_blocker: "BLOCKED_REUPLOAD_ASSET_PROFILE_NOT_SELECTED"
      });
    } finally {
      await rm(missing, { recursive: true, force: true });
      await rm(wrongName, { recursive: true, force: true });
      await rm(noFrame, { recursive: true, force: true });
      await rm(noProfile, { recursive: true, force: true });
    }
  });

  test("upload:v051 execution uses v057 asset binding in mutation mode without mutation side effects in mocked adapters", async () => {
    const cwd = await makeCwd();
    try {
      await writeV057Assets(cwd);
      await writeV048FallbackAssets(cwd);
      const upload = mockUploadAdapter();
      const comment = mockCommentAdapter();

      const result = await executeV051MutationEnabledUploads({
        cwd,
        executionMode: "mutation_enabled",
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE,
        approvalText: APPROVAL_TEXT,
        affiliateUrls: AFFILIATE_URLS,
        adapters: { uploadAdapter: upload.adapter, commentAdapter: comment.adapter }
      });

      expect(result.asset_binding_blocker).toBeNull();
      expect(result.father_jobs_v057_mp4_bound).toBe(true);
      expect(result.neoman_moleulgeol_v057_mp4_bound).toBe(true);
      expect(result.lets_buy_v057_mp4_bound).toBe(true);
      expect(result.no_v048_fallback).toBe(true);
      expect(upload.calls.map((call) => call.videoPath)).toEqual([
        expectedV057VideoPath(cwd, "father_jobs"),
        expectedV057VideoPath(cwd, "neoman_moleulgeol"),
        expectedV057VideoPath(cwd, "lets_buy")
      ]);
      expect(upload.calls.every((call) => !call.videoPath.includes(path.join("review", "v048")))).toBe(true);
      expect(result.youtube_execute_called).toBe(false);
      expect(result.videos_insert_called).toBe(false);
      expect(result.comment_create_update_delete_called).toBe(false);
      expect(result.raw_urls_printed).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(SANITIZED_REPORT_FORBIDDEN_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("explicit missing upload asset profile blocks mutation mode before adapter calls", async () => {
    const cwd = await makeCwd();
    try {
      await writeV057Assets(cwd);
      const upload = mockUploadAdapter();
      const comment = mockCommentAdapter();

      const result = await executeV051MutationEnabledUploads({
        cwd,
        executionMode: "mutation_enabled",
        uploadAssetProfile: null,
        approvalText: APPROVAL_TEXT,
        affiliateUrls: AFFILIATE_URLS,
        adapters: { uploadAdapter: upload.adapter, commentAdapter: comment.adapter }
      });

      expect(result.asset_binding_blocker).toBe("BLOCKED_REUPLOAD_ASSET_PROFILE_NOT_SELECTED");
      expect(result.videos_insert_total_count).toBe(0);
      expect(result.comment_create_total_count).toBe(0);
      expect(result.new_upload_attempted).toBe(false);
      expect(upload.calls).toHaveLength(0);
      expect(comment.calls).toHaveLength(0);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
