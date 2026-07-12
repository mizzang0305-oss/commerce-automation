import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import { runV110V057PrivateUploadOneShot } from "../src/uploads/youtube/v110V057PrivateUploadOneShot";
import {
  V115_EXPECTED_PRODUCT_REFERENCE,
  V115_EXPECTED_VIDEO_FILE_NAME,
  V115_VIDEO_ASSET_SELECTION,
  evaluateV115ExactV113AssetEvidence
} from "../src/uploads/youtube/v115ExactV113AssetContract";
import {
  V115_SERVER_LOCAL_ASSET_STORAGE_KEY,
  createV115ExactV113ServerLocalVideoAssetReader
} from "../src/uploads/youtube/v115ExactV113ServerLocalPreparedVideoAsset";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("V115 exact V113 product-matched asset binding", () => {
  test("accepts only matching video, first-frame, and sanitized V113 review evidence", () => {
    const expected = {
      videoSizeBytes: 123,
      videoSha256: "a".repeat(64),
      firstFrameSha256: "b".repeat(64)
    };
    const report = evaluateV115ExactV113AssetEvidence({
      videoPresent: true,
      videoSizeBytes: 123,
      videoSha256: "a".repeat(64),
      firstFramePresent: true,
      firstFrameSha256: "b".repeat(64),
      summary: readySummary()
    }, expected);

    expect(report).toMatchObject({
      ready: true,
      blockers: [],
      selectedAssetVersion: "v113",
      selectedVideoFileName: V115_EXPECTED_VIDEO_FILE_NAME,
      productReference: V115_EXPECTED_PRODUCT_REFERENCE,
      exactVideoSizeMatch: true,
      exactVideoHashMatch: true,
      exactFirstFrameHashMatch: true,
      productMatched: true,
      voiceEvidenceReady: true,
      pinnedCommentPackageReady: true,
      ownerSelectedExactAsset: true,
      noV057Fallback: true,
      noV112Fallback: true,
      videosInsertCalled: false,
      commentThreadsInsertCalled: false,
      fake_success: false,
      SAFE_TO_UPLOAD: false,
      SAFE_TO_PUBLIC_UPLOAD: false
    });
    expectRedacted(report);
  });

  test("blocks a different video hash even when all review evidence is ready", () => {
    const report = evaluateV115ExactV113AssetEvidence({
      videoPresent: true,
      videoSizeBytes: 123,
      videoSha256: "c".repeat(64),
      firstFramePresent: true,
      firstFrameSha256: "b".repeat(64),
      summary: readySummary()
    }, {
      videoSizeBytes: 123,
      videoSha256: "a".repeat(64),
      firstFrameSha256: "b".repeat(64)
    });

    expect(report.ready).toBe(false);
    expect(report.blockers).toContain("BLOCKED_V115_EXACT_V113_VIDEO_HASH_MISMATCH");
    expect(report.ownerSelectedExactAsset).toBe(false);
    expectRedacted(report);
  });

  test("blocks product-mismatched or incomplete V113 summary evidence", () => {
    const report = evaluateV115ExactV113AssetEvidence({
      videoPresent: true,
      videoSizeBytes: 123,
      videoSha256: "a".repeat(64),
      firstFramePresent: true,
      firstFrameSha256: "b".repeat(64),
      summary: {
        ...readySummary(),
        productReference: "CURRENT_FRONT_CONSOLE_ORGANIZER"
      }
    }, {
      videoSizeBytes: 123,
      videoSha256: "a".repeat(64),
      firstFrameSha256: "b".repeat(64)
    });

    expect(report.ready).toBe(false);
    expect(report.productMatched).toBe(false);
    expect(report.blockers).toContain("BLOCKED_V115_V113_REVIEW_EVIDENCE_INCOMPLETE");
    expectRedacted(report);
  });

  test("does not fall back to an existing V057 or V112 file when V113 is selected", async () => {
    const cwd = await fallbackFixture();
    const prepareAsset = vi.fn();
    const report = await runV110V057PrivateUploadOneShot({
      cwd,
      mode: "preflight",
      env: {},
      request: readyRequest(),
      assetPreparationStrategy: "server_local_file",
      videoAssetSelection: V115_VIDEO_ASSET_SELECTION,
      prepareAsset
    });

    expect(report.status).toBe("blocked");
    expect(report.videoAssetSelection).toBe(V115_VIDEO_ASSET_SELECTION);
    expect(report.selectedVideoVersion).toBe("v113");
    expect(report.selectedVideoFileName).toBe("preview-v113.mp4");
    expect(report.noV057Fallback).toBe(true);
    expect(report.noV112Fallback).toBe(true);
    expect(report.selectedVideoSha256Prefix).toBeNull();
    expect(report.blockers).toContain("BLOCKED_V115_EXACT_V113_ASSET_EVIDENCE_INCOMPLETE");
    expect(prepareAsset).not.toHaveBeenCalled();
    expectNoMutation(report);
  });

  test("server-only reader rejects arbitrary storage keys before reading a file", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "v115-reader-"));
    roots.push(cwd);
    const reader = createV115ExactV113ServerLocalVideoAssetReader({ cwd });
    const result = await reader({
      asset_id: "asset-v115",
      storage_key: "v114:v057:father_jobs:corrected-preview",
      signed_url: null,
      prepared_video_asset_url: null,
      mime_type: "video/mp4",
      size_bytes: 7_640_938,
      checksum_sha256: "a".repeat(64),
      expires_at: null,
      provider: "server_local_file",
      server_accessible: true
    });

    expect(result).toMatchObject({
      ok: false,
      blocked_reasons: ["server_local_v113_asset_reference_not_allowed"]
    });
    expect(V115_SERVER_LOCAL_ASSET_STORAGE_KEY).not.toContain("v057");
    expectRedacted(result);
  });

  test("CLI requires an explicit exact-V113 flag and keeps the execution command separate", async () => {
    const source = await readFile(
      path.join(process.cwd(), "scripts", "uploads", "run-v110-v057-private-upload-one-shot.ts"),
      "utf8"
    );
    const packageJson = JSON.parse(await readFile(path.join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(source).toContain('process.argv.includes("--exact-v113-asset")');
    expect(source).toContain("prepareV115ExactV113ServerLocalVideoAsset");
    expect(source).toContain("createV115ExactV113ServerLocalVideoAssetReader");
    expect(packageJson.scripts["upload:v115:exact-v113-private-pilot:preflight"]).toContain("--exact-v113-asset");
    expect(packageJson.scripts["upload:v115:exact-v113-private-pilot:preflight"]).not.toContain("--execute");
    expect(packageJson.scripts["upload:v115:exact-v113-private-pilot:execute"]).toContain("--execute");
  });
});

function readySummary() {
  return {
    version: "v113",
    status: "preview_ready_for_owner_review",
    channelKey: "father_jobs",
    productReference: V115_EXPECTED_PRODUCT_REFERENCE,
    scriptProductMatched: true,
    forbiddenMismatchTermsFound: 0,
    pinnedCommentCtaPresent: true,
    pinnedCommentPackage: {
      ready: true,
      affiliateUrlPresent: true,
      disclosurePresent: true,
      linkPresent: true,
      commentMutationAllowed: false,
      rawUrlPrinted: false
    },
    audioReplacedWithProductMatchedVoice: true,
    localCommandVoiceUsed: true,
    paidOrCloudVoiceUsed: false,
    asrProbeExecuted: true,
    transcriptSimilarityScore: 0.966,
    recognizedProductAnchorCount: 7,
    coreAnchorRecognitionPass: true,
    blockers: [],
    uploadExecuteCalled: false,
    videosInsertCalled: false,
    commentThreadsInsertCalled: false,
    visibilityChanged: false,
    fake_success: false,
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false
  };
}

async function fallbackFixture() {
  const cwd = await mkdtemp(path.join(tmpdir(), "v115-fallback-"));
  roots.push(cwd);
  const reviewRoot = path.join(cwd, "commerce-assets", "review");
  const v057Root = path.join(reviewRoot, "v057", "father_jobs");
  const v112Root = path.join(reviewRoot, "v112", "father_jobs");
  await mkdir(v057Root, { recursive: true });
  await mkdir(v112Root, { recursive: true });
  await writeFile(path.join(v057Root, "corrected-preview-v057.mp4"), "stale-v057");
  await writeFile(path.join(v112Root, "preview-v112.mp4"), "stale-v112");
  await writeFile(path.join(v057Root, "product-source-v057.local.json"), JSON.stringify({
    queueItemId: "queue-v115-father",
    uploadPackageId: "pkg-v115-father",
    channelKey: "father_jobs",
    targetChannelKey: "father_jobs",
    rawCoupangUrl: "https://www.coupang.test/product",
    selectedAffiliateUrl: "https://link.coupang.test/a/example",
    coupangPartnersDisclosureText: "Coupang Partners disclosure"
  }));
  return cwd;
}

function readyRequest() {
  return {
    mode: "private_upload_pilot_invocation" as const,
    dryRun: true,
    serverOnlyContext: true,
    v083AdapterAvailable: true,
    v088ResolverStatus: "bound" as const,
    v087BinderStatus: "ready_for_fresh_approval" as const,
    v085BinderStatus: "ready_for_fresh_approval" as const,
    queueItemId: "queue-v115-father",
    uploadPackageId: "pkg-v115-father",
    channelKey: "father_jobs" as const,
    visibility: "private" as const,
    maxItems: 1,
    approvalPhrase: null,
    commentAutomationAllowed: false,
    schedulerExecutionAllowed: false,
    generatedAt: "2026-07-12T00:00:00.000Z",
    videoAssetHashPrefix: "v115asset",
    readiness: {
      v081PilotReady: true,
      v082RuntimeAdapterReady: true,
      tokenProviderReady: true,
      uploadScopeReady: true,
      videoAssetReady: true,
      uploadPackageReady: true,
      duplicateGuardReady: true,
      disclosureGuardReady: true,
      affiliateEvidenceReady: true,
      targetChannelEvidenceReady: true,
      metadataReady: true,
      quotaReady: true
    }
  };
}

function expectNoMutation(report: Record<string, unknown>) {
  expect(report.youtubeExecutionAttempted).toBe(false);
  expect(report.videosInsertCalled).toBe(false);
  expect(report.commentThreadsInsertCalled).toBe(false);
  expect(report.R2_upload).toBe(false);
  expect(report.DB_write).toBe(false);
  expect(report.product_assets_write).toBe(false);
  expect(report.fake_success).toBe(false);
  expectRedacted(report);
}

function expectRedacted(value: unknown) {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toMatch(/rawCoupangUrl|selectedAffiliateUrl|Authorization|Bearer|client_secret/i);
  expect(serialized).not.toMatch(/[A-Za-z]:\\/);
}
