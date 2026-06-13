import type { PreparedVideoAssetRef } from "@/lib/uploads/youtube/uploadAssetContract";

export function buildMockPreparedVideoAssetRef(assetId = "mock-prepared-video-asset"): PreparedVideoAssetRef {
  return {
    asset_id: assetId,
    provider: "local_dev",
    prepared_video_asset_url: "https://mock.localhost.invalid/prepared-video-asset.mp4",
    mime_type: "video/mp4",
    size_bytes: 1024,
    checksum_sha256: null,
    expires_at: null,
    server_accessible: false
  };
}
