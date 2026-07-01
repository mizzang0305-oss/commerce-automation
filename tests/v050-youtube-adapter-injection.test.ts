import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import {
  V049_UPLOAD_APPROVAL_PHRASE
} from "../src/uploads/multi-channel/threeChannelUploadPreflight";
import {
  CONFIRM_V049_PAID_PROMOTION_SETTINGS_CHECKED_FOR_ALL_CHANNELS,
  buildV050AdapterInjectionReadiness,
  checkV050ThreeChannelAdapterInjection,
  createV050NoopCommentAdapter,
  createV050NoopUploadAdapter
} from "../src/uploads/multi-channel/v050ThreeChannelUploadExecutorWiring";
import {
  buildV050ChannelAccountReadiness,
  resolveV050ChannelAccountRoutes
} from "../src/uploads/multi-channel/channelAccountReadinessGate";
import {
  buildV050DuplicateUploadGuard
} from "../src/uploads/multi-channel/threeChannelYouTubeAdapterInjection";
import {
  executeV049ThreeChannelPublicUploads
} from "../src/uploads/multi-channel/threeChannelUploadExecutor";

const APPROVAL_TEXT = `${V049_UPLOAD_APPROVAL_PHRASE}\n${CONFIRM_V049_PAID_PROMOTION_SETTINGS_CHECKED_FOR_ALL_CHANNELS}`;
const AFFILIATE_URLS = {
  father_jobs: "REDACTED_AFFILIATE_URL_FATHER_JOBS",
  neoman_moleulgeol: "REDACTED_AFFILIATE_URL_NEOMAN_MOLEULGEOL",
  lets_buy: "REDACTED_AFFILIATE_URL_LETS_BUY"
} as const;
const SECRET_NEEDLES = /access_token|refresh_token|client_secret|Authorization|Bearer|link\.coupang\.com/i;

async function makeCwd() {
  return mkdtemp(path.join(os.tmpdir(), "commerce-v050-"));
}

async function writeV048Videos(cwd: string) {
  for (const channelKey of Object.keys(AFFILIATE_URLS)) {
    const videoPath = path.join(cwd, "commerce-assets", "review", "v048", channelKey, "local-review-video.mp4");
    await mkdir(path.dirname(videoPath), { recursive: true });
    await writeFile(videoPath, `fake-${channelKey}-video`, "utf8");
  }
}

describe("v050 YouTube adapter injection", () => {
  test("youtube_upload_adapter_injection_tests and youtube_comment_adapter_injection_tests expose explicit no-upload adapters", () => {
    const readiness = buildV050AdapterInjectionReadiness();

    expect(readiness).toMatchObject({
      upload_adapter_injected: true,
      comment_adapter_injected: true,
      token_provider_injected: true,
      channel_account_router_injected: true,
      duplicate_upload_guard_injected: true,
      metadata_gate_injected: true,
      V050_ADAPTERS_READY: true,
      SAFE_TO_UPLOAD: false
    });
    expect(readiness.proven_adapter_discovery).toMatchObject({
      v035_upload_adapter_found: true,
      v035_comment_adapter_found: true,
      token_provider_found: true,
      duplicate_guard_found: true,
      metadata_gate_found: true,
      post_upload_verification_path_found: true,
      discovery_blocker: null
    });
    expect(JSON.stringify(readiness)).not.toMatch(SECRET_NEEDLES);
  });

  test("channel_account_router_tests block single OAuth alias reuse and missing resolved target handles", () => {
    const readyRoutes = resolveV050ChannelAccountRoutes();
    const ready = buildV050ChannelAccountReadiness(readyRoutes);

    expect(ready.CHANNEL_ROUTING_READY).toBe(true);
    expect(ready.channel_routing_blocker).toBeNull();
    expect(ready.father_jobs_target_channel_configured).toBe(true);
    expect(ready.father_jobs_upload_account_matches_target).toBe(true);
    expect(ready.neoman_moleulgeol_target_channel_configured).toBe(true);
    expect(ready.neoman_moleulgeol_upload_account_matches_target).toBe(true);
    expect(ready.lets_buy_target_channel_configured).toBe(true);
    expect(ready.lets_buy_upload_account_matches_target).toBe(true);
    expect(new Set(readyRoutes.map((route) => route.youtube_account_alias)).size).toBe(3);
    expect(JSON.stringify(ready)).not.toMatch(SECRET_NEEDLES);

    const reusedSingleAccount = readyRoutes.map((route) => ({
      ...route,
      youtube_account_alias: "shared_oauth_account"
    }));
    const shared = buildV050ChannelAccountReadiness(reusedSingleAccount);
    expect(shared.CHANNEL_ROUTING_READY).toBe(false);
    expect(shared.channel_routing_blocker).toBe("SINGLE_OAUTH_TOKEN_THREE_CHANNEL_RISK");

    const missingTarget = readyRoutes.map((route) => route.channel_key === "lets_buy"
      ? { ...route, target_channel_id_or_handle: "" }
      : route);
    const missing = buildV050ChannelAccountReadiness(missingTarget);
    expect(missing.CHANNEL_ROUTING_READY).toBe(false);
    expect(missing.channel_routing_blocker).toBe("CHANNEL_TARGET_NOT_CONFIGURED");
  });

  test("duplicate_upload_guard_tests block same asset reuse across channels", () => {
    const guard = buildV050DuplicateUploadGuard([
      { channel_key: "father_jobs", video_path: "father.mp4", video_sha256: "sha-father" },
      { channel_key: "neoman_moleulgeol", video_path: "neoman.mp4", video_sha256: "sha-neoman" },
      { channel_key: "lets_buy", video_path: "letsbuy.mp4", video_sha256: "sha-letsbuy" }
    ]);

    expect(guard.duplicate_upload_risk).toBe(false);
    expect(guard.same_asset_previously_uploaded).toBe(false);
    expect(guard.blocker).toBeNull();

    const duplicate = buildV050DuplicateUploadGuard([
      { channel_key: "father_jobs", video_path: "shared.mp4", video_sha256: "same-sha" },
      { channel_key: "neoman_moleulgeol", video_path: "shared.mp4", video_sha256: "same-sha" },
      { channel_key: "lets_buy", video_path: "letsbuy.mp4", video_sha256: "sha-letsbuy" }
    ]);
    expect(duplicate.duplicate_upload_risk).toBe(true);
    expect(duplicate.blocker).toBe("DUPLICATE_VIDEO_ASSET_REUSE");
  });

  test("three_channel_executor_requires_adapters_tests allow injected noop adapters but never call mutation APIs in check mode", async () => {
    const cwd = await makeCwd();
    try {
      await writeV048Videos(cwd);

      const result = await executeV049ThreeChannelPublicUploads({
        cwd,
        affiliateUrls: AFFILIATE_URLS,
        approvalText: APPROVAL_TEXT,
        executionMode: "check_only",
        deps: {
          uploadVideo: createV050NoopUploadAdapter(),
          createTopLevelComment: createV050NoopCommentAdapter()
        }
      });

      expect(result.FINAL_STATUS).toBe("V049_UPLOAD_PREFLIGHT_READY_NO_UPLOAD");
      expect(result.blocker).toBe("CHECK_ONLY_NO_UPLOAD");
      expect(result.upload_execution_attempted).toBe(false);
      expect(result.videos_insert_called).toBe(false);
      expect(result.videos_insert_total_count).toBe(0);
      expect(result.comment_create_update_delete_called).toBe(false);
      expect(result.retry_loop_after_external_call).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(SECRET_NEEDLES);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("no_videos_insert_without_execute_approval_tests and comment_create_requires_upload_success_tests remain fail-closed", async () => {
    const cwd = await makeCwd();
    try {
      await writeV048Videos(cwd);

      const missingApproval = await executeV049ThreeChannelPublicUploads({
        cwd,
        affiliateUrls: AFFILIATE_URLS,
        approvalText: "APPROVE_BUILD_V050_YOUTUBE_ADAPTER_INJECTION_NO_UPLOAD",
        executionMode: "check_only",
        deps: {
          uploadVideo: createV050NoopUploadAdapter(),
          createTopLevelComment: createV050NoopCommentAdapter()
        }
      });

      expect(missingApproval.blocker).toBe("FRESH_UPLOAD_APPROVAL_MISSING");
      expect(missingApproval.videos_insert_total_count).toBe(0);
      expect(missingApproval.comment_create_update_delete_called).toBe(false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("sanitized readiness report generation does not write raw affiliate URLs or secrets", async () => {
    const cwd = await makeCwd();
    try {
      await writeV048Videos(cwd);

      const report = await checkV050ThreeChannelAdapterInjection({
        cwd,
        affiliateUrls: AFFILIATE_URLS
      });

      expect(report.FINAL_STATUS).toBe("SUCCESS_V050_YOUTUBE_ADAPTERS_READY_NO_UPLOAD");
      expect(report.V050_ADAPTERS_READY).toBe(true);
      expect(report.CHANNEL_ROUTING_READY).toBe(true);
      expect(report.SAFE_TO_UPLOAD).toBe(false);
      expect(report.youtube_execute_called).toBe(false);
      expect(report.videos_insert_called).toBe(false);
      expect(report.comment_create_update_delete_called).toBe(false);
      expect(report.raw_urls_printed).toBe(false);
      expect(report.secrets_printed).toBe(false);

      const reportPath = path.join(cwd, "commerce-assets", "review", "v050", "youtube-adapter-injection-readiness.json");
      const htmlPath = path.join(cwd, "commerce-assets", "review", "v050", "youtube-adapter-injection-readiness.html");
      await expect(stat(reportPath)).resolves.toBeTruthy();
      await expect(stat(htmlPath)).resolves.toBeTruthy();
      expect(await readFile(reportPath, "utf8")).not.toMatch(SECRET_NEEDLES);
      expect(await readFile(htmlPath, "utf8")).not.toMatch(SECRET_NEEDLES);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
