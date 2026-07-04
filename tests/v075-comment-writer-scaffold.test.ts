import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import type { ChannelKey } from "../src/uploads/multi-channel/channelProfiles";
import type { V073UploadPackage } from "../src/uploads/multi-channel/v073UploadPackage";
import { V057_REUPLOAD_ASSET_PROFILE } from "../src/uploads/multi-channel/v057ReuploadAssetBinding";
import {
  buildV075CommentPackage,
  buildV075CommentPackageSanitizedReport,
  type V075UploadResultEvidence
} from "../src/uploads/youtube/v075CommentPackage";
import {
  buildV075YouTubeCommentRequest,
  buildV075YouTubeCommentRequestSanitizedReport
} from "../src/uploads/youtube/v075CommentRequestBuilder";
import {
  buildV075CommentSafetyGate,
  type V075CommentSafetyGateInput
} from "../src/uploads/youtube/v075CommentSafetyGate";
import {
  BlockedV075CommentWriterAdapter,
  createDefaultV075CommentWriterAdapter,
  DisabledRealV075CommentWriterAdapter,
  MockV075CommentWriterAdapter
} from "../src/uploads/youtube/v075CommentWriterAdapter";
import { executeV075CommentWriterPreflight } from "../src/uploads/youtube/v075CommentWriter";

const RAW_COUPANG_URL = ["https://www.coupang.com", "vp", "products", "875000001"].join("/");
const AFFILIATE_URL = ["https://link.coupang.com", "a", "v075-father"].join("/");
const FULL_CHANNEL_ID = `UC${"C".repeat(22)}`;
const FULL_VIDEO_ID = "dQw4w9WgXcQ";
const COUPANG_DISCLOSURE = "이 콘텐츠는 쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.";
const FORBIDDEN_REPORT_PATTERN = new RegExp([
  "875000001",
  "www.coupang.com",
  "link.coupang.com",
  FULL_VIDEO_ID,
  FULL_CHANNEL_ID,
  "COUPANG_SECRET_KEY",
  "refresh_token",
  "Authorization",
  "HmacSHA256",
  "signature="
].map(escapeRegExp).join("|"), "i");

describe("v075 comment writer scaffold", () => {
  test("builds a top-level comment request only from a successful public upload result", () => {
    const uploadPackage = makeUploadPackage();
    const uploadResult = makeUploadResult();
    const commentPackage = buildV075CommentPackage({ uploadPackage, uploadResult });
    const request = buildV075YouTubeCommentRequest(commentPackage);
    const packageReport = buildV075CommentPackageSanitizedReport(commentPackage);
    const requestReport = buildV075YouTubeCommentRequestSanitizedReport(request);

    expect(commentPackage.uploadPackageId).toBe(uploadPackage.packageId);
    expect(commentPackage.channelKey).toBe("father_jobs");
    expect(commentPackage.youtubeVideoId).toBe(FULL_VIDEO_ID);
    expect(commentPackage.youtubeVideoIdHash).toBeTruthy();
    expect(commentPackage.affiliateUrl).toBe(AFFILIATE_URL);
    expect(commentPackage.affiliateUrlHash).toBeTruthy();
    expect(commentPackage.commentText).toContain(AFFILIATE_URL);
    expect(commentPackage.commentText).toContain("쿠팡파트너스");
    expect(commentPackage.coupangDisclosurePresent).toBe(true);
    expect(commentPackage.affiliateUrlPresent).toBe(true);
    expect(commentPackage.uploadResultStatus).toBe("uploaded_public");
    expect(commentPackage.uploadVisibility).toBe("public");
    expect(commentPackage.targetChannelVerified).toBe(true);
    expect(commentPackage.commentWriteAllowed).toBe(false);
    expect(request.videoId).toBe(FULL_VIDEO_ID);
    expect(request.textOriginal).toContain(AFFILIATE_URL);
    expect(request.disclosurePresent).toBe(true);
    expect(request.affiliateUrlPresent).toBe(true);
    expect(request.commentCreateCalled).toBe(false);
    expect(packageReport.safeToUpload).toBe(false);
    expect(requestReport.commentCreateCalled).toBe(false);
    expect(JSON.stringify(packageReport)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    expect(JSON.stringify(requestReport)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("blocks missing upload result, video id, public visibility, affiliate URL, disclosure, and comment readiness", () => {
    const cases: Array<{
      name: string;
      patch: Partial<V075CommentSafetyGateInput>;
      blocker: ReturnType<typeof buildV075CommentSafetyGate>["blocker"];
    }> = [
      {
        name: "upload result missing",
        patch: { uploadResultPresent: false },
        blocker: "BLOCKED_V075_UPLOAD_RESULT_MISSING"
      },
      {
        name: "video id missing",
        patch: { youtubeVideoIdPresent: false },
        blocker: "BLOCKED_V075_VIDEO_ID_MISSING"
      },
      {
        name: "upload visibility not public",
        patch: { uploadVisibility: "private" },
        blocker: "BLOCKED_V075_UPLOAD_NOT_PUBLIC"
      },
      {
        name: "upload result not successful",
        patch: { uploadResultStatus: "failed" },
        blocker: "BLOCKED_V075_UPLOAD_RESULT_MISSING"
      },
      {
        name: "affiliate url missing",
        patch: { affiliateUrlReady: false },
        blocker: "BLOCKED_V075_AFFILIATE_URL_MISSING"
      },
      {
        name: "Coupang disclosure missing",
        patch: { coupangDisclosurePresent: false },
        blocker: "BLOCKED_V075_COUPANG_DISCLOSURE_MISSING"
      },
      {
        name: "comment text missing",
        patch: { commentTextReady: false },
        blocker: "BLOCKED_V075_COMMENT_TEXT_MISSING"
      },
      {
        name: "target channel not verified",
        patch: { targetChannelVerified: false },
        blocker: "BLOCKED_V075_TARGET_CHANNEL_NOT_VERIFIED"
      },
      {
        name: "duplicate guard not passed",
        patch: { duplicateGuardPassed: false },
        blocker: "BLOCKED_V075_DUPLICATE_GUARD_NOT_PASSED"
      },
      {
        name: "public upload package not ready",
        patch: { publicUploadPackageReady: false },
        blocker: "BLOCKED_V075_UPLOAD_RESULT_MISSING"
      },
      {
        name: "comment feature disabled",
        patch: { commentFeatureEnabled: false },
        blocker: "BLOCKED_V075_COMMENT_WRITER_DISABLED"
      },
      {
        name: "fresh comment approval missing",
        patch: { freshCommentApprovalPresent: false },
        blocker: "BLOCKED_V075_COMMENT_APPROVAL_MISSING"
      },
      {
        name: "real comment mutation attempted",
        patch: { realCommentMutationAttempted: true },
        blocker: "BLOCKED_V075_REAL_COMMENT_MUTATION_FORBIDDEN"
      },
      {
        name: "real adapter requested",
        patch: { realAdapterRequested: true },
        blocker: "BLOCKED_V075_REAL_ADAPTER_DISABLED"
      }
    ];

    for (const testCase of cases) {
      expect(buildV075CommentSafetyGate({
        ...readyCommentGateInput(),
        ...testCase.patch
      }), testCase.name).toMatchObject({
        ready: false,
        commentWriteAllowed: false,
        safeToUpload: false,
        blocker: testCase.blocker
      });
    }

    expect(buildV075CommentSafetyGate(readyCommentGateInput())).toMatchObject({
      ready: true,
      commentWriteAllowed: true,
      safeToUpload: false,
      blocker: null
    });
  });

  test("keeps blocked, mock, and disabled real adapters free of commentThreads.insert mutation", async () => {
    const request = buildV075YouTubeCommentRequest(buildV075CommentPackage({
      uploadPackage: makeUploadPackage(),
      uploadResult: makeUploadResult()
    }));
    const blockedAdapter = new BlockedV075CommentWriterAdapter();
    const mockAdapter = new MockV075CommentWriterAdapter();
    const realDisabledAdapter = new DisabledRealV075CommentWriterAdapter();
    const defaultAdapter = createDefaultV075CommentWriterAdapter();

    await expect(blockedAdapter.createTopLevelComment(request)).resolves.toMatchObject({
      status: "BLOCKED",
      blocker: "BLOCKED_V075_REAL_COMMENT_MUTATION_FORBIDDEN",
      commentId: null,
      commentCreateCalled: false,
      fakeSuccess: false
    });
    await expect(mockAdapter.createTopLevelComment(request)).resolves.toMatchObject({
      status: "MOCK_ONLY",
      commentId: null,
      commentCreateCalled: false,
      fakeSuccess: false
    });
    await expect(realDisabledAdapter.createTopLevelComment(request)).resolves.toMatchObject({
      status: "BLOCKED",
      blocker: "BLOCKED_V075_REAL_ADAPTER_DISABLED",
      commentId: null,
      commentCreateCalled: false,
      fakeSuccess: false
    });
    expect(defaultAdapter.mode).toBe("blocked");
  });

  test("preflight report is sanitized, fail-closed, and never reports real comment success", async () => {
    const result = await executeV075CommentWriterPreflight({
      uploadPackage: makeUploadPackage(),
      uploadResult: makeUploadResult()
    });
    const reportText = JSON.stringify(result.report);

    expect(result.report.FINAL_STATUS).toBe("BLOCKED_V075_COMMENT_WRITER_NOT_READY");
    expect(result.report.blocker).toBe("BLOCKED_V075_COMMENT_WRITER_DISABLED");
    expect(result.report.SAFE_TO_UPLOAD).toBe(false);
    expect(result.report.safeToUpload).toBe(false);
    expect(result.report.adapterMode).toBe("blocked");
    expect(result.report.commentCreateCalled).toBe(false);
    expect(result.report.commentThreads_insert_called).toBe(false);
    expect(result.report.comment_create_update_delete_called).toBe(false);
    expect(result.report.videos_insert_called).toBe(false);
    expect(result.report.visibility_changed).toBe(false);
    expect(result.report.R2_upload).toBe(false);
    expect(result.report.DB_write).toBe(false);
    expect(result.report.product_assets_write).toBe(false);
    expect(result.report.raw_urls_printed).toBe(false);
    expect(result.report.raw_video_ids_printed).toBe(false);
    expect(result.report.raw_channel_ids_printed).toBe(false);
    expect(result.report.secrets_printed).toBe(false);
    expect(result.report.fake_success).toBe(false);
    expect(reportText).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("even fully ready inputs remain scaffold-only and do not call real comment mutation", async () => {
    const result = await executeV075CommentWriterPreflight({
      uploadPackage: makeUploadPackage(),
      uploadResult: makeUploadResult(),
      safetyOverrides: readyCommentGateInput()
    });

    expect(result.safetyGate.ready).toBe(true);
    expect(result.report.FINAL_STATUS).toBe("BLOCKED_V075_COMMENT_WRITER_SCAFFOLD_ONLY");
    expect(result.report.blocker).toBe("BLOCKED_V075_REAL_ADAPTER_DISABLED");
    expect(result.report.safetyGateReady).toBe(true);
    expect(result.report.commentWriteAllowed).toBe(false);
    expect(result.report.commentCreateCalled).toBe(false);
    expect(result.report.commentThreads_insert_called).toBe(false);
    expect(result.report.fake_success).toBe(false);
    expect(result.report.SAFE_TO_UPLOAD).toBe(false);
  });

  test("preflight blocks missing upload result before any adapter can run", async () => {
    const result = await executeV075CommentWriterPreflight({
      uploadPackage: makeUploadPackage(),
      uploadResult: null,
      safetyOverrides: {
        commentFeatureEnabled: true,
        freshCommentApprovalPresent: true
      }
    });

    expect(result.report.blocker).toBe("BLOCKED_V075_UPLOAD_RESULT_MISSING");
    expect(result.report.videoIdPresent).toBe(false);
    expect(result.report.affiliateUrlPresent).toBe(true);
    expect(result.report.commentCreateCalled).toBe(false);
  });

  test("preflight blocks upload result evidence that belongs to a different package or channel", async () => {
    const packageMismatch = await executeV075CommentWriterPreflight({
      uploadPackage: makeUploadPackage(),
      uploadResult: makeUploadResult({
        uploadPackageId: "pkg-v075-different",
        channelKey: "father_jobs"
      }),
      safetyOverrides: {
        commentFeatureEnabled: true,
        freshCommentApprovalPresent: true
      }
    });
    const channelMismatch = await executeV075CommentWriterPreflight({
      uploadPackage: makeUploadPackage(),
      uploadResult: makeUploadResult({
        uploadPackageId: "pkg-v075-father-jobs",
        channelKey: "lets_buy"
      }),
      safetyOverrides: {
        commentFeatureEnabled: true,
        freshCommentApprovalPresent: true
      }
    });

    for (const result of [packageMismatch, channelMismatch]) {
      expect(result.report.blocker).toBe("BLOCKED_V075_UPLOAD_RESULT_MISSING");
      expect(result.report.videoIdPresent).toBe(false);
      expect(result.report.uploadResultStatus).toBe("missing");
      expect(result.report.commentCreateCalled).toBe(false);
      expect(result.request.videoId).toBeNull();
    }
  });

  test("TASK.md records T005 scaffold work and keeps SAFE_TO_UPLOAD=false", async () => {
    const task = await readFile("TASK.md", "utf8");

    expect(task).toContain("### T005 - V075 Comment Writer");
    expect(task).toMatch(/### T005 - V075 Comment Writer[\s\S]*Status: `(IN_PROGRESS|PR_OPEN)`/);
    expect(task).toContain("`SAFE_TO_UPLOAD=false`");
  });

  test("package.json exposes only a no-mutation v075 preflight script", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["upload:v075:preflight"]).toBe(
      "tsx scripts/uploads/generate-v075-comment-writer-preflight.ts"
    );
    expect(packageJson.scripts["upload:v075:preflight"]).not.toContain("upload:v051:execute");
  });
});

function readyCommentGateInput(): V075CommentSafetyGateInput {
  return {
    uploadResultPresent: true,
    uploadResultStatus: "uploaded_public",
    youtubeVideoIdPresent: true,
    uploadVisibility: "public",
    affiliateUrlReady: true,
    coupangDisclosurePresent: true,
    commentTextReady: true,
    targetChannelVerified: true,
    duplicateGuardPassed: true,
    publicUploadPackageReady: true,
    commentFeatureEnabled: true,
    freshCommentApprovalPresent: true
  };
}

function makeUploadResult(overrides: Partial<V075UploadResultEvidence> = {}): V075UploadResultEvidence {
  return {
    uploadPackageId: "pkg-v075-father-jobs",
    channelKey: "father_jobs",
    youtubeVideoId: FULL_VIDEO_ID,
    youtubeVideoIdHash: "videohash075",
    uploadResultStatus: "uploaded_public",
    uploadVisibility: "public",
    targetChannelVerified: true,
    duplicateGuardPassed: true,
    publicUploadPackageReady: true,
    ...overrides
  };
}

function makeUploadPackage(overrides: Partial<V073UploadPackage> = {}): V073UploadPackage {
  const base: V073UploadPackage = {
    packageId: "pkg-v075-father-jobs",
    queueItemId: "queue-v075-father-jobs",
    generatedContentId: "content-v075-father-jobs",
    channelKey: "father_jobs" satisfies ChannelKey,
    assetProfile: V057_REUPLOAD_ASSET_PROFILE,
    productSource: {
      rawCoupangUrl: RAW_COUPANG_URL,
      productName: "차량용 컵홀더 정리함",
      sourceKind: "product_queue_item_generated_content_pair",
      sourceEvidenceHash: "sourcehash-v075",
      runtimeSourceApproved: true
    },
    deeplink: {
      selectedAffiliateUrl: AFFILIATE_URL,
      source: "deeplink",
      status: "ready",
      sanitizedEvidence: {
        affiliateUrlPresent: true,
        affiliateUrlPrinted: false,
        affiliateHashPrefix: "affhash075"
      }
    },
    videoAsset: {
      path: "commerce-assets/review/v057/father_jobs/corrected-preview-v057.mp4",
      basename: "corrected-preview-v057.mp4",
      hashEvidence: "asset075",
      firstFramePath: "commerce-assets/review/v057/father_jobs/first-frame-v057.jpg",
      firstFrameBasename: "first-frame-v057.jpg",
      firstFrameHashEvidence: "frame075",
      duration: null,
      resolution: null
    },
    youtubeMetadata: {
      title: "실용 체크 - 차량용 컵홀더 정리함 #shorts",
      description: COUPANG_DISCLOSURE,
      tags: ["father_jobs", "coupang", "shorts"],
      categoryId: "26",
      defaultLanguage: "ko",
      defaultAudioLanguage: "ko"
    },
    youtubeAdvancedSettings: {
      privacyStatus: "public",
      selfDeclaredMadeForKids: false,
      containsSyntheticMedia: true,
      paidProductPlacementDetails: {
        hasPaidProductPlacement: true
      },
      license: "youtube",
      embeddable: true,
      publicStatsViewable: true,
      defaultLanguage: "ko",
      defaultAudioLanguage: "ko"
    },
    commentPackage: {
      commentText: `제품 링크는 댓글에서 확인하세요.\n${COUPANG_DISCLOSURE}`,
      affiliateUrlRequiredBeforeExecution: true,
      coupangPartnersDisclosurePresent: true
    },
    targetChannel: {
      channelKey: "father_jobs",
      channelIdHashPrefix: "channelhash",
      formatValid: true,
      rawChannelIdPrinted: false
    },
    duplicateGuard: {
      ready: true,
      duplicateUploadRisk: false,
      signature: "dupsig075"
    },
    quotaGuard: {
      ready: true,
      publicUploadExecutionDisabled: true
    },
    approvalGate: {
      freshApprovalRequired: true,
      approvalPresent: false,
      publicUploadExecutionDisabled: true
    },
    resultStore: {
      status: "placeholder",
      rawUrlsStored: false,
      secretsStored: false
    }
  };

  return {
    ...base,
    ...overrides
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
