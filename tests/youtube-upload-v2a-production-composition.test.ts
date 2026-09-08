import { describe, expect, test } from "vitest";

import { APPROVE_YOUTUBE_PRIVATE_CANARY_UPLOAD } from "../src/uploads/youtube/v2a/privateCanaryCoordinator";
import {
  authorizeV2AReadinessDryRun,
  buildV2APrivateCanaryDryRunRequest
} from "../src/uploads/youtube/v2a/productionComposition";
import { buildV2AUploadPackage } from "../src/uploads/youtube/v2a/uploadPackage";

const CHANNEL_ID = `UC${"A".repeat(22)}`;
const OWNER_ID = "owner-subject-001";

function auth(overrides: Partial<Parameters<typeof authorizeV2AReadinessDryRun>[0]> = {}) {
  return authorizeV2AReadinessDryRun({
    authenticated: true,
    subjectId: OWNER_ID,
    ownerSubjectId: OWNER_ID,
    approvalPhrase: APPROVE_YOUTUBE_PRIVATE_CANARY_UPLOAD,
    mode: "readiness_dry_run",
    visibility: "private",
    maxItems: 1,
    ...overrides
  });
}

describe("YouTube V2-A.1 production composition remains dry-run only", () => {
  test.each([
    ["anonymous", { authenticated: false, subjectId: null }, "ANONYMOUS_REJECTED"],
    ["non-owner", { subjectId: "different-subject" }, "NON_OWNER_REJECTED"],
    ["missing phrase", { approvalPhrase: null }, "EXACT_PHRASE_REQUIRED"],
    ["execute mode", { mode: "execute" as const }, "DRY_RUN_MODE_REQUIRED"],
    ["public", { visibility: "public" as const }, "PRIVATE_VISIBILITY_REQUIRED"],
    ["unlisted", { visibility: "unlisted" as const }, "PRIVATE_VISIBILITY_REQUIRED"],
    ["bulk", { maxItems: 69 }, "SINGLE_ITEM_REQUIRED"]
  ])("rejects %s", (_label, overrides, code) => {
    expect(auth(overrides)).toMatchObject({
      authorized: false,
      code,
      dryRunOnly: true,
      coordinatorInvoked: false,
      approvalPhraseForwarded: false,
      videosInsertCalls: 0,
      resumableSessionCalls: 0,
      mediaUploadBytes: 0,
      platformUploads: 0
    });
  });

  test("authorizes only the owner single-private readiness dry-run without invoking upload", () => {
    expect(auth()).toMatchObject({
      authorized: true,
      code: "ROUTE_AUTHORIZED_READINESS_DRY_RUN",
      coordinatorInvoked: false,
      approvalPhraseForwarded: false,
      videosInsertCalls: 0,
      resumableSessionCalls: 0,
      mediaUploadBytes: 0,
      platformUploads: 0
    });
  });

  test("builds the exact private request with subscriber notification disabled", () => {
    const uploadPackage = buildV2AUploadPackage({
      operationNamespace: "operation-2026-09-09",
      productId: "6989006778",
      affiliateUrl: "https://link.coupang.com/a/example",
      videoPath: "D:\\approved-assets\\product-002\\output.mp4",
      videoSha256: "a".repeat(64),
      videoSizeBytes: 1_024,
      videoMimeType: "video/mp4",
      title: "Exact private canary",
      description: "Exact disclosure and affiliate description",
      tags: ["private-canary"],
      categoryId: "26",
      madeForKids: false,
      containsSyntheticMedia: true,
      notifySubscribers: false,
      visibility: "private",
      targetChannelId: CHANNEL_ID,
      sourceGitSha: "b".repeat(40)
    });

    const request = buildV2APrivateCanaryDryRunRequest(uploadPackage);
    expect(request).toMatchObject({
      method: "POST",
      redirect: "error",
      notifySubscribers: false,
      targetChannelId: CHANNEL_ID,
      authorizationHeaderIncluded: false,
      mediaAttached: false,
      videosInsertCalls: 0,
      resumableSessionCalls: 0,
      mediaUploadBytes: 0,
      platformUploads: 0,
      body: {
        status: {
          privacyStatus: "private",
          selfDeclaredMadeForKids: false,
          containsSyntheticMedia: true
        }
      }
    });
    expect(request.url).toContain("uploadType=resumable");
    expect(request.url).toContain("notifySubscribers=false");
  });
});
