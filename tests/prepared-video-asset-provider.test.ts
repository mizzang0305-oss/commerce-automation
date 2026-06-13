import { describe, expect, test } from "vitest";
import { POST as postPrepareVideoAsset } from "../app/api/uploads/assets/prepare-video-asset/route";
import {
  buildMockPreparedVideoAssetRef,
  buildPreparedVideoAssetInputFromManualRegistration,
  maskPreparedVideoAssetDisplay,
  validatePreparedVideoAssetRef
} from "@/lib/uploads/assets/preparedVideoAsset";
import { buildYouTubeProductVideoUploadPackage, DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT } from "@/lib/uploads/youtube";

const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();

const validSignedUrlAsset = {
  asset_id: "asset-domain-video-001",
  provider: "signed_url",
  signed_url: "https://assets.example.test/video.mp4?X-Amz-Signature=secret-signature&token=secret-token",
  mime_type: "video/mp4",
  size_bytes: 123456,
  checksum_sha256: "a".repeat(64),
  expires_at: futureExpiry,
  server_accessible: true
};

const validPackageInput = {
  candidate_id: "candidate-domain-video-001",
  product_name: "도메인 준비 상품 영상",
  product_source: "coupang",
  selected_affiliate_url: "https://link.coupang.com/a/domain-video-001",
  visibility: "private",
  title: "[도메인 준비 상품 영상] 실제 구매 전 확인 포인트",
  description: [
    "도메인 준비 상품 영상 private package.",
    `쿠팡파트너스 고지: ${DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT}`,
    "Affiliate link: https://link.coupang.com/a/domain-video-001"
  ].join("\n"),
  disclosure_text: DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT,
  tags: ["coupang", "private upload"],
  made_for_kids: false
};

async function postAsset(body: Record<string, unknown>) {
  return postPrepareVideoAsset(new Request("http://localhost/api/uploads/assets/prepare-video-asset", {
    method: "POST",
    body: JSON.stringify(body)
  }));
}

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("prepared video asset provider flow", () => {
  test("valid signed_url asset ref passes with masked safe display and no side effects", () => {
    const result = validatePreparedVideoAssetRef(validSignedUrlAsset);

    expect(result).toMatchObject({
      ok: true,
      error_code: null,
      blocked_reasons: [],
      asset_ref: {
        asset_id: "asset-domain-video-001",
        provider: "signed_url",
        server_accessible: true,
        mime_type: "video/mp4",
        size_bytes: 123456
      },
      safe_display: {
        signed_url: "https://assets.example.test/video.mp4?[redacted]",
        signed_url_present: true,
        prepared_video_asset_url_present: false,
        storage_key_present: false
      },
      side_effects: {
        external_api_called: false,
        r2_uploaded: false,
        db_written: false,
        queue_created: false,
        worker_job_created: false
      }
    });
    expect(JSON.stringify(result.safe_display)).not.toMatch(/secret-signature|secret-token|access_token|refresh_token|client_secret|Authorization/i);
  });

  test("valid prepared_video_asset_url passes as server-accessible contract", () => {
    const result = validatePreparedVideoAssetRef({
      asset_id: "asset-prepared-url-001",
      provider: "external_https",
      prepared_video_asset_url: "https://assets.example.test/prepared-video.mp4",
      mime_type: "video/mp4",
      size_bytes: 1024,
      server_accessible: true
    });

    expect(result).toMatchObject({
      ok: true,
      asset_ref: {
        asset_id: "asset-prepared-url-001",
        provider: "external_https",
        prepared_video_asset_url: "https://assets.example.test/prepared-video.mp4",
        server_accessible: true
      },
      safe_display: {
        prepared_video_asset_url: "https://assets.example.test/prepared-video.mp4",
        prepared_video_asset_url_present: true
      }
    });
  });

  test("valid storage_key reference passes as R2-ready contract without R2 write", () => {
    const result = validatePreparedVideoAssetRef({
      asset_id: "asset-r2-contract-001",
      provider: "r2",
      storage_key: "youtube/private/asset-r2-contract-001.mp4",
      mime_type: "video/mp4",
      size_bytes: 2048,
      server_accessible: true
    });

    expect(result).toMatchObject({
      ok: true,
      asset_ref: {
        asset_id: "asset-r2-contract-001",
        provider: "r2",
        storage_key: "youtube/private/asset-r2-contract-001.mp4"
      },
      side_effects: {
        r2_uploaded: false,
        external_api_called: false,
        db_written: false
      }
    });
  });

  test.each([
    ["all_server_refs_missing", { ...validSignedUrlAsset, signed_url: "", prepared_video_asset_url: "", storage_key: "" }],
    ["server_accessible_false", { ...validSignedUrlAsset, server_accessible: false }],
    ["windows_local_path", { ...validSignedUrlAsset, signed_url: "C:\\Users\\LOVE\\video.mp4" }],
    ["var_task_runtime_path", { ...validSignedUrlAsset, signed_url: "/var/task/commerce-assets/video.mp4" }],
    ["relative_mp4_path", { ...validSignedUrlAsset, signed_url: "commerce-assets/output/video.mp4" }],
    ["signed_url_expired", { ...validSignedUrlAsset, expires_at: "2000-01-01T00:00:00.000Z" }],
    ["mime_type_invalid", { ...validSignedUrlAsset, mime_type: "image/png" }],
    ["size_bytes_missing", { ...validSignedUrlAsset, size_bytes: null }],
    ["size_bytes_zero", { ...validSignedUrlAsset, size_bytes: 0 }]
  ])("%s blocks domain-ready asset validation", (expectedReason, input) => {
    const result = validatePreparedVideoAssetRef(input);

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      error_code: "PREPARED_VIDEO_ASSET_NOT_READY",
      blocked_reasons: expect.arrayContaining([expectedReason]),
      side_effects: {
        external_api_called: false,
        r2_uploaded: false,
        db_written: false,
        queue_created: false,
        worker_job_created: false
      }
    });
  });

  test("manual registration helper normalizes operator input without exposing signed URL query params", () => {
    const input = buildPreparedVideoAssetInputFromManualRegistration({
      asset_id: "asset-manual-001",
      provider: "manual_signed_url",
      signed_url: validSignedUrlAsset.signed_url,
      mime_type: "video/mp4",
      size_bytes: "4096",
      expires_at: futureExpiry,
      server_accessible: true
    });

    expect(input).toMatchObject({
      asset_id: "asset-manual-001",
      provider: "signed_url",
      size_bytes: 4096,
      server_accessible: true
    });
    expect(maskPreparedVideoAssetDisplay(input)).toMatchObject({
      signed_url: "https://assets.example.test/video.mp4?[redacted]",
      signed_url_present: true
    });
  });

  test("local dev mock provider is explicit and not domain-ready", () => {
    const mockRef = buildMockPreparedVideoAssetRef("asset-mock-001");
    const result = validatePreparedVideoAssetRef(mockRef);

    expect(mockRef).toMatchObject({
      asset_id: "asset-mock-001",
      provider: "local_dev",
      server_accessible: false
    });
    expect(result).toMatchObject({
      ok: false,
      blocked_reasons: expect.arrayContaining(["server_accessible_false"])
    });
  });

  test("prepare-video-asset API returns sanitized contract summary and no side effects", async () => {
    const response = await postAsset(validSignedUrlAsset);
    const payload = await json(response);

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      asset_ref: {
        asset_id: "asset-domain-video-001",
        provider: "signed_url",
        server_accessible: true,
        mime_type: "video/mp4",
        size_bytes: 123456,
        signed_url_present: true,
        prepared_video_asset_url_present: false,
        storage_key_present: false
      },
      side_effects: {
        external_api_called: false,
        r2_uploaded: false,
        db_written: false,
        queue_created: false,
        worker_job_created: false
      }
    });
    expect(JSON.stringify(payload)).not.toMatch(/secret-signature|secret-token|access_token|refresh_token|client_secret|Authorization/i);
  });

  test("prepare-video-asset API blocks local paths without returning fake success", async () => {
    const response = await postAsset({
      ...validSignedUrlAsset,
      signed_url: "C:\\Users\\LOVE\\MyProjects\\commerce-automation\\commerce-assets\\video.mp4"
    });
    const payload = await json(response);

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      ok: false,
      error_code: "PREPARED_VIDEO_ASSET_NOT_READY",
      blocked_reasons: expect.arrayContaining(["windows_local_path"]),
      side_effects: {
        external_api_called: false,
        r2_uploaded: false,
        db_written: false,
        queue_created: false,
        worker_job_created: false
      }
    });
  });

  test("product package accepts valid prepared asset ref and marks local path as not domain-ready", () => {
    const validPackage = buildYouTubeProductVideoUploadPackage({
      ...validPackageInput,
      prepared_video_asset: validSignedUrlAsset
    });
    expect(validPackage.ok).toBe(true);
    if (!validPackage.ok) {
      throw new Error(`expected product package success: ${validPackage.blocked_reasons.join(",")}`);
    }
    expect(validPackage.package.readiness).toMatchObject({
      server_accessible_asset_ready: true,
      domain_ready: true,
      local_dev_path_only: false
    });

    const localOnlyPackage = buildYouTubeProductVideoUploadPackage({
      ...validPackageInput,
      video_path_or_url: "C:\\Users\\LOVE\\video.mp4"
    });
    expect(localOnlyPackage.ok).toBe(false);
    if (localOnlyPackage.ok) {
      throw new Error("expected local path only package to be blocked");
    }
    expect(localOnlyPackage.readiness).toMatchObject({
      domain_ready: false,
      local_dev_path_only: true
    });
  });
});
