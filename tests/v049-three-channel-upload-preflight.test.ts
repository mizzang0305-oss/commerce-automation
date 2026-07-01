import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import {
  V049_UPLOAD_APPROVAL_PHRASE,
  buildV049ThreeChannelUploadPreflight
} from "../src/uploads/multi-channel/threeChannelUploadPreflight";
import {
  resolveV049ChannelYouTubeAccountRoutes
} from "../src/uploads/multi-channel/channelYouTubeAccountRouter";
import {
  evaluateV049PaidPromotionGate
} from "../src/uploads/multi-channel/paidPromotionSettingsGate";
import {
  executeV049ThreeChannelPublicUploads
} from "../src/uploads/multi-channel/threeChannelUploadExecutor";

const AFFILIATE_URLS = {
  father_jobs: "https://link.coupang.com/a/v049-father-real-url",
  neoman_moleulgeol: "https://link.coupang.com/a/v049-neoman-real-url",
  lets_buy: "https://link.coupang.com/a/v049-letsbuy-real-url"
} as const;

async function makeCwd() {
  return mkdtemp(path.join(os.tmpdir(), "commerce-v049-"));
}

async function writeV048Videos(cwd: string) {
  for (const channelKey of Object.keys(AFFILIATE_URLS)) {
    const videoPath = path.join(cwd, "commerce-assets", "review", "v048", channelKey, "local-review-video.mp4");
    await mkdir(path.dirname(videoPath), { recursive: true });
    await writeFile(videoPath, `fake-${channelKey}-video`, "utf8");
  }
}

describe("v049 three-channel upload preflight", () => {
  test("three_channel_upload_preflight_tests generate sanitized public upload plan without upload side effects", async () => {
    const cwd = await makeCwd();
    try {
      await writeV048Videos(cwd);

      const result = await buildV049ThreeChannelUploadPreflight({
        cwd,
        affiliateUrls: AFFILIATE_URLS,
        approvalText: "APPROVE_BUILD_V049_THREE_CHANNEL_UPLOAD_PREFLIGHT_NO_UPLOAD"
      });

      expect(result.FINAL_STATUS).toBe("SUCCESS_V049_UPLOAD_PREFLIGHT_READY_NO_UPLOAD");
      expect(result.V049_UPLOAD_PREFLIGHT_READY).toBe(true);
      expect(result.SAFE_TO_UPLOAD).toBe(false);
      expect(result.v048_review_status_all_pass).toBe(true);
      expect(result.upload_approval_present).toBe(false);
      expect(result.all_channel_preflight_pass).toBe(true);
      expect(result.father_jobs_blocker).toBeNull();
      expect(result.neoman_moleulgeol_blocker).toBeNull();
      expect(result.lets_buy_blocker).toBeNull();
      expect(result.duplicate_upload_risk).toBe(false);
      expect(result.upload_plan_generated).toBe(true);
      expect(result.sanitized_upload_requests_generated).toBe(true);
      expect(result.comment_previews_generated).toBe(true);
      expect(result.raw_affiliate_url_printed).toBe(false);
      expect(result.youtube_execute_called).toBe(false);
      expect(result.videos_insert_called).toBe(false);
      expect(result.comment_create_update_delete_called).toBe(false);
      expect(result.visibility_changed_existing_video).toBe(false);

      const serialized = JSON.stringify(result);
      for (const rawUrl of Object.values(AFFILIATE_URLS)) {
        expect(serialized).not.toContain(rawUrl);
      }

      await expect(stat(path.join(cwd, "commerce-assets", "review", "v049", "three-channel-upload-preflight-report.json"))).resolves.toBeTruthy();
      await expect(stat(path.join(cwd, "commerce-assets", "review", "v049", "three-channel-upload-plan.html"))).resolves.toBeTruthy();
      await expect(stat(path.join(cwd, "commerce-assets", "review", "v049", "paid-promotion-settings-checklist.html"))).resolves.toBeTruthy();
      for (const channelKey of Object.keys(AFFILIATE_URLS)) {
        const requestPath = path.join(cwd, "commerce-assets", "review", "v049", channelKey, "sanitized-upload-request.json");
        const commentPath = path.join(cwd, "commerce-assets", "review", "v049", channelKey, "comment-preview.json");
        const request = await readFile(requestPath, "utf8");
        const comment = await readFile(commentPath, "utf8");
        expect(request).toContain("<AFFILIATE_URL_PRESENT>");
        expect(comment).toContain("<AFFILIATE_URL_PRESENT>");
        for (const rawUrl of Object.values(AFFILIATE_URLS)) {
          expect(request).not.toContain(rawUrl);
          expect(comment).not.toContain(rawUrl);
        }
      }
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("channel_account_router_tests report route readiness without reading or printing secrets", () => {
    const routes = resolveV049ChannelYouTubeAccountRoutes();

    expect(routes.every((route) => route.youtube_provider_ready)).toBe(true);
    expect(routes.every((route) => route.token_ready)).toBe(true);
    expect(routes.every((route) => route.scopes_ready)).toBe(true);
    expect(routes.every((route) => route.account_ready)).toBe(true);
    expect(routes.every((route) => route.quota_ready)).toBe(true);
    expect(routes.every((route) => route.policy_ready)).toBe(true);
    expect(JSON.stringify(routes)).not.toContain("access_token");
    expect(JSON.stringify(routes)).not.toContain("refresh_token");
    expect(JSON.stringify(routes)).not.toContain("client_secret");
  });

  test("paid_promotion_settings_gate_tests and manual_paid_promotion_confirmation_tests keep execution blocked until explicit confirmation", () => {
    const missing = evaluateV049PaidPromotionGate({ approvalText: V049_UPLOAD_APPROVAL_PHRASE });
    expect(missing.paid_promotion_required_all).toBe(true);
    expect(missing.paid_promotion_setting_verified).toBe(false);
    expect(missing.manual_paid_promotion_check_required).toBe(true);
    expect(missing.manual_paid_promotion_confirmation_present).toBe(false);
    expect(missing.blocker).toBe("MANUAL_PAID_PROMOTION_CHECK_REQUIRED");

    const confirmed = evaluateV049PaidPromotionGate({
      approvalText: `${V049_UPLOAD_APPROVAL_PHRASE}\nCONFIRM_V049_PAID_PROMOTION_SETTINGS_CHECKED_FOR_ALL_CHANNELS`
    });
    expect(confirmed.paid_promotion_setting_verified).toBe(true);
    expect(confirmed.manual_paid_promotion_check_required).toBe(false);
    expect(confirmed.manual_paid_promotion_confirmation_present).toBe(true);
    expect(confirmed.blocker).toBeNull();
  });

  test("comment_affiliate_link_required_tests and description_points_to_comment_link_tests validate sanitized metadata", async () => {
    const cwd = await makeCwd();
    try {
      await writeV048Videos(cwd);

      const result = await buildV049ThreeChannelUploadPreflight({ cwd, affiliateUrls: AFFILIATE_URLS });

      for (const channel of result.channels) {
        expect(channel.description_points_to_comment_link).toBe(true);
        expect(channel.comment_contains_affiliate_link).toBe(true);
        expect(channel.comment_contains_coupang_disclosure).toBe(true);
        expect(channel.description_metadata_gate.can_pass_metadata_gate).toBe(true);
        expect(channel.title).not.toContain("???");
        expect(channel.description).not.toContain("example.com");
        expect(channel.sanitized_upload_request.selected_affiliate_url).toBe("<AFFILIATE_URL_PRESENT>");
      }
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("three_channel_execute_requires_fresh_approval_tests public_upload_allowed_only_with_approval_tests upload_side_effect_block_tests", async () => {
    const cwd = await makeCwd();
    try {
      await writeV048Videos(cwd);

      const result = await executeV049ThreeChannelPublicUploads({
        cwd,
        affiliateUrls: AFFILIATE_URLS,
        approvalText: "APPROVE_BUILD_V049_THREE_CHANNEL_UPLOAD_PREFLIGHT_NO_UPLOAD"
      });

      expect(result.FINAL_STATUS).toBe("V049_UPLOAD_PREFLIGHT_READY_NO_UPLOAD");
      expect(result.upload_execution_attempted).toBe(false);
      expect(result.videos_insert_called).toBe(false);
      expect(result.videos_insert_total_count).toBe(0);
      expect(result.comment_create_update_delete_called).toBe(false);
      expect(result.father_jobs_uploaded).toBe(false);
      expect(result.neoman_moleulgeol_uploaded).toBe(false);
      expect(result.lets_buy_uploaded).toBe(false);
      expect(result.retry_loop_after_external_call).toBe(false);
      expect(result.blocker).toBe("FRESH_UPLOAD_APPROVAL_MISSING");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
