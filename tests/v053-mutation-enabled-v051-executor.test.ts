import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import {
  V049_UPLOAD_APPROVAL_PHRASE
} from "../src/uploads/multi-channel/threeChannelUploadPreflight";
import {
  V049_PAID_PROMOTION_CONFIRMATION_PHRASE
} from "../src/uploads/multi-channel/paidPromotionSettingsGate";
import {
  V051_PAID_PROMOTION_CONFIRMATION_PHRASE,
  V051_UPLOAD_APPROVAL_PHRASE
} from "../src/uploads/multi-channel/v051ApprovalAliasWrapper";
import {
  resolveV051ExecutionMode
} from "../src/uploads/multi-channel/v051ExecutionMode";
import {
  executeV051MutationEnabledUploads,
  type V051MutationCommentAdapter,
  type V051MutationUploadAdapter
} from "../src/uploads/multi-channel/v051MutationEnabledExecutor";

const APPROVAL_TEXT = `${V051_UPLOAD_APPROVAL_PHRASE}\n${V051_PAID_PROMOTION_CONFIRMATION_PHRASE}`;
const STALE_V049_APPROVAL_TEXT = `${V049_UPLOAD_APPROVAL_PHRASE}\n${V049_PAID_PROMOTION_CONFIRMATION_PHRASE}`;
const AFFILIATE_URLS = {
  father_jobs: "https://link.coupang.com/a/v053-father",
  neoman_moleulgeol: "https://link.coupang.com/a/v053-neoman",
  lets_buy: "https://link.coupang.com/a/v053-lets-buy"
} as const;
const SECRET_NEEDLES = /v053-father|v053-neoman|v053-lets-buy|access_token|refresh_token|client_secret|Authorization|Bearer/i;

async function makeCwd() {
  return mkdtemp(path.join(os.tmpdir(), "commerce-v053-"));
}

async function writeV048Videos(cwd: string) {
  for (const channelKey of Object.keys(AFFILIATE_URLS)) {
    const videoPath = path.join(cwd, "commerce-assets", "review", "v048", channelKey, "local-review-video.mp4");
    await mkdir(path.dirname(videoPath), { recursive: true });
    await writeFile(videoPath, `fake-${channelKey}-video`, "utf8");
  }
}

function mockUploadAdapter(input: {
  ambiguousChannel?: string;
  visibility?: "public" | "private" | "unlisted";
} = {}) {
  const calls: Array<Parameters<V051MutationUploadAdapter["uploadPublicShorts"]>[0]> = [];
  const adapter: V051MutationUploadAdapter = {
    async uploadPublicShorts(request) {
      calls.push(request);
      if (input.visibility && input.visibility !== "public") {
        return { videoId: "", ambiguous: false, visibility: input.visibility };
      }
      return {
        videoId: `video-${request.channelKey}`,
        ambiguous: request.channelKey === input.ambiguousChannel,
        visibility: "public"
      };
    }
  };
  return { adapter, calls };
}

function mockCommentAdapter(input: {
  ambiguousVideoId?: string;
} = {}) {
  const calls: Array<Parameters<V051MutationCommentAdapter["createTopLevelComment"]>[0]> = [];
  const adapter: V051MutationCommentAdapter = {
    async createTopLevelComment(request) {
      calls.push(request);
      return {
        commentId: `comment-${request.videoId}`,
        ambiguous: request.videoId === input.ambiguousVideoId
      };
    }
  };
  return { adapter, calls };
}

describe("v053 mutation-enabled v051 executor", () => {
  test("v051_execution_mode_tests default to check_only and parse explicit modes", () => {
    expect(resolveV051ExecutionMode()).toBe("check_only");
    expect(resolveV051ExecutionMode("")).toBe("check_only");
    expect(resolveV051ExecutionMode("check_only")).toBe("check_only");
    expect(resolveV051ExecutionMode("dry_run")).toBe("dry_run");
    expect(resolveV051ExecutionMode("mutation_enabled")).toBe("mutation_enabled");
    expect(resolveV051ExecutionMode("unknown")).toBe("check_only");
  });

  test("v051_check_only_blocks_mutation_tests and v051_dry_run_blocks_mutation_tests never call adapters", async () => {
    const cwd = await makeCwd();
    try {
      await writeV048Videos(cwd);
      const upload = mockUploadAdapter();
      const comment = mockCommentAdapter();

      const checkOnly = await executeV051MutationEnabledUploads({
        cwd,
        executionMode: "check_only",
        approvalText: APPROVAL_TEXT,
        affiliateUrls: AFFILIATE_URLS,
        adapters: { uploadAdapter: upload.adapter, commentAdapter: comment.adapter }
      });
      const dryRun = await executeV051MutationEnabledUploads({
        cwd,
        executionMode: "dry_run",
        approvalText: APPROVAL_TEXT,
        affiliateUrls: AFFILIATE_URLS,
        adapters: { uploadAdapter: upload.adapter, commentAdapter: comment.adapter }
      });

      expect(checkOnly.mutation_blocker).toBe("CHECK_ONLY_NO_UPLOAD");
      expect(dryRun.mutation_blocker).toBe("DRY_RUN_NO_UPLOAD");
      expect(upload.calls).toHaveLength(0);
      expect(comment.calls).toHaveLength(0);
      expect(checkOnly.videos_insert_total_count).toBe(0);
      expect(dryRun.videos_insert_total_count).toBe(0);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("v051_mutation_enabled_requires_fresh_approval_tests and paid promotion confirmation before adapter calls", async () => {
    const cwd = await makeCwd();
    try {
      await writeV048Videos(cwd);
      const upload = mockUploadAdapter();
      const comment = mockCommentAdapter();

      const missingApproval = await executeV051MutationEnabledUploads({
        cwd,
        executionMode: "mutation_enabled",
        approvalText: V051_PAID_PROMOTION_CONFIRMATION_PHRASE,
        affiliateUrls: AFFILIATE_URLS,
        adapters: { uploadAdapter: upload.adapter, commentAdapter: comment.adapter }
      });
      const staleApproval = await executeV051MutationEnabledUploads({
        cwd,
        executionMode: "mutation_enabled",
        approvalText: STALE_V049_APPROVAL_TEXT,
        affiliateUrls: AFFILIATE_URLS,
        adapters: { uploadAdapter: upload.adapter, commentAdapter: comment.adapter }
      });
      const missingPaidPromotion = await executeV051MutationEnabledUploads({
        cwd,
        executionMode: "mutation_enabled",
        approvalText: V051_UPLOAD_APPROVAL_PHRASE,
        affiliateUrls: AFFILIATE_URLS,
        adapters: { uploadAdapter: upload.adapter, commentAdapter: comment.adapter }
      });

      expect(missingApproval.mutation_blocker).toBe("V051_UPLOAD_APPROVAL_MISSING");
      expect(staleApproval.mutation_blocker).toBe("V049_APPROVAL_PHRASE_NOT_ALLOWED_IN_V051");
      expect(missingPaidPromotion.mutation_blocker).toBe("V051_PAID_PROMOTION_CONFIRMATION_MISSING");
      expect(upload.calls).toHaveLength(0);
      expect(comment.calls).toHaveLength(0);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("v051_mutation_enabled_calls_upload_and_comment_adapters_after_all_gates_pass_in_mock_tests", async () => {
    const cwd = await makeCwd();
    try {
      await writeV048Videos(cwd);
      const upload = mockUploadAdapter();
      const comment = mockCommentAdapter();

      const result = await executeV051MutationEnabledUploads({
        cwd,
        executionMode: "mutation_enabled",
        approvalText: APPROVAL_TEXT,
        affiliateUrls: AFFILIATE_URLS,
        adapters: { uploadAdapter: upload.adapter, commentAdapter: comment.adapter }
      });

      expect(result).toMatchObject({
        FINAL_STATUS: "SUCCESS_V053_MUTATION_ENABLED_V051_EXECUTOR_READY_NO_UPLOAD",
        V051_MUTATION_EXECUTOR_READY: true,
        SAFE_TO_UPLOAD: false,
        mutation_mode_requires_fresh_approval: true,
        upload_adapter_callable_in_mutation_mode: true,
        comment_adapter_callable_after_upload_success: true,
        channel_routing_gate_required: true,
        duplicate_upload_guard_required: true,
        paid_promotion_confirmation_required: true,
        videos_insert_total_count: 3,
        comment_create_total_count: 3,
        youtube_execute_called: false,
        videos_insert_called: false,
        comment_create_update_delete_called: false,
        raw_urls_printed: false,
        secrets_printed: false,
        fake_success: false
      });
      expect(upload.calls.map((call) => call.channelKey)).toEqual([
        "father_jobs",
        "neoman_moleulgeol",
        "lets_buy"
      ]);
      expect(comment.calls.map((call) => call.videoId)).toEqual([
        "video-father_jobs",
        "video-neoman_moleulgeol",
        "video-lets_buy"
      ]);
      expect(upload.calls.every((call) => call.visibility === "public")).toBe(true);
      expect(upload.calls.every((call) => call.containsPaidPromotion === true)).toBe(true);
      expect(upload.calls.every((call) => call.madeForKids === false)).toBe(true);
      expect(JSON.stringify(result)).not.toMatch(SECRET_NEEDLES);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("v051_stops_on_first_ambiguous_external_result_tests without retrying later channels", async () => {
    const cwd = await makeCwd();
    try {
      await writeV048Videos(cwd);
      const upload = mockUploadAdapter({ ambiguousChannel: "neoman_moleulgeol" });
      const comment = mockCommentAdapter();

      const result = await executeV051MutationEnabledUploads({
        cwd,
        executionMode: "mutation_enabled",
        approvalText: APPROVAL_TEXT,
        affiliateUrls: AFFILIATE_URLS,
        adapters: { uploadAdapter: upload.adapter, commentAdapter: comment.adapter }
      });

      expect(result.FINAL_STATUS).toBe("BLOCKED_V053_MUTATION_ENABLED_V051_EXECUTOR");
      expect(result.mutation_blocker).toBe("AMBIGUOUS_UPLOAD_RESULT_AFTER_EXTERNAL_CALL");
      expect(result.retry_loop_after_external_call).toBe(false);
      expect(upload.calls.map((call) => call.channelKey)).toEqual(["father_jobs", "neoman_moleulgeol"]);
      expect(comment.calls.map((call) => call.videoId)).toEqual(["video-father_jobs"]);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("v051_rejects_private_or_unlisted_visibility_tests", async () => {
    const cwd = await makeCwd();
    try {
      await writeV048Videos(cwd);
      const upload = mockUploadAdapter({ visibility: "unlisted" });
      const comment = mockCommentAdapter();

      const result = await executeV051MutationEnabledUploads({
        cwd,
        executionMode: "mutation_enabled",
        approvalText: APPROVAL_TEXT,
        affiliateUrls: AFFILIATE_URLS,
        adapters: { uploadAdapter: upload.adapter, commentAdapter: comment.adapter }
      });

      expect(result.FINAL_STATUS).toBe("BLOCKED_V053_MUTATION_ENABLED_V051_EXECUTOR");
      expect(result.mutation_blocker).toBe("NON_PUBLIC_UPLOAD_RESULT_REJECTED");
      expect(comment.calls).toHaveLength(0);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("channel_routing_mismatch_blocks_mutation_tests and duplicate_upload_guard_tests run before adapters", async () => {
    const cwd = await makeCwd();
    try {
      await writeV048Videos(cwd);
      const upload = mockUploadAdapter();
      const comment = mockCommentAdapter();

      const routingBlocked = await executeV051MutationEnabledUploads({
        cwd,
        executionMode: "mutation_enabled",
        approvalText: APPROVAL_TEXT,
        affiliateUrls: AFFILIATE_URLS,
        safetyOverrides: { channelRoutingReady: false },
        adapters: { uploadAdapter: upload.adapter, commentAdapter: comment.adapter }
      });
      const duplicateBlocked = await executeV051MutationEnabledUploads({
        cwd,
        executionMode: "mutation_enabled",
        approvalText: APPROVAL_TEXT,
        affiliateUrls: AFFILIATE_URLS,
        safetyOverrides: { duplicateUploadRisk: true },
        adapters: { uploadAdapter: upload.adapter, commentAdapter: comment.adapter }
      });
      const metadataBlocked = await executeV051MutationEnabledUploads({
        cwd,
        executionMode: "mutation_enabled",
        approvalText: APPROVAL_TEXT,
        affiliateUrls: AFFILIATE_URLS,
        safetyOverrides: { metadataGateReady: false },
        adapters: { uploadAdapter: upload.adapter, commentAdapter: comment.adapter }
      });

      expect(routingBlocked.FINAL_STATUS).toBe("BLOCKED_CHANNEL_ACCOUNT_ROUTING_NOT_READY");
      expect(duplicateBlocked.mutation_blocker).toBe("DUPLICATE_UPLOAD_RISK");
      expect(metadataBlocked.mutation_blocker).toBe("METADATA_GATE_NOT_READY");
      expect(upload.calls).toHaveLength(0);
      expect(comment.calls).toHaveLength(0);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("raw_affiliate_url_redaction_tests keep raw affiliate values out of reports while passing them only to comment adapter", async () => {
    const cwd = await makeCwd();
    try {
      await writeV048Videos(cwd);
      const upload = mockUploadAdapter();
      const comment = mockCommentAdapter();

      const result = await executeV051MutationEnabledUploads({
        cwd,
        executionMode: "mutation_enabled",
        approvalText: APPROVAL_TEXT,
        affiliateUrls: AFFILIATE_URLS,
        adapters: { uploadAdapter: upload.adapter, commentAdapter: comment.adapter }
      });

      expect(comment.calls.some((call) => call.commentTextWithAffiliateUrl.includes(AFFILIATE_URLS.father_jobs))).toBe(true);
      expect(JSON.stringify(result)).not.toMatch(SECRET_NEEDLES);
      for (const call of comment.calls) {
        expect(call.commentTextWithAffiliateUrl).toContain("쿠팡 파트너스");
      }
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
