import { describe, expect, it, vi } from "vitest";
import {
  APPROVE_YOUTUBE_PRIVATE_CANARY_UPLOAD,
  executeSingleV2APrivateCanary,
  type V2ACanaryDependencies,
  type V2ACanaryPackage,
  type V2ACanaryRuntimeFlags
} from "../src/uploads/youtube/v2a/privateCanaryCoordinator";
import {
  buildV2AIdempotencyKey,
  buildV2APrivateUploadReceipt,
  type V2AIdempotencyStatus
} from "../src/uploads/youtube/v2a/idempotencyReceipt";
import { createV2AMockUploadAdapter } from "../src/uploads/youtube/v2a/testAdapter";

const uploadPackage: V2ACanaryPackage = {
  operationNamespace: "operation-2026-09-09",
  productId: "product-001",
  videoSha256: "a".repeat(64),
  uploadPackageDigest: "b".repeat(64),
  targetChannelId: `UC${"C".repeat(22)}`,
  sourceGitSha: "c".repeat(40),
  visibility: "private"
};

const disabledFlags: V2ACanaryRuntimeFlags = {
  YOUTUBE_UPLOAD_ENABLED: false,
  YOUTUBE_AUTO_UPLOAD: false,
  YOUTUBE_PUBLIC_UPLOAD_ENABLED: false,
  YOUTUBE_PUBLICATION_ENABLED: false,
  SAFE_TO_UPLOAD: false
};

const explicitCanaryFlags: V2ACanaryRuntimeFlags = {
  ...disabledFlags,
  YOUTUBE_UPLOAD_ENABLED: true,
  SAFE_TO_UPLOAD: true
};

function dependencies(existing: V2AIdempotencyStatus = { status: "none" }): V2ACanaryDependencies {
  return {
    idempotencyStore: {
      lookup: vi.fn(async () => existing),
      reserve: vi.fn(async () => true),
      writeSuccess: vi.fn(async (receipt) => `receipts/${receipt.idempotencyKey}.success.json`),
      markAmbiguous: vi.fn(async (marker) => `receipts/${marker.idempotencyKey}.ambiguous.json`)
    },
    uploadAdapter: {
      uploadPrivate: vi.fn(async () => ({
        state: "uploaded_private" as const,
        adapterVersion: "youtube-v2a-resumable.v1",
        resource: {
          youtubeVideoId: "a1B2c3D4e5F",
          channelId: uploadPackage.targetChannelId,
          privacyStatus: "private" as const,
          title: "상품 001",
          descriptionSha256: "d".repeat(64)
        }
      }))
    },
    readbackVerifier: {
      verify: vi.fn(async () => ({ state: "verified_private" as const }))
    },
    now: vi.fn()
      .mockReturnValueOnce("2026-09-08T10:00:00.000Z")
      .mockReturnValue("2026-09-08T10:01:00.000Z")
  };
}

describe("YouTube Upload V2-A single private canary coordinator", () => {
  it("labels fixture adapters as mock and never as a platform upload", async () => {
    await expect(createV2AMockUploadAdapter().simulate()).resolves.toEqual({
      status: "simulated_private_upload",
      mock: true,
      productionUpload: false,
      youtubeVideoId: null,
      platformUpload: 0
    });
  });

  it("never calls the production adapter without the exact Owner phrase", async () => {
    const deps = dependencies();
    const result = await executeSingleV2APrivateCanary({
      approvalPhrase: undefined,
      readiness: {
        ready: true,
        uploadPackageDigest: uploadPackage.uploadPackageDigest,
        targetChannelId: uploadPackage.targetChannelId
      },
      flags: explicitCanaryFlags,
      uploadPackage,
      dependencies: deps
    });
    expect(result).toMatchObject({ state: "held", executed: false, platformUploads: 0, reasonCode: "OWNER_APPROVAL_REQUIRED" });
    expect(deps.uploadAdapter.uploadPrivate).not.toHaveBeenCalled();
  });

  it("keeps the adapter disabled under the V2-A default flags even when a phrase is present in a test", async () => {
    const deps = dependencies();
    const result = await executeSingleV2APrivateCanary({
      approvalPhrase: APPROVE_YOUTUBE_PRIVATE_CANARY_UPLOAD,
      readiness: { ready: true, uploadPackageDigest: uploadPackage.uploadPackageDigest, targetChannelId: uploadPackage.targetChannelId },
      flags: disabledFlags,
      uploadPackage,
      dependencies: deps
    });
    expect(result).toMatchObject({ state: "held", executed: false, platformUploads: 0, reasonCode: "CANARY_RUNTIME_FLAGS_NOT_EXPLICITLY_ENABLED" });
    expect(deps.uploadAdapter.uploadPrivate).not.toHaveBeenCalled();
  });

  it("prevents a duplicate before any adapter call", async () => {
    const key = buildV2AIdempotencyKey({
      channelId: uploadPackage.targetChannelId,
      videoSha256: uploadPackage.videoSha256,
      productId: uploadPackage.productId,
      operationNamespace: uploadPackage.operationNamespace
    });
    const receipt = buildV2APrivateUploadReceipt({
      operationNamespace: uploadPackage.operationNamespace,
      productId: uploadPackage.productId,
      videoSha256: uploadPackage.videoSha256,
      uploadPackageSha256: uploadPackage.uploadPackageDigest,
      targetChannelId: uploadPackage.targetChannelId,
      youtubeVideoId: "a1B2c3D4e5F",
      privacyStatus: "private",
      createdAt: "2026-09-08T10:00:00.000Z",
      completedAt: "2026-09-08T10:01:00.000Z",
      apiOutcome: "verified_private",
      sourceGitSha: uploadPackage.sourceGitSha,
      adapterVersion: "youtube-v2a-resumable.v1"
    });
    expect(receipt.idempotencyKey).toBe(key);
    const deps = dependencies({ status: "successful", receipt });
    const result = await executeSingleV2APrivateCanary({
      approvalPhrase: APPROVE_YOUTUBE_PRIVATE_CANARY_UPLOAD,
      readiness: { ready: true, uploadPackageDigest: uploadPackage.uploadPackageDigest, targetChannelId: uploadPackage.targetChannelId },
      flags: explicitCanaryFlags,
      uploadPackage,
      dependencies: deps
    });
    expect(result).toMatchObject({ state: "verified_private", executed: false, duplicatePrevented: true, platformUploads: 0 });
    expect(deps.uploadAdapter.uploadPrivate).not.toHaveBeenCalled();
  });

  it("does not reuse a success receipt from a different upload package", async () => {
    const deps = dependencies({
      status: "successful",
      receipt: buildV2APrivateUploadReceipt({
        operationNamespace: uploadPackage.operationNamespace, productId: uploadPackage.productId,
        videoSha256: uploadPackage.videoSha256, uploadPackageSha256: "e".repeat(64),
        targetChannelId: uploadPackage.targetChannelId, youtubeVideoId: "a1B2c3D4e5F",
        privacyStatus: "private", createdAt: "2026-09-08T10:00:00.000Z",
        completedAt: "2026-09-08T10:01:00.000Z", apiOutcome: "verified_private",
        sourceGitSha: uploadPackage.sourceGitSha, adapterVersion: "youtube-v2a-resumable.v1"
      })
    });
    const result = await executeSingleV2APrivateCanary({
      approvalPhrase: APPROVE_YOUTUBE_PRIVATE_CANARY_UPLOAD,
      readiness: { ready: true, uploadPackageDigest: uploadPackage.uploadPackageDigest, targetChannelId: uploadPackage.targetChannelId },
      flags: explicitCanaryFlags, uploadPackage, dependencies: deps
    });
    expect(result).toMatchObject({ state: "ambiguous", reasonCode: "SUCCESS_RECEIPT_PACKAGE_MISMATCH", executed: false });
    expect(deps.uploadAdapter.uploadPrivate).not.toHaveBeenCalled();
  });

  it("writes a sanitized verified-private receipt only after upload and readback", async () => {
    const deps = dependencies();
    const result = await executeSingleV2APrivateCanary({
      approvalPhrase: APPROVE_YOUTUBE_PRIVATE_CANARY_UPLOAD,
      readiness: { ready: true, uploadPackageDigest: uploadPackage.uploadPackageDigest, targetChannelId: uploadPackage.targetChannelId },
      flags: explicitCanaryFlags,
      uploadPackage,
      dependencies: deps
    });
    expect(result).toMatchObject({
      state: "verified_private",
      executed: true,
      uploadCalls: 1,
      platformUploads: 1,
      reasonCode: "PRIVATE_UPLOAD_VERIFIED"
    });
    expect(deps.uploadAdapter.uploadPrivate).toHaveBeenCalledTimes(1);
    expect(deps.readbackVerifier.verify).toHaveBeenCalledTimes(1);
    expect(deps.idempotencyStore.writeSuccess).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result.receipt)).not.toMatch(/access_token|refresh_token|client_secret|authorization|upload_id=/i);
  });

  it("marks an uncertain upload ambiguous and never retries by opening a second session", async () => {
    const deps = dependencies();
    deps.uploadAdapter.uploadPrivate = vi.fn(async () => ({
      state: "ambiguous" as const,
      reasonCode: "UPLOAD_OUTCOME_AMBIGUOUS" as const
    }));
    const result = await executeSingleV2APrivateCanary({
      approvalPhrase: APPROVE_YOUTUBE_PRIVATE_CANARY_UPLOAD,
      readiness: { ready: true, uploadPackageDigest: uploadPackage.uploadPackageDigest, targetChannelId: uploadPackage.targetChannelId },
      flags: explicitCanaryFlags,
      uploadPackage,
      dependencies: deps
    });
    expect(result).toMatchObject({ state: "ambiguous", duplicatePrevented: true, uploadCalls: 1, platformUploads: 1 });
    expect(deps.uploadAdapter.uploadPrivate).toHaveBeenCalledTimes(1);
    expect(deps.idempotencyStore.markAmbiguous).toHaveBeenCalledTimes(1);
    expect(deps.readbackVerifier.verify).not.toHaveBeenCalled();
  });

  it("normalizes an adapter exception to a durable ambiguous marker", async () => {
    const deps = dependencies();
    deps.uploadAdapter.uploadPrivate = vi.fn(async () => { throw new Error("transport detail"); });
    const result = await executeSingleV2APrivateCanary({
      approvalPhrase: APPROVE_YOUTUBE_PRIVATE_CANARY_UPLOAD,
      readiness: { ready: true, uploadPackageDigest: uploadPackage.uploadPackageDigest, targetChannelId: uploadPackage.targetChannelId },
      flags: explicitCanaryFlags, uploadPackage, dependencies: deps
    });
    expect(result).toMatchObject({ state: "ambiguous", reasonCode: "UPLOAD_ADAPTER_EXCEPTION", platformUploads: 1 });
    expect(deps.idempotencyStore.markAmbiguous).toHaveBeenCalledTimes(1);
  });
});
