import { describe, expect, test } from "vitest";

import {
  YOUTUBE_UPLOAD_SCOPE,
  YOUTUBE_UPLOAD_V2A_DEFAULT_FLAGS,
  YOUTUBE_UPLOAD_V2A_INTENDED_DAILY_COUNT
} from "../src/uploads/youtube/v2a/constants";
import {
  evaluateV2APrivateCanaryReadiness,
  type V2APrivateCanaryReadinessInput
} from "../src/uploads/youtube/v2a/readiness";
import {
  buildV2AUploadPackage,
  validateV2AUploadPackage,
  V2AUploadPackageError,
  type V2AUploadPackageInput
} from "../src/uploads/youtube/v2a/uploadPackage";

const NOW = "2026-09-08T10:00:00.000Z";
const CHANNEL_ID = `UC${"A".repeat(22)}`;
const OTHER_CHANNEL_ID = `UC${"B".repeat(22)}`;

const packageInput: V2AUploadPackageInput = {
  operationNamespace: "daily69-2026-09-08",
  productId: "product-123",
  affiliateUrl: "https://link.coupang.com/a/product-123",
  videoPath: "D:\\operations\\daily69-2026-09-08\\product-123.mp4",
  videoSha256: "a".repeat(64),
  videoSizeBytes: 1_024_000,
  videoMimeType: "video/mp4",
  title: "상품 123 private canary",
  description: "상품 123 제휴 고지와 정확한 링크를 포함한 설명",
  tags: ["상품123", "private-canary"],
  categoryId: "26",
  madeForKids: false,
  visibility: "private",
  targetChannelId: CHANNEL_ID,
  sourceGitSha: "c".repeat(40)
};

function readyInput(
  overrides: Partial<V2APrivateCanaryReadinessInput> = {}
): V2APrivateCanaryReadinessInput {
  const uploadPackage = buildV2AUploadPackage(packageInput);
  return {
    now: NOW,
    configuredTargetChannelId: CHANNEL_ID,
    authenticatedChannelId: CHANNEL_ID,
    operationSelectedChannelId: CHANNEL_ID,
    auth: {
      authReady: true,
      expiresAt: "2026-09-08T11:00:00.000Z",
      scopes: [YOUTUBE_UPLOAD_SCOPE],
      sanitizedProviderIdentity: "sha256:account-identity",
      expectedAccountChannelRelationship: "owner-channel-binding-observed",
      runtimeEvidence: true
    },
    apiProject: {
      googleCloudProjectId: "commerce-youtube-runtime",
      youtubeDataApiEnabled: true,
      oauthClientConfigured: true,
      consentStatus: "testing",
      auditVerificationStatus: "unverified",
      uploadPrivacyRestrictionStatus: "private_only",
      observedAt: NOW,
      runtimeEvidence: true
    },
    quota: {
      videosInsertLimitUnits: 100,
      videosInsertUsageUnits: 10,
      videosInsertCostUnits: 1,
      intendedCount: YOUTUBE_UPLOAD_V2A_INTENDED_DAILY_COUNT,
      reservedRetryHeadroom: 10,
      capturedAt: NOW,
      source: "sanitized-runtime-quota-readback",
      runtimeEvidence: true
    },
    uploadPackage,
    expectedPackageBindings: packageInput,
    packageApproved: true,
    resumableAdapter: {
      pass: true,
      evidenceId: "resumable-contract-focused-tests",
      runtimeEvidence: true
    },
    idempotency: {
      pass: true,
      evidenceId: "idempotency-receipt-index-check",
      runtimeEvidence: true,
      duplicateSuccessfulReceiptFound: false
    },
    uploadReceiptPathReady: true,
    postUploadReadbackReady: true,
    ...overrides
  };
}

describe("YouTube Upload Automation V2-A package and private-canary readiness", () => {
  test("all upload/publication flags are disabled by default and no upload is executed", () => {
    expect(YOUTUBE_UPLOAD_V2A_DEFAULT_FLAGS).toEqual({
      YOUTUBE_UPLOAD_ENABLED: false,
      YOUTUBE_AUTO_UPLOAD: false,
      YOUTUBE_PUBLIC_UPLOAD_ENABLED: false,
      YOUTUBE_PUBLICATION_ENABLED: false,
      PUBLIC_UPLOAD_ENABLED: false,
      SAFE_TO_UPLOAD: false
    });

    const report = evaluateV2APrivateCanaryReadiness();
    expect(report.ready).toBe(false);
    expect(report.flags).toEqual(YOUTUBE_UPLOAD_V2A_DEFAULT_FLAGS);
    expect(report).toMatchObject({
      PRIVATE_CANARY_EXECUTED: "NO",
      BULK_UPLOAD: 0,
      PUBLIC_UPLOAD: 0,
      PLATFORM_UPLOAD: 0
    });
  });

  test("rejects a configured/authenticated channel mismatch", () => {
    const report = evaluateV2APrivateCanaryReadiness(readyInput({
      authenticatedChannelId: OTHER_CHANNEL_ID
    }));
    expect(report.ready).toBe(false);
    expect(report.TARGET_CHANNEL_BINDING).toBe("BLOCKED");
    expect(report.blockers).toContain("V2A_TARGET_CHANNEL_BINDING_MISMATCH");
  });

  test.each([
    ["missing", null, "V2A_AUTH_MISSING"],
    ["expired", {
      authReady: true,
      expiresAt: "2026-09-08T09:59:59.000Z",
      scopes: [YOUTUBE_UPLOAD_SCOPE],
      sanitizedProviderIdentity: "sha256:account-identity",
      expectedAccountChannelRelationship: "owner-channel-binding-observed",
      runtimeEvidence: true
    }, "V2A_AUTH_EXPIRED_OR_EXPIRY_UNKNOWN"],
    ["insufficient scope", {
      authReady: true,
      expiresAt: "2026-09-08T11:00:00.000Z",
      scopes: ["https://www.googleapis.com/auth/youtube.readonly"],
      sanitizedProviderIdentity: "sha256:account-identity",
      expectedAccountChannelRelationship: "owner-channel-binding-observed",
      runtimeEvidence: true
    }, "V2A_YOUTUBE_UPLOAD_SCOPE_MISSING"]
  ])("rejects %s OAuth evidence", (_label, auth, blocker) => {
    const report = evaluateV2APrivateCanaryReadiness(readyInput({ auth }));
    expect(report.ready).toBe(false);
    expect(report.blockers).toContain(blocker);
  });

  test.each([
    ["video SHA", { videoSha256: "b".repeat(64) }, "V2A_VIDEO_SHA256_MISMATCH"],
    ["product", { productId: "wrong-product" }, "V2A_PRODUCT_ID_MISMATCH"]
  ])("rejects %s evidence mismatch", (_label, patch, blocker) => {
    const uploadPackage = buildV2AUploadPackage(packageInput);
    const validation = validateV2AUploadPackage(uploadPackage, { ...packageInput, ...patch });
    expect(validation.valid).toBe(false);
    expect(validation.blockers).toContain(blocker);

    const report = evaluateV2APrivateCanaryReadiness(readyInput({
      uploadPackage,
      expectedPackageBindings: { ...packageInput, ...patch }
    }));
    expect(report.blockers).toContain("V2A_UPLOAD_PACKAGE_INVALID");
  });

  test.each([
    ["public", "V2A_VISIBILITY_PUBLIC_REJECTED"],
    ["unlisted", "V2A_VISIBILITY_UNLISTED_REJECTED"]
  ] as const)("explicitly rejects %s rather than coercing to private", (visibility, blocker) => {
    expect(() => buildV2AUploadPackage({ ...packageInput, visibility })).toThrowError(V2AUploadPackageError);
    try {
      buildV2AUploadPackage({ ...packageInput, visibility });
    } catch (error) {
      expect(error).toBeInstanceOf(V2AUploadPackageError);
      expect((error as V2AUploadPackageError).blockers).toContain(blocker);
    }
  });

  test("rejects control-character metadata instead of forwarding injectable text", () => {
    expect(() => buildV2AUploadPackage({ ...packageInput, title: "safe\nsecond-line" })).toThrow("V2A_TITLE_INVALID");
    expect(() => buildV2AUploadPackage({ ...packageInput, description: "safe\u0000hidden" })).toThrow("V2A_DESCRIPTION_INVALID");
    expect(() => buildV2AUploadPackage({ ...packageInput, tags: ["safe\runsafe"] })).toThrow("V2A_TAGS_INVALID");
  });

  test("accepts an exact private package deterministically and reports canary ready without upload", () => {
    const first = buildV2AUploadPackage(packageInput);
    const second = buildV2AUploadPackage({ ...packageInput, tags: [...packageInput.tags] });
    expect(first.uploadPackageDigest).toBe(second.uploadPackageDigest);
    expect(validateV2AUploadPackage(first, packageInput)).toMatchObject({ valid: true, blockers: [] });

    const report = evaluateV2APrivateCanaryReadiness(readyInput({ uploadPackage: first }));
    expect(report).toMatchObject({
      FINAL_STATUS: "YOUTUBE_UPLOAD_V2_PRIVATE_CANARY_READY",
      ready: true,
      TARGET_CHANNEL_BINDING: "PASS",
      OAUTH_READINESS: "PASS",
      YOUTUBE_UPLOAD_SCOPE: "PASS",
      API_PROJECT_STATUS: "KNOWN",
      QUOTA_READINESS: "PASS",
      RESUMABLE_UPLOAD_ADAPTER: "PASS",
      IDEMPOTENCY: "PASS",
      PRIVATE_ONLY_GUARD: "PASS",
      PRIVATE_CANARY_EXECUTED: "NO",
      BULK_UPLOAD: 0,
      PUBLIC_UPLOAD: 0,
      PLATFORM_UPLOAD: 0
    });
  });

  test("fails closed when API project and quota evidence is stale", () => {
    const stale = "2026-09-08T09:00:00.000Z";
    const report = evaluateV2APrivateCanaryReadiness(readyInput({
      apiProject: { ...readyInput().apiProject!, observedAt: stale },
      quota: { ...readyInput().quota!, capturedAt: stale }
    }));
    expect(report.ready).toBe(false);
    expect(report.blockers).toEqual(expect.arrayContaining([
      "V2A_API_PROJECT_EVIDENCE_STALE_OR_FUTURE",
      "V2A_QUOTA_EVIDENCE_STALE_OR_FUTURE"
    ]));
  });

  test("rejects insufficient quantitative quota headroom", () => {
    const report = evaluateV2APrivateCanaryReadiness(readyInput({
      quota: {
        videosInsertLimitUnits: 100,
        videosInsertUsageUnits: 30,
        videosInsertCostUnits: 1,
        intendedCount: 69,
        reservedRetryHeadroom: 10,
        capturedAt: NOW,
        source: "sanitized-runtime-quota-readback",
        runtimeEvidence: true
      }
    }));
    expect(report.ready).toBe(false);
    expect(report.QUOTA_READINESS).toBe("BLOCKED");
    expect(report.quota).toMatchObject({ remainingUnits: 70, requiredUnits: 79 });
    expect(report.blockers).toContain("V2A_QUOTA_INSUFFICIENT");
  });

  test("keeps API project readiness unknown without observed runtime status", () => {
    const report = evaluateV2APrivateCanaryReadiness(readyInput({
      apiProject: {
        googleCloudProjectId: "commerce-youtube-runtime",
        youtubeDataApiEnabled: true,
        oauthClientConfigured: true,
        consentStatus: "testing",
        auditVerificationStatus: "unknown",
        uploadPrivacyRestrictionStatus: "unknown",
        observedAt: null,
        runtimeEvidence: false
      }
    }));
    expect(report.ready).toBe(false);
    expect(report.API_PROJECT_STATUS).toBe("UNKNOWN");
    expect(report.blockers).toContain("V2A_API_PROJECT_STATUS_UNKNOWN");
  });
});
