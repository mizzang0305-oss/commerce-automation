import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import {
  APPROVE_YOUTUBE_PRIVATE_UPLOAD_PILOT_1_ITEM_NO_COMMENT,
  BlockedV081PrivateUploadPilotAdapter,
  MockV081PrivateUploadPilotAdapter,
  buildV081PrivateUploadPilotReadiness,
  executeV081PrivateUploadPilot,
  type V081PrivateUploadPilotBlocker,
  type V081PrivateUploadPilotRequest
} from "../src/uploads/youtube/v081PrivateUploadPilot";

const FULL_VIDEO_ID = "v081FullVideoId";
const FULL_CHANNEL_ID = `UC${"8".repeat(22)}`;
const RAW_AFFILIATE_URL = ["https://link.coupang.com", "a", "v081-hidden"].join("/");
const RAW_COUPANG_URL = ["https://www.coupang.com", "vp", "products", "981000001"].join("/");
const FORBIDDEN_REPORT_PATTERN = new RegExp([
  FULL_VIDEO_ID,
  FULL_CHANNEL_ID,
  RAW_AFFILIATE_URL,
  RAW_COUPANG_URL,
  "COUPANG_SECRET_KEY",
  "refresh_token",
  "Authorization",
  "HmacSHA256",
  "signature="
].map(escapeRegExp).join("|"), "i");

const REQUIRED_READY_BLOCKERS: V081PrivateUploadPilotBlocker[] = [
  "BLOCKED_V081_REAL_ADAPTER_DISABLED"
];

describe("v081 controlled private upload pilot", () => {
  test("blocks when exact owner approval phrase is missing", async () => {
    const result = await executeV081PrivateUploadPilot(makeRequest({
      approvalPhrase: null
    }), { adapter: new MockV081PrivateUploadPilotAdapter() });

    expect(result.status).toBe("blocked");
    expect(result.approvalAccepted).toBe(false);
    expect(result.videosInsertCalled).toBe(false);
    expect(result.blockers).toContain("BLOCKED_V081_PRIVATE_UPLOAD_APPROVAL_MISSING");
  });

  test("blocks when approval phrase is stale or wrong", async () => {
    const result = await executeV081PrivateUploadPilot(makeRequest({
      approvalPhrase: "APPROVE_V051_EXECUTE_THREE_CHANNEL_ONE_SHOT_PUBLIC_UPLOADS_WITH_COMMENTS"
    }), { adapter: new MockV081PrivateUploadPilotAdapter() });

    expect(result.status).toBe("blocked");
    expect(result.approvalAccepted).toBe(false);
    expect(result.videosInsertCalled).toBe(false);
    expect(result.blockers).toContain("BLOCKED_V081_PRIVATE_UPLOAD_APPROVAL_MISSING");
  });

  test.each([
    ["public" as const, "BLOCKED_V081_PUBLIC_UPLOAD_REQUESTED" as const],
    ["unlisted" as const, "BLOCKED_V081_UNLISTED_UPLOAD_REQUESTED" as const]
  ])("blocks %s visibility", async (visibility, blocker) => {
    const result = await executeV081PrivateUploadPilot(makeRequest({ visibility }), {
      adapter: new MockV081PrivateUploadPilotAdapter()
    });

    expect(result.status).toBe("blocked");
    expect(result.visibility).toBe("private");
    expect(result.requestedVisibility).toBe(visibility);
    expect(result.videosInsertCalled).toBe(false);
    expect(result.blockers).toContain(blocker);
  });

  test("blocks maxItems greater than one", async () => {
    const result = await executeV081PrivateUploadPilot(makeRequest({ maxItems: 2 }), {
      adapter: new MockV081PrivateUploadPilotAdapter()
    });

    expect(result.status).toBe("blocked");
    expect(result.maxItems).toBe(1);
    expect(result.requestedMaxItems).toBe(2);
    expect(result.blockers).toContain("BLOCKED_V081_MAX_ITEMS_NOT_ONE");
    expect(result.videosInsertCalled).toBe(false);
  });

  test("blocks comment automation and scheduler execution requests", async () => {
    const result = await executeV081PrivateUploadPilot(makeRequest({
      commentAutomationAllowed: true,
      schedulerExecutionAllowed: true
    }), { adapter: new MockV081PrivateUploadPilotAdapter() });

    expect(result.status).toBe("blocked");
    expect(result.commentAutomationAllowed).toBe(false);
    expect(result.schedulerExecutionAllowed).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      "BLOCKED_V081_COMMENT_AUTOMATION_REQUESTED",
      "BLOCKED_V081_SCHEDULER_EXECUTION_REQUESTED"
    ]));
    expect(result.commentThreadsInsertCalled).toBe(false);
    expect(result.videosInsertCalled).toBe(false);
  });

  test.each([
    ["oauthReady", "BLOCKED_V081_YOUTUBE_OAUTH_NOT_READY" as const],
    ["tokenProviderReady", "BLOCKED_V081_TOKEN_PROVIDER_NOT_READY" as const],
    ["videoAssetReady", "BLOCKED_V081_VIDEO_ASSET_MISSING" as const],
    ["uploadPackageReady", "BLOCKED_V081_UPLOAD_PACKAGE_MISSING" as const],
    ["affiliateUrlEvidenceReady", "BLOCKED_V081_AFFILIATE_URL_EVIDENCE_MISSING" as const],
    ["coupangDisclosureReady", "BLOCKED_V081_COUPANG_DISCLOSURE_EVIDENCE_MISSING" as const],
    ["duplicateGuardReady", "BLOCKED_V081_DUPLICATE_GUARD_MISSING" as const]
  ])("blocks missing %s readiness", async (field, blocker) => {
    const result = await executeV081PrivateUploadPilot(makeRequest({
      readiness: {
        ...makeRequest().readiness,
        [field]: false
      }
    }), { adapter: new MockV081PrivateUploadPilotAdapter() });

    expect(result.status).toBe("blocked");
    expect(result.blockers).toContain(blocker);
    expect(result.videosInsertCalled).toBe(false);
  });

  test("default adapter never calls videos.insert", async () => {
    const result = await executeV081PrivateUploadPilot(makeRequest(), {
      adapter: new BlockedV081PrivateUploadPilotAdapter()
    });

    expect(result.status).toBe("blocked");
    expect(result.blockers).toContain("BLOCKED_V081_REAL_ADAPTER_DISABLED");
    expect(result.videosInsertCalled).toBe(false);
    expect(result.uploadResultEvidence.present).toBe(false);
  });

  test("readiness evaluator reports private upload ready but still requires real adapter", () => {
    const readiness = buildV081PrivateUploadPilotReadiness(makeRequest());

    expect(readiness.status).toBe("private_upload_ready");
    expect(readiness.readyForPrivatePilot).toBe(true);
    expect(readiness.approvalAccepted).toBe(true);
    expect(readiness.blockers).toEqual(REQUIRED_READY_BLOCKERS);
    expect(readiness.safeToPublicUpload).toBe(false);
  });

  test("mock adapter completes only after all approval and readiness gates pass", async () => {
    const result = await executeV081PrivateUploadPilot(makeRequest(), {
      adapter: new MockV081PrivateUploadPilotAdapter({
        youtubeVideoId: FULL_VIDEO_ID,
        channelId: FULL_CHANNEL_ID,
        uploadedAt: "2026-07-05T00:00:00.000Z"
      })
    });

    expect(result.status).toBe("private_upload_completed");
    expect(result.mode).toBe("controlled_private_upload_pilot");
    expect(result.visibility).toBe("private");
    expect(result.safeToPublicUpload).toBe(false);
    expect(result.approvalAccepted).toBe(true);
    expect(result.videosInsertCalled).toBe(true);
    expect(result.videosInsertTotalCount).toBe(1);
    expect(result.commentThreadsInsertCalled).toBe(false);
    expect(result.uploadResultEvidence).toMatchObject({
      present: true,
      rawVideoIdPrinted: false,
      rawChannelIdPrinted: false
    });
    expect(result.uploadResultStoreItem).toMatchObject({
      visibility: "private",
      rawVideoIdStored: false,
      rawChannelIdStored: false,
      rawUrlsStored: false,
      secretsStored: false,
      videos_insert_called: false,
      comment_create_update_delete_called: false,
      visibility_changed: false,
      R2_upload: false,
      DB_write: false,
      product_assets_write: false
    });
    expect(result.uploadResultStoreReport).toMatchObject({
      visibility: "private",
      raw_urls_printed: false,
      raw_video_ids_printed: false,
      raw_channel_ids_printed: false,
      secrets_printed: false,
      fake_success: false
    });
  });

  test("does not expose raw URLs, full IDs, secrets, tokens, or fake success in reports", async () => {
    const result = await executeV081PrivateUploadPilot(makeRequest(), {
      adapter: new MockV081PrivateUploadPilotAdapter({
        youtubeVideoId: FULL_VIDEO_ID,
        channelId: FULL_CHANNEL_ID,
        uploadedAt: "2026-07-05T00:00:00.000Z"
      })
    });
    const serialized = JSON.stringify(result);

    expect(result.redactionProof).toEqual({
      rawUrlsPrinted: false,
      rawVideoIdsPrinted: false,
      rawChannelIdsPrinted: false,
      secretsPrinted: false,
      fakeSuccess: false
    });
    expect(serialized).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("TASK.md records T011 as PR_OPEN and keeps public upload blocked", async () => {
    const task = await readFile("TASK.md", "utf8");

    expect(task).toContain("### T011 - V081 Controlled YouTube Private Upload Pilot");
    expect(task).toMatch(/### T011 - V081 Controlled YouTube Private Upload Pilot[\s\S]*Status: `(IN_PROGRESS|PR_OPEN|DONE)`/);
    expect(task).toContain("PRIVATE_UPLOAD_PILOT_APPROVAL_REQUIRED=true");
    expect(task).toContain("PUBLIC_UPLOAD=BLOCKED");
    expect(task).toContain("COMMENT_AUTOMATION=BLOCKED");
    expect(task).toContain("SCHEDULER_EXECUTION=BLOCKED");
    expect(task).toContain("`SAFE_TO_UPLOAD=false`");
  });
});

function makeRequest(overrides: Partial<V081PrivateUploadPilotRequest> = {}): V081PrivateUploadPilotRequest {
  return {
    queueItemId: "queue-v081-father",
    uploadPackageId: "pkg-v081-father",
    channelKey: "father_jobs",
    visibility: "private",
    approvalPhrase: APPROVE_YOUTUBE_PRIVATE_UPLOAD_PILOT_1_ITEM_NO_COMMENT,
    commentAutomationAllowed: false,
    schedulerExecutionAllowed: false,
    maxItems: 1,
    targetChannelId: FULL_CHANNEL_ID,
    rawCoupangUrl: RAW_COUPANG_URL,
    selectedAffiliateUrl: RAW_AFFILIATE_URL,
    videoAssetHashPrefix: "videoasset",
    generatedAt: "2026-07-05T00:00:00.000Z",
    readiness: {
      oauthReady: true,
      tokenProviderReady: true,
      videoAssetReady: true,
      uploadPackageReady: true,
      affiliateUrlEvidenceReady: true,
      coupangDisclosureReady: true,
      duplicateGuardReady: true,
      targetChannelReady: true,
      metadataReady: true,
      quotaReady: true
    },
    ...overrides
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
