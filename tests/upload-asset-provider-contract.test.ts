import { describe, expect, test } from "vitest";
import {
  DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT,
  buildYouTubeProductVideoUploadPackage
} from "@/lib/uploads/youtube";
import {
  buildPreparedVideoAssetReadiness,
  normalizePreparedVideoAssetRef
} from "@/lib/uploads/youtube/uploadAssetContract";
import { buildYouTubeTokenProviderReadiness } from "@/lib/uploads/youtube/youtubeTokenProviderContract";
import { PASSING_SHORTS_CONTENT_QUALITY } from "./fixtures/youtubeShortsContentQuality";

const serverAccessibleAsset = {
  asset_id: "asset-product-video-001",
  provider: "signed_url",
  signed_url: "https://assets.example.test/product-video-001.mp4",
  prepared_video_asset_url: "https://assets.example.test/product-video-001.mp4",
  mime_type: "video/mp4",
  size_bytes: 1024,
  checksum_sha256: "f".repeat(64),
  server_accessible: true
};

const validPackageInput = {
  candidate_id: "candidate-product-video-001",
  product_name: "Desk organizer",
  product_source: "coupang",
  selected_affiliate_url: "https://link.coupang.com/a/product-video-001",
  visibility: "private",
  title: "Desk organizer private upload package",
  description: [
    "Desk organizer private upload package.",
    `Coupang Partners disclosure: ${DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT}`,
    "Affiliate link: https://link.coupang.com/a/product-video-001"
  ].join("\n"),
  disclosure_text: DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT,
  shorts_content_quality: PASSING_SHORTS_CONTENT_QUALITY,
  tags: ["coupang", "private upload"],
  made_for_kids: false
};

describe("domain-ready upload asset and token provider contracts", () => {
  test("local path only is not a domain-ready upload asset", () => {
    const result = buildYouTubeProductVideoUploadPackage({
      ...validPackageInput,
      video_path_or_url: "C:\\Users\\LOVE\\commerce-assets\\product-video-001.mp4"
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("local path only must not pass domain-ready package prepare");
    }
    expect(result.blocked_reasons).toEqual(expect.arrayContaining(["server_accessible_asset_required"]));
    expect(result.readiness).toMatchObject({
      video_ready: false,
      server_accessible_asset_ready: false,
      domain_ready: false,
      local_dev_path_only: true
    });
    expect(result.side_effects).toMatchObject({
      external_api_called: false,
      youtube_upload_executed: false,
      uploaded: false,
      worker_job_created: false,
      queue_created: false
    });
  });

  test("server-accessible signed URL asset ref passes product package prepare", () => {
    const result = buildYouTubeProductVideoUploadPackage({
      ...validPackageInput,
      prepared_video_asset: serverAccessibleAsset
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(`expected asset ref package prepare to pass: ${result.blocked_reasons.join(",")}`);
    }
    expect(result.package.prepared_video_asset).toMatchObject({
      asset_id: "asset-product-video-001",
      provider: "signed_url",
      mime_type: "video/mp4",
      server_accessible: true
    });
    expect(result.package.readiness).toMatchObject({
      video_ready: true,
      server_accessible_asset_ready: true,
      domain_ready: true,
      local_dev_path_only: false
    });
    expect(JSON.stringify(result.package)).not.toMatch(/access_token|refresh_token|client_secret|Authorization: Bearer/i);
  });

  test("expired signed URL asset ref is blocked", () => {
    const readiness = buildPreparedVideoAssetReadiness({
      prepared_video_asset: {
        ...serverAccessibleAsset,
        expires_at: "2000-01-01T00:00:00.000Z"
      }
    });

    expect(readiness).toMatchObject({
      asset_ready: false,
      server_accessible: true,
      domain_ready: false,
      blocked_reasons: expect.arrayContaining(["upload_asset_expired"])
    });
  });

  test("normalizes server-accessible upload asset references without local paths", () => {
    const normalized = normalizePreparedVideoAssetRef(serverAccessibleAsset);

    expect(normalized).toMatchObject({
      asset_id: "asset-product-video-001",
      provider: "signed_url",
      prepared_video_asset_url: "https://assets.example.test/product-video-001.mp4",
      mime_type: "video/mp4",
      server_accessible: true
    });
  });

  test("token provider readiness is blocker-only and never exposes secret material", () => {
    const readiness = buildYouTubeTokenProviderReadiness({
      YOUTUBE_CLIENT_SECRET: "secret-value",
      YOUTUBE_TOKEN_PROVIDER: "",
      YOUTUBE_TOKEN_READY: "false"
    } as NodeJS.ProcessEnv);

    expect(readiness).toMatchObject({
      provider_configured: false,
      token_ready: false,
      scopes_ready: false,
      blockers: expect.arrayContaining(["provider_not_configured"])
    });
    expect(JSON.stringify(readiness)).not.toMatch(/secret-value|access_token|refresh_token|Authorization: Bearer/i);
  });

  test("configured server token provider returns readiness booleans only", () => {
    const readiness = buildYouTubeTokenProviderReadiness({
      YOUTUBE_TOKEN_PROVIDER: "server",
      YOUTUBE_TOKEN_READY: "true",
      YOUTUBE_SCOPES_READY: "true",
      YOUTUBE_QUOTA_READY: "true",
      YOUTUBE_ACCOUNT_READY: "true",
      YOUTUBE_POLICY_READY: "true",
      YOUTUBE_UPLOAD_ENABLED: "false",
      PUBLIC_UPLOAD_ENABLED: "false",
      YOUTUBE_CLIENT_SECRET: "secret-value"
    } as NodeJS.ProcessEnv);

    expect(readiness).toMatchObject({
      provider_configured: true,
      token_ready: true,
      scopes_ready: true,
      quota_ready: true,
      account_ready: true,
      policy_ready: true,
      blockers: []
    });
    expect(JSON.stringify(readiness)).not.toMatch(/secret-value|access_token|refresh_token|Authorization: Bearer/i);
  });
});
