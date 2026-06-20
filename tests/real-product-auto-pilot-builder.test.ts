import { describe, expect, it, vi } from "vitest";

import {
  buildRealProductAutoPilot,
  REAL_PRODUCT_AUTO_PILOT_SIDE_EFFECTS,
} from "@/lib/uploads/youtube/realProductAutoPilotBuilder";
import type { ProductAsset, ProductCandidate, ProductQueueItem } from "@/types/automation";

type TestRepository = {
  getProductCandidates: () => Promise<ProductCandidate[]>;
  getQueue: () => Promise<ProductQueueItem[]>;
  getProductAssets: () => Promise<ProductAsset[]>;
};

let mockRepository: TestRepository;

vi.mock("@/lib/repositories/automationRepository", () => ({
  getAutomationRepository: () => mockRepository,
}));

const now = "2026-06-14T00:00:00.000Z";

function candidate(overrides: Partial<ProductCandidate> & Record<string, unknown> = {}) {
  return {
    id: "cand-real-001",
    product_name: "접이식 무선 선풍기",
    selected_affiliate_url: "https://link.coupang.com/a/private-real-product",
    raw_coupang_url: "https://www.coupang.com/vp/products/123456789",
    product_score: 84,
    promoted_queue_id: "queue-real-001",
    category_path: "생활가전/선풍기",
    payload: {
      source_keyword: "여름 캠핑 선풍기",
      thumbnail_url: "https://example.com/product.jpg",
    },
    created_at: now,
    ...overrides,
  } as ProductCandidate;
}

function queue(overrides: Partial<ProductQueueItem> & Record<string, unknown> = {}) {
  return {
    id: "queue-real-001",
    product_name: "접이식 무선 선풍기",
    selected_affiliate_url: "https://link.coupang.com/a/private-real-product",
    raw_coupang_url: "https://www.coupang.com/vp/products/123456789",
    thumbnail_url: "https://example.com/product.jpg",
    queue_status: "video_ready",
    video_url: "https://cdn.example.com/video.mp4",
    created_at: now,
    ...overrides,
  } as ProductQueueItem;
}

function videoAsset(overrides: Partial<ProductAsset> & Record<string, unknown> = {}) {
  const defaultMetadata = {
    mime_type: "video/mp4",
    size_bytes: 1234567,
    checksum_sha256: "a".repeat(64),
    voiceover_audio_present: true,
    voiceover_audio_file_present: true,
    video_has_audio_stream: true,
    audio_muxed_into_video: true,
    audio_mime_type: "audio/wav",
    audio_duration_seconds: 24,
    duration_seconds: 25,
    scene_count: 8,
    caption_count: 8,
    static_single_image_only: false,
    hook_title_first_seen_seconds: 0.4,
    hook_title_readability_score: 92,
    hook_title_font_size_large: true,
    hook_title_contrast_pass: true,
    hook_title_background_chip_present: true,
    hook_title_safe_area_pass: true,
    caption_safe_area_pass: true,
    all_text_inside_mobile_safe_area: true,
    no_text_clipped: true,
    max_caption_lines: 2,
    caption_font_size_readable: true,
    caption_contrast_pass: true,
    transition_count: 8,
    visual_motion_score: 90,
    distinct_frame_ratio_pass: true,
    frame_sample_count: 8,
    same_frame_ratio: 0.18,
    static_background_ratio: 0.22,
    product_image_bbox_change_count: 8,
    caption_position_change_count: 6,
    dominant_background_change_count: 8,
    true_scene_change_pass: true,
    scene_manifest_created: true,
    renderer_consumed_scene_manifest: true,
    fallback_to_single_product_image: false,
    use_case_scene_present: true,
    kitchen_context_scene_present: true,
    utensil_usage_simulation_present: true,
    before_after_or_problem_scene_present: true,
    checklist_scene_present: true,
    cta_scene_present: true,
    cta_mentions_description_or_comment: true,
    voiceover_speed_wpm: 190,
    voiceover_speed_multiplier: 1.25,
    voiceover_naturalness_score: 84,
    voiceover_too_robotic: false,
    alternate_voice_used: true,
    max_silence_between_segments_ms: 260,
    audio_video_duration_gap_seconds: 0.5
  };
  const base = {
    id: "asset-video-real-001",
    product_queue_id: "queue-real-001",
    asset_type: "video",
    bucket: "r2-videos",
    storage_key: "videos/real-product.mp4",
    url: "https://cdn.example.com/videos/real-product.mp4?signature=secret-token",
    render_qa_metadata: defaultMetadata,
    created_at: now,
    ...overrides,
  } as ProductAsset;
  return {
    ...base,
    render_qa_metadata: {
      ...defaultMetadata,
      ...(overrides.render_qa_metadata && typeof overrides.render_qa_metadata === "object"
        ? overrides.render_qa_metadata
        : {})
    }
  } as ProductAsset;
}

describe("real product auto pilot builder", () => {
  it("selects the highest scoring real Coupang candidate with a server-accessible mp4 asset", () => {
    const result = buildRealProductAutoPilot({
      mode: "prepare_only",
      candidates: [
        candidate({ id: "cand-lower", promoted_queue_id: "queue-lower", product_score: 40 }),
        candidate({ id: "cand-higher", promoted_queue_id: "queue-higher", product_score: 95 }),
      ],
      queueItems: [
        queue({ id: "queue-lower" }),
        queue({ id: "queue-higher", product_name: "프리미엄 접이식 무선 선풍기" }),
      ],
      productAssets: [
        videoAsset({ id: "asset-lower", product_queue_id: "queue-lower" }),
        videoAsset({ id: "asset-higher", product_queue_id: "queue-higher" }),
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.selected_product?.candidate_id).toBe("cand-higher");
    expect(result.prepared_video_asset_ref?.server_accessible).toBe(true);
    expect(result.package_prepare?.visibility).toBe("private");
    expect(result.package_prepare?.prepared_video_asset_ref_used).toBe(true);
    expect(result.side_effects).toEqual(REAL_PRODUCT_AUTO_PILOT_SIDE_EFFECTS);
  });

  it("excludes smoke, test, garbled, and affiliate-missing candidates", () => {
    const result = buildRealProductAutoPilot({
      candidates: [
        candidate({ id: "cand-smoke", product_name: "candidate-video-smoke test product" }),
        candidate({ id: "cand-garbled", product_name: "??? ?? ??" }),
        candidate({ id: "cand-no-affiliate", selected_affiliate_url: "" }),
      ],
      queueItems: [queue()],
      productAssets: [videoAsset()],
    });

    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("AUTO_REAL_PRODUCT_REQUIRED");
    expect(result.blocked_reasons).toContain("no_valid_real_product_candidate");
    expect(result.side_effects).toEqual(REAL_PRODUCT_AUTO_PILOT_SIDE_EFFECTS);
  });

  it("requires a server-accessible video asset and rejects local runtime paths", () => {
    const result = buildRealProductAutoPilot({
      candidates: [candidate()],
      queueItems: [queue()],
      productAssets: [
        videoAsset({ id: "asset-local", url: "C:\\Users\\LOVE\\commerce-assets\\video.mp4" }),
        videoAsset({ id: "asset-var-task", url: "/var/task/commerce-assets/video.mp4" }),
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("AUTO_VIDEO_ASSET_REQUIRED");
    expect(result.blocked_reasons).toContain("selected_real_product_has_no_server_accessible_video_asset");
  });

  it("blocks when the video asset is not video/mp4 or has no positive size", () => {
    const result = buildRealProductAutoPilot({
      candidates: [candidate()],
      queueItems: [queue()],
      productAssets: [
        videoAsset({
          url: "https://cdn.example.com/videos/real-product.webm",
          render_qa_metadata: { mime_type: "video/webm", size_bytes: 123 },
        }),
        videoAsset({
          id: "asset-empty",
          url: "https://cdn.example.com/videos/empty.mp4",
          render_qa_metadata: { mime_type: "video/mp4", size_bytes: 0 },
        }),
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("AUTO_VIDEO_ASSET_REQUIRED");
  });

  it("accepts signed_url and storage_key prepared asset contracts from asset metadata", () => {
    const signedUrlResult = buildRealProductAutoPilot({
      candidates: [candidate()],
      queueItems: [queue()],
      productAssets: [
        videoAsset({
          url: "",
          render_qa_metadata: {
            signed_url: "https://signed.example.com/videos/real-product.mp4?signature=private",
            mime_type: "video/mp4",
            size_bytes: 1234567,
            expires_at: "2099-01-01T00:00:00.000Z",
          },
        }),
      ],
    });
    const storageKeyResult = buildRealProductAutoPilot({
      candidates: [candidate()],
      queueItems: [queue()],
      productAssets: [
        videoAsset({
          url: "",
          bucket: "r2-videos",
          render_qa_metadata: {
            storage_key: "videos/real-product.mp4",
            mime_type: "video/mp4",
            size_bytes: 1234567,
          },
        }),
      ],
    });

    expect(signedUrlResult.ok).toBe(true);
    expect(signedUrlResult.prepared_video_asset_ref?.signed_url_present).toBe(true);
    expect(JSON.stringify(signedUrlResult)).not.toContain("signature=private");
    expect(storageKeyResult.ok).toBe(true);
    expect(storageKeyResult.prepared_video_asset_ref?.storage_key).toBe("videos/real-product.mp4");
  });

  it("masks signed URL query secrets and never exposes token or authorization material", () => {
    const result = buildRealProductAutoPilot({
      mode: "prepare_only",
      candidates: [
        candidate({
          selected_affiliate_url: "https://link.coupang.com/a/secret-affiliate-token",
        }),
      ],
      queueItems: [queue()],
      productAssets: [videoAsset()],
    });

    const serialized = JSON.stringify(result);
    expect(result.ok).toBe(true);
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("secret-affiliate-token");
    expect(serialized).not.toMatch(/access_token|refresh_token|client_secret|Authorization|Bearer/i);
    expect(result.prepared_video_asset_summary?.url_host).toBe("cdn.example.com");
  });

  it("keeps public upload blocked and performs no execute side effects", () => {
    const result = buildRealProductAutoPilot({
      mode: "prepare_only",
      requested_visibility: "public",
      candidates: [candidate()],
      queueItems: [queue()],
      productAssets: [videoAsset()],
    });

    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("PUBLIC_UPLOAD_BLOCKED");
    expect(result.side_effects.youtube_execute_called).toBe(false);
    expect(result.side_effects.youtube_upload_executed).toBe(false);
    expect(result.side_effects.db_written).toBe(false);
  });

  it("exposes a safe prepare-only API response without executing upload or writes", async () => {
    mockRepository = {
      getProductCandidates: vi.fn(async () => [candidate()]),
      getQueue: vi.fn(async () => [queue()]),
      getProductAssets: vi.fn(async () => [videoAsset()]),
    };
    const { POST } = await import("../app/api/uploads/youtube/real-product-pilot/auto-prepare/route");

    const response = await POST(new Request("http://localhost/api/uploads/youtube/real-product-pilot/auto-prepare", {
      method: "POST",
      body: JSON.stringify({ mode: "prepare_only", visibility: "private" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.package_prepare.ready).toBe(true);
    expect(body.side_effects.youtube_execute_called).toBe(false);
    expect(body.side_effects.youtube_upload_executed).toBe(false);
    expect(body.side_effects.db_written).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/access_token|refresh_token|client_secret|Authorization|Bearer/i);
  });
});
