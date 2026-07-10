import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  APPROVE_YOUTUBE_PRIVATE_UPLOAD_PILOT_1_ITEM_NO_COMMENT
} from "../src/uploads/youtube/v081PrivateUploadPilot";
import { bindV099PreparedVideoAssetEvidence } from "../src/uploads/youtube/v099PreparedAssetEvidenceBindingCore";
import {
  APPROVE_V110_R2_PREPARE_V057_FATHER_JOBS_ASSET_ONCE,
  runV110V057PrivateUploadOneShot
} from "../src/uploads/youtube/v110V057PrivateUploadOneShot";

const roots: string[] = [];
const RAW_COUPANG_URL = "https://www.coupang.com/vp/products/v110-hidden";
const RAW_AFFILIATE_URL = "https://link.coupang.com/a/v110-hidden";
const FULL_VIDEO_ID = "v110FULLVIDEO";
const FULL_CHANNEL_ID = `UC${"7".repeat(22)}`;

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("v110 v057 private upload one-shot", () => {
  test("preflight reaches external approval readiness without external calls", async () => {
    const cwd = await fixture();
    const prepareAsset = vi.fn();
    const executePrivateUpload = vi.fn();
    const report = await runV110V057PrivateUploadOneShot({
      cwd,
      env: readyEnv(),
      request: readyRequest(true),
      prepareAsset,
      executePrivateUpload
    });

    expect(report.status).toBe("ready_for_external_approval");
    expect(report.blockers).toEqual([]);
    expect(report.r2ConfigReady).toBe(true);
    expect(report.runtimeContextReady).toBe(true);
    expect(report.r2UploadAttempted).toBe(false);
    expect(report.youtubeExecutionAttempted).toBe(false);
    expect(prepareAsset).not.toHaveBeenCalled();
    expect(executePrivateUpload).not.toHaveBeenCalled();
    expectNoUnsafeSideEffects(report);
  });

  test("execute blocks before external calls without both fresh approvals", async () => {
    const cwd = await fixture();
    const prepareAsset = vi.fn();
    const executePrivateUpload = vi.fn();
    const report = await runV110V057PrivateUploadOneShot({
      cwd,
      mode: "execute",
      env: readyEnv(),
      request: readyRequest(false),
      prepareAsset,
      executePrivateUpload
    });

    expect(report.blockers).toEqual([
      "BLOCKED_V110_FRESH_R2_APPROVAL_REQUIRED",
      "BLOCKED_V110_FRESH_PRIVATE_UPLOAD_APPROVAL_REQUIRED"
    ]);
    expect(prepareAsset).not.toHaveBeenCalled();
    expect(executePrivateUpload).not.toHaveBeenCalled();
    expectNoUnsafeSideEffects(report);
  });

  test("execute prepares one R2 asset and completes exactly one private upload with complete evidence", async () => {
    const cwd = await fixture();
    const prepareAsset = vi.fn(async () => ({
      ok: true as const,
      assetRef: preparedAsset()
    }));
    const executePrivateUpload = vi.fn(async () => ({
      completed: true,
      blockers: [],
      videosInsertCalled: true,
      videosInsertTotalCount: 1 as const,
      commentThreadsInsertCalled: false as const,
      uploadResultEvidencePresent: true,
      youtubeVideoIdHashPrefix: "0123456789",
      channelIdHashPrefix: "9876543210",
      fakeSuccess: false as const
    }));
    const report = await runV110V057PrivateUploadOneShot({
      cwd,
      mode: "execute",
      env: approvedEnv(),
      request: readyRequest(false),
      prepareAsset,
      executePrivateUpload
    });

    expect(report.status).toBe("private_upload_completed");
    expect(report.blockers).toEqual([]);
    expect(report.R2_upload).toBe(true);
    expect(report.videosInsertCalled).toBe(true);
    expect(report.videosInsertTotalCount).toBe(1);
    expect(report.uploadResultEvidencePresent).toBe(true);
    expect(prepareAsset).toHaveBeenCalledTimes(1);
    expect(executePrivateUpload).toHaveBeenCalledTimes(1);
    expect(report.commentThreadsInsertCalled).toBe(false);
    expect(report.fake_success).toBe(false);
    expectRedacted(report);
  });

  test("R2 preparation failure blocks YouTube execution without fake success", async () => {
    const cwd = await fixture();
    const executePrivateUpload = vi.fn();
    const report = await runV110V057PrivateUploadOneShot({
      cwd,
      mode: "execute",
      env: approvedEnv(),
      request: readyRequest(false),
      prepareAsset: async () => ({ ok: false, blocker: "r2_put_failed" }),
      executePrivateUpload
    });

    expect(report.status).toBe("blocked");
    expect(report.blockers).toContain("BLOCKED_V110_R2_PREPARE_FAILED");
    expect(report.r2UploadAttempted).toBe(true);
    expect(report.R2_upload).toBe(false);
    expect(executePrivateUpload).not.toHaveBeenCalled();
    expectNoUnsafeSideEffects(report);
  });

  test("incomplete adapter evidence never reports completion", async () => {
    const cwd = await fixture();
    const report = await runV110V057PrivateUploadOneShot({
      cwd,
      mode: "execute",
      env: approvedEnv(),
      request: readyRequest(false),
      prepareAsset: async () => ({ ok: true, assetRef: preparedAsset() }),
      executePrivateUpload: async () => ({
        completed: true,
        blockers: [],
        videosInsertCalled: true,
        videosInsertTotalCount: 1,
        commentThreadsInsertCalled: false,
        uploadResultEvidencePresent: false,
        youtubeVideoIdHashPrefix: null,
        channelIdHashPrefix: null,
        fakeSuccess: false
      })
    });

    expect(report.status).toBe("blocked");
    expect(report.blockers).toContain("BLOCKED_V110_PRIVATE_UPLOAD_FAILED");
    expect(report.uploadResultEvidencePresent).toBe(false);
    expect(report.fake_success).toBe(false);
    expectRedacted(report);
  });

  test("manifest and runtime context mismatch fails closed", async () => {
    const cwd = await fixture();
    const report = await runV110V057PrivateUploadOneShot({
      cwd,
      env: readyEnv(),
      request: {
        ...readyRequest(true),
        queueItemId: "queue-other"
      }
    });

    expect(report.status).toBe("blocked");
    expect(report.blockers).toContain("BLOCKED_V110_MANIFEST_CONTEXT_MISMATCH");
    expectNoUnsafeSideEffects(report);
  });

  test("stale manifest package id safely rebinds to the current V095 package for the same queue item", async () => {
    const cwd = await fixture();
    const report = await runV110V057PrivateUploadOneShot({
      cwd,
      env: readyEnv(),
      request: {
        ...readyRequest(true),
        uploadPackageId: "pkg-v110-current"
      }
    });

    expect(report.status).toBe("ready_for_external_approval");
    expect(report.manifestQueueItemMatch).toBe(true);
    expect(report.manifestUploadPackageMatch).toBe(false);
    expect(report.uploadPackageReboundToCurrentContext).toBe(true);
    expect(report.manifestContextMatch).toBe(true);
    expectNoUnsafeSideEffects(report);
  });

  test("public, unlisted, comment, scheduler, and incomplete readiness requests remain blocked", async () => {
    const cwd = await fixture();
    for (const request of [
      { ...readyRequest(true), visibility: "public" as const },
      { ...readyRequest(true), visibility: "unlisted" as const },
      { ...readyRequest(true), commentAutomationAllowed: true },
      { ...readyRequest(true), schedulerExecutionAllowed: true },
      { ...readyRequest(true), readiness: { ...readyRequest(true).readiness, tokenProviderReady: false } }
    ]) {
      const report = await runV110V057PrivateUploadOneShot({ cwd, env: readyEnv(), request });
      expect(report.blockers).toContain("BLOCKED_V110_RUNTIME_CONTEXT_NOT_READY");
      expectNoUnsafeSideEffects(report);
    }
  });

  test("R2 prepared evidence is ready only when an HTTPS URL is present", () => {
    expect(bindV099PreparedVideoAssetEvidence({
      preparedVideoAssetRef: preparedAsset()
    }).ready).toBe(true);
    expect(bindV099PreparedVideoAssetEvidence({
      preparedVideoAssetRef: {
        ...preparedAsset(),
        prepared_video_asset_url: null,
        storage_key: "private/v110.mp4"
      }
    }).ready).toBe(false);
  });
});

async function fixture() {
  const cwd = await mkdtemp(path.join(tmpdir(), "v110-"));
  roots.push(cwd);
  const root = path.join(cwd, "commerce-assets", "review", "v057", "father_jobs");
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, "corrected-preview-v057.mp4"), Buffer.from("v110-mp4"));
  await writeFile(path.join(root, "first-frame-v057.jpg"), Buffer.from("v110-frame"));
  await writeFile(path.join(root, "product-source-v057.local.json"), JSON.stringify({
    queueItemId: "queue-v110-father",
    uploadPackageId: "pkg-v110-father",
    channelKey: "father_jobs",
    targetChannelKey: "father_jobs",
    rawCoupangUrl: RAW_COUPANG_URL,
    selectedAffiliateUrl: RAW_AFFILIATE_URL,
    coupangPartnersDisclosureText: "Coupang Partners disclosure"
  }));
  return cwd;
}

function readyEnv(): NodeJS.ProcessEnv {
  return {
    R2_ENDPOINT_URL: "https://r2.example.test",
    R2_ACCESS_KEY_ID: "configured",
    R2_SECRET_ACCESS_KEY: "configured",
    R2_PUBLIC_BASE_URL_RENDERED_VIDEOS: "https://assets.example.test"
  };
}

function approvedEnv(): NodeJS.ProcessEnv {
  return {
    ...readyEnv(),
    V110_R2_PREPARE_APPROVAL: APPROVE_V110_R2_PREPARE_V057_FATHER_JOBS_ASSET_ONCE,
    V084_PRIVATE_UPLOAD_APPROVAL_PHRASE: APPROVE_YOUTUBE_PRIVATE_UPLOAD_PILOT_1_ITEM_NO_COMMENT
  };
}

function readyRequest(dryRun: boolean) {
  return {
    mode: "private_upload_pilot_invocation" as const,
    dryRun,
    serverOnlyContext: true,
    v083AdapterAvailable: true,
    v088ResolverStatus: "bound" as const,
    v087BinderStatus: "ready_for_fresh_approval" as const,
    v085BinderStatus: "ready_for_fresh_approval" as const,
    queueItemId: "queue-v110-father",
    uploadPackageId: "pkg-v110-father",
    channelKey: "father_jobs" as const,
    visibility: "private" as const,
    maxItems: 1,
    approvalPhrase: null,
    commentAutomationAllowed: false,
    schedulerExecutionAllowed: false,
    generatedAt: "2026-07-10T00:00:00.000Z",
    videoAssetHashPrefix: "videoasset",
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

function preparedAsset() {
  return {
    asset_id: "asset-v110",
    storage_key: "real-products/v110.mp4",
    prepared_video_asset_url: "https://assets.example.test/v110.mp4",
    signed_url: null,
    mime_type: "video/mp4" as const,
    size_bytes: 9,
    checksum_sha256: "0123456789abcdef",
    expires_at: null,
    provider: "r2" as const,
    server_accessible: true
  };
}

function expectNoUnsafeSideEffects(report: Awaited<ReturnType<typeof runV110V057PrivateUploadOneShot>>) {
  expect(report.R2_upload).toBe(false);
  expect(report.videosInsertCalled).toBe(false);
  expect(report.videosInsertTotalCount).toBe(0);
  expect(report.commentThreadsInsertCalled).toBe(false);
  expect(report.DB_write).toBe(false);
  expect(report.product_assets_write).toBe(false);
  expect(report.n8nWebhookCalled).toBe(false);
  expect(report.schedulerExecutionCalled).toBe(false);
  expect(report.fake_success).toBe(false);
  expectRedacted(report);
}

function expectRedacted(report: unknown) {
  const serialized = JSON.stringify(report);
  expect(serialized).not.toContain(RAW_COUPANG_URL);
  expect(serialized).not.toContain(RAW_AFFILIATE_URL);
  expect(serialized).not.toContain(FULL_VIDEO_ID);
  expect(serialized).not.toContain(FULL_CHANNEL_ID);
  expect(serialized).not.toMatch(/Authorization|Bearer|client_secret|R2_SECRET_ACCESS_KEY/i);
}
