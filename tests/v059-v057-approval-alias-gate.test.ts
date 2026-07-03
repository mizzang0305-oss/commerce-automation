import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { CHANNEL_KEYS, type ChannelKey } from "../src/uploads/multi-channel/channelProfiles";
import {
  V051_PAID_PROMOTION_CONFIRMATION_PHRASE,
  V051_UPLOAD_APPROVAL_PHRASE,
  V057_CORRECTED_REUPLOAD_APPROVAL_PHRASE,
  buildV051ApprovalAliasStatus
} from "../src/uploads/multi-channel/v051ApprovalAliasWrapper";
import {
  executeV051MutationEnabledUploads,
  type V051MutationCommentAdapter,
  type V051MutationUploadAdapter
} from "../src/uploads/multi-channel/v051MutationEnabledExecutor";
import { V057_REUPLOAD_ASSET_PROFILE } from "../src/uploads/multi-channel/v057ReuploadAssetBinding";

const V051_APPROVAL_TEXT = `${V051_UPLOAD_APPROVAL_PHRASE}\n${V051_PAID_PROMOTION_CONFIRMATION_PHRASE}`;
const V057_APPROVAL_TEXT = V057_CORRECTED_REUPLOAD_APPROVAL_PHRASE;
const V057_APPROVAL_WITH_PAID_PROMOTION_TEXT =
  `${V057_CORRECTED_REUPLOAD_APPROVAL_PHRASE}\n${V051_PAID_PROMOTION_CONFIRMATION_PHRASE}`;
const AFFILIATE_URLS: Record<ChannelKey, string> = {
  father_jobs: "https://link.coupang.com/a/v059-father",
  neoman_moleulgeol: "https://link.coupang.com/a/v059-neoman",
  lets_buy: "https://link.coupang.com/a/v059-lets-buy"
};
const FORBIDDEN_REPORT_PATTERN = /v059-father|v059-neoman|v059-lets-buy|https?:\/\/|Authorization|Bearer|client_secret|refresh_token/i;
const REPO_ROOT = path.resolve(__dirname, "..");
const TSX_CLI = path.join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.cjs");
const PREFLIGHT_CLI = path.join(REPO_ROOT, "scripts", "uploads", "generate-v051-approval-alias-preflight.ts");

async function makeCwd() {
  return mkdtemp(path.join(os.tmpdir(), "commerce-v059-"));
}

async function writeV057Assets(cwd: string) {
  for (const channelKey of CHANNEL_KEYS) {
    const channelDir = path.join(cwd, "commerce-assets", "review", "v057", channelKey);
    await mkdir(channelDir, { recursive: true });
    await writeFile(path.join(channelDir, "corrected-preview-v057.mp4"), `fake-v057-${channelKey}-mp4`, "utf8");
    await writeFile(path.join(channelDir, "first-frame-v057.jpg"), `fake-v057-${channelKey}-jpg`, "utf8");
  }
}

async function writeV048FallbackAssets(cwd: string) {
  for (const channelKey of CHANNEL_KEYS) {
    const channelDir = path.join(cwd, "commerce-assets", "review", "v048", channelKey);
    const fallback = path.join(channelDir, "local-review-video.mp4");
    await mkdir(channelDir, { recursive: true });
    await writeFile(fallback, `forbidden-v048-${channelKey}-mp4`, "utf8");
    await writeFile(
      path.join(channelDir, "comment-preview.json"),
      `${JSON.stringify({ comment_contains_affiliate_link: true }, null, 2)}\n`,
      "utf8"
    );
  }
}

function runPreflightCli(cwd: string, env: {
  V051_APPROVAL_TEXT?: string;
  V051_UPLOAD_ASSET_PROFILE?: string;
}) {
  const result = spawnSync(process.execPath, [TSX_CLI, PREFLIGHT_CLI], {
    cwd,
    env: {
      ...process.env,
      V051_APPROVAL_TEXT: env.V051_APPROVAL_TEXT ?? "",
      ...(env.V051_UPLOAD_ASSET_PROFILE === undefined ? {} : {
        V051_UPLOAD_ASSET_PROFILE: env.V051_UPLOAD_ASSET_PROFILE
      })
    },
    encoding: "utf8"
  });
  const stdout = result.stdout.trim();
  return {
    status: result.status,
    stderr: result.stderr,
    report: stdout ? JSON.parse(stdout) as Record<string, unknown> : null
  };
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

describe("v059 v057 corrected reupload approval alias gate", () => {
  test("blocks v057 profile when v057 approval phrase is missing", () => {
    const result = buildV051ApprovalAliasStatus({
      approvalText: "",
      uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE
    });

    expect(result.V051_ALIAS_READY).toBe(false);
    expect(result.FINAL_STATUS).toBe("BLOCKED_V051_APPROVAL_ALIAS_MISSING");
    expect(result.approval_blocker).toBe("V057_CORRECTED_REUPLOAD_APPROVAL_MISSING");
    expect(result.v057_corrected_reupload_approval_present).toBe(false);
    expect(result.v057_reupload_asset_profile_present).toBe(true);
  });

  test("blocks v057 approval phrase when the reupload asset profile is missing", () => {
    const result = buildV051ApprovalAliasStatus({
      approvalText: V057_APPROVAL_TEXT
    });

    expect(result.V051_ALIAS_READY).toBe(false);
    expect(result.FINAL_STATUS).toBe("BLOCKED_V051_APPROVAL_ALIAS_MISSING");
    expect(result.approval_blocker).toBe("BLOCKED_V057_REUPLOAD_ASSET_PROFILE_MISSING");
    expect(result.v057_corrected_reupload_approval_present).toBe(true);
    expect(result.v057_reupload_asset_profile_present).toBe(false);
  });

  test("blocks v057 approval phrase and profile when paid-promotion confirmation is missing", () => {
    const result = buildV051ApprovalAliasStatus({
      approvalText: V057_APPROVAL_TEXT,
      uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE
    });

    expect(result.V051_ALIAS_READY).toBe(false);
    expect(result.FINAL_STATUS).toBe("BLOCKED_V051_APPROVAL_ALIAS_MISSING");
    expect(result.approval_blocker).toBe("V051_PAID_PROMOTION_CONFIRMATION_MISSING");
    expect(result.paid_promotion_confirmation_present).toBe(false);
    expect(result.v057_corrected_reupload_approval_present).toBe(true);
    expect(result.v057_reupload_asset_profile_present).toBe(true);
    expect(result.v057_approval_profile_match).toBe(true);
  });

  test("accepts v057 approval phrase only with v057 corrected reupload profile and paid-promotion confirmation", () => {
    const result = buildV051ApprovalAliasStatus({
      approvalText: V057_APPROVAL_WITH_PAID_PROMOTION_TEXT,
      uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE
    });

    expect(result).toMatchObject({
      FINAL_STATUS: "SUCCESS_V052_V051_APPROVAL_ALIAS_READY_NO_UPLOAD",
      V051_ALIAS_READY: true,
      SAFE_TO_UPLOAD: false,
      approval_blocker: null,
      paid_promotion_confirmation_present: true,
      v051_upload_approval_present: false,
      v057_corrected_reupload_approval_present: true,
      v057_reupload_asset_profile_present: true,
      v057_approval_profile_match: true,
      mapped_v049_approval_text_generated: true,
      raw_urls_printed: false,
      secrets_printed: false,
      fake_success: false
    });
  });

  test("blocks v057 approval phrase with a mismatched profile", () => {
    const result = buildV051ApprovalAliasStatus({
      approvalText: V057_APPROVAL_TEXT,
      uploadAssetProfile: "v048_default"
    });

    expect(result.V051_ALIAS_READY).toBe(false);
    expect(result.FINAL_STATUS).toBe("BLOCKED_V051_APPROVAL_ALIAS_MISSING");
    expect(result.approval_blocker).toBe("BLOCKED_V057_APPROVAL_PROFILE_MISMATCH");
    expect(result.v057_corrected_reupload_approval_present).toBe(true);
    expect(result.v057_reupload_asset_profile_present).toBe(false);
    expect(result.v057_approval_profile_match).toBe(false);
  });

  test("keeps existing v051 approval aliases independent from v057 profile gate", () => {
    const result = buildV051ApprovalAliasStatus({
      approvalText: V051_APPROVAL_TEXT
    });

    expect(result).toMatchObject({
      FINAL_STATUS: "SUCCESS_V052_V051_APPROVAL_ALIAS_READY_NO_UPLOAD",
      V051_ALIAS_READY: true,
      approval_blocker: null,
      v051_upload_approval_present: true,
      paid_promotion_confirmation_present: true,
      v057_corrected_reupload_approval_present: false,
      v057_reupload_asset_profile_present: false,
      v057_approval_profile_match: false
    });
  });

  test("accepted v057 alias remains no-upload in check_only mode and preserves v057 asset binding", async () => {
    const cwd = await makeCwd();
    try {
      await writeV057Assets(cwd);
      await writeV048FallbackAssets(cwd);
      const upload = mockUploadAdapter();
      const comment = mockCommentAdapter();

      const result = await executeV051MutationEnabledUploads({
        cwd,
        executionMode: "check_only",
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE,
        approvalText: V057_APPROVAL_WITH_PAID_PROMOTION_TEXT,
        affiliateUrls: AFFILIATE_URLS,
        adapters: { uploadAdapter: upload.adapter, commentAdapter: comment.adapter }
      });

      expect(result.FINAL_STATUS).toBe("SUCCESS_V053_MUTATION_ENABLED_V051_EXECUTOR_READY_NO_UPLOAD");
      expect(result.mutation_blocker).toBe("CHECK_ONLY_NO_UPLOAD");
      expect(result.preflight.V051_ALIAS_READY).toBe(true);
      expect(result.preflight.approval_blocker).toBeNull();
      expect(result.selected_profile).toBe(V057_REUPLOAD_ASSET_PROFILE);
      expect(result.asset_binding_blocker).toBeNull();
      expect(result.no_v048_fallback).toBe(true);
      expect(result.father_jobs_v057_mp4_bound).toBe(true);
      expect(result.neoman_moleulgeol_v057_mp4_bound).toBe(true);
      expect(result.lets_buy_v057_mp4_bound).toBe(true);
      expect(upload.calls).toHaveLength(0);
      expect(comment.calls).toHaveLength(0);
      expect(result.videos_insert_total_count).toBe(0);
      expect(result.comment_create_total_count).toBe(0);
      expect(result.youtube_execute_called).toBe(false);
      expect(result.videos_insert_called).toBe(false);
      expect(result.comment_create_update_delete_called).toBe(false);
      expect(result.R2_upload).toBe(false);
      expect(result.DB_write).toBe(false);
      expect(result.product_assets_write).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("blocks v057 alias before mutation adapters when paid-promotion confirmation is missing", async () => {
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
        approvalText: V057_APPROVAL_TEXT,
        affiliateUrls: AFFILIATE_URLS,
        adapters: { uploadAdapter: upload.adapter, commentAdapter: comment.adapter }
      });

      expect(result.preflight.V051_ALIAS_READY).toBe(false);
      expect(result.preflight.approval_blocker).toBe("V051_PAID_PROMOTION_CONFIRMATION_MISSING");
      expect(result.mutation_blocker).toBe("V051_PAID_PROMOTION_CONFIRMATION_MISSING");
      expect(upload.calls).toHaveLength(0);
      expect(comment.calls).toHaveLength(0);
      expect(result.videos_insert_total_count).toBe(0);
      expect(result.comment_create_total_count).toBe(0);
      expect(result.youtube_execute_called).toBe(false);
      expect(result.videos_insert_called).toBe(false);
      expect(result.comment_create_update_delete_called).toBe(false);
      expect(result.R2_upload).toBe(false);
      expect(result.DB_write).toBe(false);
      expect(result.product_assets_write).toBe(false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("upload:v051:preflight CLI passes V051_UPLOAD_ASSET_PROFILE into the v057 alias gate", async () => {
    const missingPaid = await makeCwd();
    const accepted = await makeCwd();
    try {
      await writeV048FallbackAssets(accepted);

      const missingPaidResult = runPreflightCli(missingPaid, {
        V051_APPROVAL_TEXT: V057_APPROVAL_TEXT,
        V051_UPLOAD_ASSET_PROFILE: V057_REUPLOAD_ASSET_PROFILE
      });
      expect(missingPaidResult.status).toBe(1);
      expect(missingPaidResult.report).toMatchObject({
        FINAL_STATUS: "BLOCKED_V051_APPROVAL_ALIAS_MISSING",
        approval_blocker: "V051_PAID_PROMOTION_CONFIRMATION_MISSING",
        v057_corrected_reupload_approval_present: true,
        v057_reupload_asset_profile_present: true
      });

      const acceptedResult = runPreflightCli(accepted, {
        V051_APPROVAL_TEXT: V057_APPROVAL_WITH_PAID_PROMOTION_TEXT,
        V051_UPLOAD_ASSET_PROFILE: V057_REUPLOAD_ASSET_PROFILE
      });
      expect(acceptedResult.status).toBe(0);
      expect(acceptedResult.report).toMatchObject({
        FINAL_STATUS: "SUCCESS_V052_V051_APPROVAL_ALIAS_READY_NO_UPLOAD",
        V051_ALIAS_READY: true,
        paid_promotion_confirmation_present: true,
        v057_corrected_reupload_approval_present: true,
        v057_reupload_asset_profile_present: true,
        youtube_execute_called: false,
        videos_insert_called: false,
        comment_create_update_delete_called: false,
        R2_upload: false,
        DB_write: false,
        product_assets_write: false
      });
      expect(JSON.stringify(acceptedResult.report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(missingPaid, { recursive: true, force: true });
      await rm(accepted, { recursive: true, force: true });
    }
  });
});
