import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { CHANNEL_KEYS, type ChannelKey } from "../src/uploads/multi-channel/channelProfiles";
import {
  V051_PAID_PROMOTION_CONFIRMATION_PHRASE,
  V057_CORRECTED_REUPLOAD_APPROVAL_PHRASE
} from "../src/uploads/multi-channel/v051ApprovalAliasWrapper";
import {
  executeV051MutationEnabledUploads,
  type V051MutationCommentAdapter,
  type V051MutationUploadAdapter
} from "../src/uploads/multi-channel/v051MutationEnabledExecutor";
import {
  loadV057AffiliateUrlsForExecution,
  validateV057AffiliateUrlsForExecution
} from "../src/uploads/multi-channel/v057AffiliateUrlInjectionGate";
import { V057_REUPLOAD_ASSET_PROFILE } from "../src/uploads/multi-channel/v057ReuploadAssetBinding";
import { buildV051ExecutionInputFromEnv } from "../scripts/uploads/execute-v051-three-channel-public-upload";

const APPROVAL_TEXT =
  `${V057_CORRECTED_REUPLOAD_APPROVAL_PHRASE}\n${V051_PAID_PROMOTION_CONFIRMATION_PHRASE}`;

const VALID_AFFILIATE_URLS: Record<ChannelKey, string> = {
  father_jobs: "https://link.coupang.com/a/v063-father",
  neoman_moleulgeol: "https://link.coupang.com/a/v063-neoman",
  lets_buy: "https://link.coupang.com/a/v063-lets-buy"
};

const ENV_KEYS = {
  father_jobs: "V051_FATHER_JOBS_AFFILIATE_URL",
  neoman_moleulgeol: "V051_NEOMAN_MOLEULGEOL_AFFILIATE_URL",
  lets_buy: "V051_LETS_BUY_AFFILIATE_URL"
} as const satisfies Record<ChannelKey, string>;

const FORBIDDEN_REPORT_PATTERN =
  /v063-father|v063-neoman|v063-lets-buy|Authorization|Bearer|client_secret|refresh_token/i;

async function makeCwd() {
  return mkdtemp(path.join(os.tmpdir(), "commerce-v063-"));
}

async function writeV057Assets(cwd: string) {
  for (const channelKey of CHANNEL_KEYS) {
    const channelDir = path.join(cwd, "commerce-assets", "review", "v057", channelKey);
    await mkdir(channelDir, { recursive: true });
    await writeFile(path.join(channelDir, "corrected-preview-v057.mp4"), `fake-v057-${channelKey}-mp4`, "utf8");
    await writeFile(path.join(channelDir, "first-frame-v057.jpg"), `fake-v057-${channelKey}-jpg`, "utf8");
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

function envFromUrls(urls: Partial<Record<ChannelKey, string>>) {
  return Object.fromEntries(
    CHANNEL_KEYS.map((channelKey) => [ENV_KEYS[channelKey], urls[channelKey] ?? ""])
  ) as NodeJS.ProcessEnv;
}

async function expectBlockedBeforeMutation(urls: Partial<Record<ChannelKey, string>>) {
  const cwd = await makeCwd();
  try {
    await writeV057Assets(cwd);
    const upload = mockUploadAdapter();
    const comment = mockCommentAdapter();
    const result = await executeV051MutationEnabledUploads({
      cwd,
      executionMode: "mutation_enabled",
      uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE,
      approvalText: APPROVAL_TEXT,
      affiliateUrls: urls,
      adapters: { uploadAdapter: upload.adapter, commentAdapter: comment.adapter }
    });

    expect(result.FINAL_STATUS).toBe("BLOCKED_V053_MUTATION_ENABLED_V051_EXECUTOR");
    expect(result.affiliate_url_gate_ready).toBe(false);
    expect(result.mutation_blocker).toMatch(/^BLOCKED_V057_AFFILIATE_URLS_/);
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
}

describe("v063 v057 affiliate URL injection gate", () => {
  test("CLI reads three affiliate URL env values from server-only env sources", async () => {
    const cwd = await makeCwd();
    try {
      await writeFile(
        path.join(cwd, ".env.local"),
        [
          `${ENV_KEYS.father_jobs}=${VALID_AFFILIATE_URLS.father_jobs}`,
          `${ENV_KEYS.neoman_moleulgeol}=${VALID_AFFILIATE_URLS.neoman_moleulgeol}`,
          `${ENV_KEYS.lets_buy}=${VALID_AFFILIATE_URLS.lets_buy}`
        ].join("\n"),
        "utf8"
      );

      const loaded = await loadV057AffiliateUrlsForExecution({ cwd, env: {} });

      expect(loaded.affiliateUrls).toEqual(VALID_AFFILIATE_URLS);
      expect(loaded.report.affiliate_url_gate_ready).toBe(true);
      expect(loaded.report.channels.every((channel) => channel.present)).toBe(true);
      expect(loaded.report.channels.every((channel) => channel.host === "link.coupang.com")).toBe(true);
      expect(JSON.stringify(loaded.report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("CLI execution input passes affiliateUrls into executeV051MutationEnabledUploads", async () => {
    const cwd = await makeCwd();
    try {
      const executionInput = await buildV051ExecutionInputFromEnv({
        cwd,
        env: {
          V051_EXECUTION_MODE: "mutation_enabled",
          V051_UPLOAD_ASSET_PROFILE: V057_REUPLOAD_ASSET_PROFILE,
          V051_APPROVAL_TEXT: APPROVAL_TEXT,
          ...envFromUrls(VALID_AFFILIATE_URLS)
        }
      });

      expect(executionInput.affiliateUrls).toEqual(VALID_AFFILIATE_URLS);
      expect(executionInput.affiliateUrlGate.report.affiliate_url_gate_ready).toBe(true);
      expect(JSON.stringify(executionInput.affiliateUrlGate.report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("executor blocks missing father_jobs affiliate URL before mutation", async () => {
    await expectBlockedBeforeMutation({
      neoman_moleulgeol: VALID_AFFILIATE_URLS.neoman_moleulgeol,
      lets_buy: VALID_AFFILIATE_URLS.lets_buy
    });
  });

  test("executor blocks missing neoman_moleulgeol affiliate URL before mutation", async () => {
    await expectBlockedBeforeMutation({
      father_jobs: VALID_AFFILIATE_URLS.father_jobs,
      lets_buy: VALID_AFFILIATE_URLS.lets_buy
    });
  });

  test("executor blocks missing lets_buy affiliate URL before mutation", async () => {
    await expectBlockedBeforeMutation({
      father_jobs: VALID_AFFILIATE_URLS.father_jobs,
      neoman_moleulgeol: VALID_AFFILIATE_URLS.neoman_moleulgeol
    });
  });

  test("executor blocks empty string affiliate URL before mutation", async () => {
    await expectBlockedBeforeMutation({
      ...VALID_AFFILIATE_URLS,
      father_jobs: " "
    });
  });

  test("executor blocks invalid affiliate URL before mutation", async () => {
    await expectBlockedBeforeMutation({
      ...VALID_AFFILIATE_URLS,
      father_jobs: "http://not-allowed.invalid/father"
    });
  });

  test("valid three URLs mark affiliate_url_gate_ready and connect each URL to its channel comment adapter", async () => {
    const cwd = await makeCwd();
    try {
      await writeV057Assets(cwd);
      const upload = mockUploadAdapter();
      const comment = mockCommentAdapter();

      const result = await executeV051MutationEnabledUploads({
        cwd,
        executionMode: "mutation_enabled",
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE,
        approvalText: APPROVAL_TEXT,
        affiliateUrls: VALID_AFFILIATE_URLS,
        adapters: { uploadAdapter: upload.adapter, commentAdapter: comment.adapter }
      });

      expect(result.affiliate_url_gate_ready).toBe(true);
      expect(result.affiliate_url_blocker).toBeNull();
      expect(result.videos_insert_total_count).toBe(3);
      expect(result.comment_create_total_count).toBe(3);
      expect(comment.calls.map((call) => [call.channelKey, call.affiliateUrl])).toEqual([
        ["father_jobs", VALID_AFFILIATE_URLS.father_jobs],
        ["neoman_moleulgeol", VALID_AFFILIATE_URLS.neoman_moleulgeol],
        ["lets_buy", VALID_AFFILIATE_URLS.lets_buy]
      ]);
      expect(comment.calls.every((call) => call.commentTextWithAffiliateUrl.includes(call.affiliateUrl))).toBe(true);
      expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("validation report is sanitized and never serializes raw affiliate URLs", () => {
    const report = validateV057AffiliateUrlsForExecution({
      affiliateUrls: VALID_AFFILIATE_URLS,
      strictCoupangHost: true
    });

    expect(report).toMatchObject({
      affiliate_url_gate_ready: true,
      affiliate_url_blocker: null,
      raw_urls_printed: false,
      secrets_printed: false
    });
    expect(report.channels.map((channel) => channel.host)).toEqual([
      "link.coupang.com",
      "link.coupang.com",
      "link.coupang.com"
    ]);
    expect(JSON.stringify(report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });
});
