import { describe, expect, it, vi } from "vitest";

import {
  APPROVE_SINGLE_SERVER_ACCESSIBLE_VIDEO_ASSET_REGISTRATION,
  APPROVE_GENERATE_STORY_VOICEOVER_MP4_AND_UPLOAD_ONE_PRIVATE,
  RUN_REAL_PRODUCT_VIDEO_ASSET_GENERATION,
  buildOneProductVideoAssetEntryPoint,
  ONE_PRODUCT_VIDEO_ASSET_SAFE_SIDE_EFFECTS
} from "@/lib/uploads/youtube/oneProductVideoAssetEntryPoint";
import { createOneProductServerAssetRegistrar } from "@/lib/uploads/videoAssets/oneProductServerAssetRegistration";
import { buildRealProductAutoPilot } from "@/lib/uploads/youtube/realProductAutoPilotBuilder";
import type { ProductAsset, ProductCandidate } from "@/types/automation";

type TestRepository = {
  getProductCandidates: () => Promise<ProductCandidate[]>;
  getProductAssets: () => Promise<ProductAsset[]>;
  upsertProductAsset?: (asset: ProductAsset) => Promise<ProductAsset>;
};

let mockRepository: TestRepository;
const mockLocalVideoGenerator = vi.fn();

vi.mock("@/lib/repositories/automationRepository", () => ({
  getAutomationRepository: () => mockRepository
}));

vi.mock("@/lib/uploads/videoAssets/oneProductLocalVideoGenerator", () => ({
  getOneProductLocalVideoGenerator: () => mockLocalVideoGenerator
}));

const now = "2026-06-15T00:00:00.000Z";

function candidate(overrides: Partial<ProductCandidate> & Record<string, unknown> = {}): ProductCandidate {
  return {
    id: "candidate-real-asset-001",
    product_name: "빌리빈 스테인리스 조리도구 8종 세트",
    raw_coupang_url: "https://www.coupang.com/vp/products/123456789",
    selected_affiliate_url: "https://link.coupang.com/a/private-real-product",
    candidate_score: 91,
    payload: {
      thumbnail_url: "https://example.com/product.jpg",
      image_readiness_status: "ready",
      affiliate_validation_status: "valid"
    },
    created_at: now,
    updated_at: now,
    ...overrides
  };
}

function candidateLinkedVideoAsset(overrides: Partial<ProductAsset> & Record<string, unknown> = {}): ProductAsset {
  return {
    id: "asset-candidate-video-001",
    product_queue_id: null,
    product_candidate_id: "candidate-real-asset-001",
    worker_job_id: "",
    asset_type: "video",
    bucket: "r2-videos",
    url: "https://cdn.example.com/videos/candidate-real-product.mp4?signature=private",
    render_qa_metadata: {
      product_candidate_id: "candidate-real-asset-001",
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
      scene_count: 6,
      caption_count: 6,
      static_single_image_only: false
    },
    created_at: now,
    updated_at: now,
    ...overrides
  };
}

describe("one-product video asset entrypoint", () => {
  beforeEach(() => {
    mockLocalVideoGenerator.mockReset();
  });

  it("blocks missing, smoke, affiliate-missing, and image-not-ready candidates", async () => {
    const missing = await buildOneProductVideoAssetEntryPoint({
      mode: "dry_run",
      candidate_id: "missing",
      candidates: []
    });
    const smoke = await buildOneProductVideoAssetEntryPoint({
      mode: "dry_run",
      candidate_id: "candidate-video-smoke-001",
      candidates: [candidate({ id: "candidate-video-smoke-001", product_name: "youtube private smoke product" })]
    });
    const noAffiliate = await buildOneProductVideoAssetEntryPoint({
      mode: "dry_run",
      candidate_id: "candidate-real-asset-001",
      candidates: [candidate({ selected_affiliate_url: "" })]
    });
    const noImage = await buildOneProductVideoAssetEntryPoint({
      mode: "dry_run",
      candidate_id: "candidate-real-asset-001",
      candidates: [candidate({ payload: { affiliate_validation_status: "valid", image_readiness_status: "missing_image" } })]
    });

    expect(missing.error_code).toBe("REAL_PRODUCT_CANDIDATE_NOT_READY");
    expect(smoke.error_code).toBe("SMOKE_OR_TEST_CANDIDATE_BLOCKED");
    expect(noAffiliate.error_code).toBe("REAL_PRODUCT_AFFILIATE_URL_NOT_READY");
    expect(noImage.error_code).toBe("REAL_PRODUCT_IMAGE_NOT_READY");
    expect(noAffiliate.side_effects).toEqual(ONE_PRODUCT_VIDEO_ASSET_SAFE_SIDE_EFFECTS);
  });

  it("requires exact generation approval before local-only video generation", async () => {
    const result = await buildOneProductVideoAssetEntryPoint({
      mode: "generate_local_only",
      candidate_id: "candidate-real-asset-001",
      candidates: [candidate()]
    });

    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("VIDEO_ASSET_GENERATION_APPROVAL_REQUIRED");
    expect(result.blocked_reasons).toContain("missing_video_asset_generation_approval");
    expect(result.side_effects.video_generated).toBe(false);
    expect(result.side_effects.db_written).toBe(false);
  });

  it("returns a local-only generated asset contract without making it domain ready", async () => {
    const result = await buildOneProductVideoAssetEntryPoint({
      mode: "generate_local_only",
      candidate_id: "candidate-real-asset-001",
      approval: RUN_REAL_PRODUCT_VIDEO_ASSET_GENERATION,
      candidates: [candidate()],
      localVideoGenerator: async (item) => ({
        candidate_id: item.id,
        local_video_path: "C:\\Users\\LOVE\\MyProjects\\commerce-automation\\commerce-assets\\output\\video-packages\\candidate-real-asset-001\\candidate-real-asset-001.mp4",
        mime_type: "video/mp4",
        size_bytes: 4096,
        duration_seconds: 15,
        checksum_sha256: "b".repeat(64),
        black_screen_detected: null,
        generated_this_run: true,
        local_only: true
      })
    });

    expect(result.ok).toBe(true);
    expect(result.generated_video_asset?.local_only).toBe(true);
    expect(result.generated_video_asset?.domain_ready).toBe(false);
    expect(result.prepared_video_asset_ref).toBeNull();
    expect(JSON.stringify(result)).not.toContain("commerce-assets\\output");
    expect(result.side_effects.video_generated).toBe(true);
    expect(result.side_effects.r2_uploaded).toBe(false);
    expect(result.side_effects.db_written).toBe(false);
  });

  it("requires registration approval and rejects local paths as server-accessible assets", async () => {
    const missingApproval = await buildOneProductVideoAssetEntryPoint({
      mode: "register_server_asset",
      candidate_id: "candidate-real-asset-001",
      candidates: [candidate()]
    });
    const localPath = await buildOneProductVideoAssetEntryPoint({
      mode: "register_server_asset",
      candidate_id: "candidate-real-asset-001",
      approval: APPROVE_SINGLE_SERVER_ACCESSIBLE_VIDEO_ASSET_REGISTRATION,
      candidates: [candidate()],
      prepared_video_asset: {
        asset_id: "asset-local",
        provider: "local_dev",
        video_path_or_url: "C:\\Users\\LOVE\\commerce-assets\\video.mp4",
        mime_type: "video/mp4",
        size_bytes: 1234,
        server_accessible: false
      }
    });

    expect(missingApproval.error_code).toBe("VIDEO_ASSET_REGISTRATION_APPROVAL_REQUIRED");
    expect(localPath.ok).toBe(false);
    expect(localPath.error_code).toBe("VIDEO_ASSET_REGISTRATION_NOT_READY");
    expect(localPath.blocked_reasons).toEqual(expect.arrayContaining(["server_accessible_false", "windows_local_path"]));
    expect(localPath.side_effects.youtube_execute_called).toBe(false);
  });

  it("returns a safe server-accessible asset registration contract without exposing raw URLs", async () => {
    const result = await buildOneProductVideoAssetEntryPoint({
      mode: "register_server_asset",
      candidate_id: "candidate-real-asset-001",
      approval: APPROVE_SINGLE_SERVER_ACCESSIBLE_VIDEO_ASSET_REGISTRATION,
      candidates: [candidate()],
      prepared_video_asset: {
        asset_id: "asset-server-001",
        provider: "external_https",
        prepared_video_asset_url: "https://cdn.example.com/videos/real-product.mp4?signature=private-token",
        mime_type: "video/mp4",
        size_bytes: 1234567,
        checksum_sha256: "c".repeat(64),
        server_accessible: true
      }
    });

    const serialized = JSON.stringify(result);
    expect(result.ok).toBe(true);
    expect(result.prepared_video_asset_ref?.asset_id).toBe("asset-server-001");
    expect(result.registration_plan?.product_assets_rows_planned).toBe(1);
    expect(result.registration_plan?.product_candidate_id).toBe("candidate-real-asset-001");
    expect(result.side_effects.product_assets_written).toBe(false);
    expect(result.side_effects.rows_inserted_or_upserted).toBe(0);
    expect(serialized).not.toContain("private-token");
    expect(serialized).not.toContain("https://cdn.example.com/videos/real-product.mp4");
    expect(serialized).toContain("[redacted-url-present]");
    expect(serialized).not.toMatch(/access_token|refresh_token|client_secret|Authorization|Bearer/i);
  });

  it("registers one approved server asset through the route without queue, worker, or YouTube side effects", async () => {
    const upsertProductAsset = vi.fn(async (asset: ProductAsset) => asset);
    mockRepository = {
      getProductCandidates: vi.fn(async () => [candidate()]),
      getProductAssets: vi.fn(async () => []),
      upsertProductAsset
    };
    const { POST } = await import("../app/api/uploads/youtube/real-product-pilot/video-asset/prepare/route");

    const response = await POST(new Request("http://localhost/api/uploads/youtube/real-product-pilot/video-asset/prepare", {
      method: "POST",
      body: JSON.stringify({
        mode: "register_server_asset",
        candidate_id: "candidate-real-asset-001",
        approval: APPROVE_SINGLE_SERVER_ACCESSIBLE_VIDEO_ASSET_REGISTRATION,
        prepared_video_asset: {
          asset_id: "asset-server-route-001",
          provider: "external_https",
          prepared_video_asset_url: "https://cdn.example.com/videos/real-product.mp4?signature=route-private-token",
          mime_type: "video/mp4",
          size_bytes: 1234567,
          checksum_sha256: "e".repeat(64),
          server_accessible: true
        }
      })
    }));
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.registration_plan.write_executed).toBe(true);
    expect(body.side_effects).toMatchObject({
      db_written: true,
      product_assets_written: true,
      rows_inserted_or_upserted: 1,
      queue_created: false,
      worker_job_created: false,
      upload_package_created: false,
      youtube_execute_called: false,
      youtube_upload_executed: false,
      videos_insert_called: false,
      public_upload_enabled: false
    });
    expect(upsertProductAsset).toHaveBeenCalledTimes(1);
    const [asset] = upsertProductAsset.mock.calls[0] as [ProductAsset];
    expect(asset.id).toBe("asset-real-product-candidate-real-asset-001-video");
    expect(asset.product_queue_id).toBeNull();
    expect(asset.product_candidate_id).toBe("candidate-real-asset-001");
    expect(asset).toMatchObject({
      worker_job_id: "",
      asset_type: "video",
      bucket: "external_https"
    });
    expect(asset.render_qa_metadata).toMatchObject({
      product_candidate_id: "candidate-real-asset-001",
      mime_type: "video/mp4",
      server_accessible: true,
      registration_source: "provided_asset_ref"
    });
    expect(serialized).not.toContain("route-private-token");
    expect(serialized).not.toContain("https://cdn.example.com/videos/real-product.mp4");
    expect(serialized).not.toMatch(/access_token|refresh_token|client_secret|Authorization|Bearer/i);
  });

  it("prechecks candidate-only persistence support before attempting R2 upload", async () => {
    const uploadVideo = vi.fn(async () => ({
      ok: true as const,
      asset_ref: {
        asset_id: "asset-should-not-upload",
        provider: "r2" as const,
        storage_key: "real-products/candidate-real-asset-001/video.mp4",
        prepared_video_asset_url: "https://cdn.example.com/videos/should-not-upload.mp4",
        signed_url: null,
        mime_type: "video/mp4" as const,
        size_bytes: 4096,
        checksum_sha256: "f".repeat(64),
        expires_at: null,
        server_accessible: true
      }
    }));
    const upsertProductAsset = vi.fn(async (asset: ProductAsset) => asset);
    const registrar = createOneProductServerAssetRegistrar(
      {
        upsertProductAsset,
        getProductAssetPersistenceCapabilities: vi.fn(async () => ({
          candidate_linked_assets_supported: false,
          product_queue_id_nullable: false,
          product_candidate_id_available: false,
          blocked_reasons: ["product_assets_product_queue_id_required"]
        }))
      },
      {
        stat: vi.fn(async () => ({
          isFile: () => true,
          size: 4096
        })) as never,
        readFile: vi.fn(async () => Buffer.from("video")),
        uploadVideo
      }
    );

    const result = await registrar({ candidate: candidate() });

    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("PRODUCT_ASSETS_SCHEMA_REQUIRES_QUEUE_ID");
    expect(result.blocked_reasons).toContain("product_assets_product_queue_id_required");
    expect(uploadVideo).not.toHaveBeenCalled();
    expect(upsertProductAsset).not.toHaveBeenCalled();
    expect(result.r2_uploaded).toBe(false);
    expect(result.db_written).toBe(false);
  });

  it("writes candidate-linked assets with null queue id when schema supports it", async () => {
    const uploadVideo = vi.fn(async () => ({
      ok: true as const,
      asset_ref: {
        asset_id: "asset-r2-candidate-linked",
        provider: "r2" as const,
        storage_key: "real-products/candidate-real-asset-001/video.mp4",
        prepared_video_asset_url: "https://cdn.example.com/videos/candidate-linked.mp4",
        signed_url: null,
        mime_type: "video/mp4" as const,
        size_bytes: 4096,
        checksum_sha256: "f".repeat(64),
        expires_at: null,
        server_accessible: true
      }
    }));
    const upsertProductAsset = vi.fn(async (asset: ProductAsset) => asset);
    const registrar = createOneProductServerAssetRegistrar(
      {
        upsertProductAsset,
        getProductAssetPersistenceCapabilities: vi.fn(async () => ({
          candidate_linked_assets_supported: true,
          product_queue_id_nullable: true,
          product_candidate_id_available: true,
          blocked_reasons: []
        }))
      },
      {
        stat: vi.fn(async () => ({
          isFile: () => true,
          size: 4096
        })) as never,
        readFile: vi.fn(async () => Buffer.from("video")),
        uploadVideo
      }
    );

    const result = await registrar({ candidate: candidate() });

    expect(result.ok).toBe(true);
    expect(uploadVideo).toHaveBeenCalledTimes(1);
    expect(upsertProductAsset).toHaveBeenCalledTimes(1);
    const [asset] = upsertProductAsset.mock.calls[0] as [ProductAsset];
    expect(asset.product_queue_id).toBeNull();
    expect(asset.product_candidate_id).toBe("candidate-real-asset-001");
    expect(asset.render_qa_metadata).toMatchObject({
      product_candidate_id: "candidate-real-asset-001",
      registration_source: "r2_upload"
    });
    expect(JSON.stringify(asset)).not.toContain("\"product_queue_id\":\"\"");
  });

  it("reports persistence failure and possible orphan object after successful R2 upload", async () => {
    const uploadVideo = vi.fn(async () => ({
      ok: true as const,
      asset_ref: {
        asset_id: "asset-r2-orphan-possible",
        provider: "r2" as const,
        storage_key: "real-products/candidate-real-asset-001/video.mp4",
        prepared_video_asset_url: "https://cdn.example.com/videos/orphan-possible.mp4",
        signed_url: null,
        mime_type: "video/mp4" as const,
        size_bytes: 4096,
        checksum_sha256: "f".repeat(64),
        expires_at: null,
        server_accessible: true
      }
    }));
    const upsertProductAsset = vi.fn(async () => {
      throw new Error("mock persistence failure");
    });
    const registrar = createOneProductServerAssetRegistrar(
      {
        upsertProductAsset,
        getProductAssetPersistenceCapabilities: vi.fn(async () => ({
          candidate_linked_assets_supported: true,
          product_queue_id_nullable: true,
          product_candidate_id_available: true,
          blocked_reasons: []
        }))
      },
      {
        stat: vi.fn(async () => ({
          isFile: () => true,
          size: 4096
        })) as never,
        readFile: vi.fn(async () => Buffer.from("video")),
        uploadVideo
      }
    );

    const result = await registrar({ candidate: candidate() });

    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("PRODUCT_ASSET_PERSISTENCE_FAILED");
    expect(result.blocked_reasons).toEqual(expect.arrayContaining([
      "product_asset_persistence_failed",
      "product_asset_orphan_object_possible"
    ]));
    expect(result.r2_uploaded).toBe(true);
    expect(result.db_written).toBe(false);
    expect(result.orphan_object_possible).toBe(true);
  });

  it("keeps server registration blocked when the registrar reports storage provider not configured", async () => {
    const result = await buildOneProductVideoAssetEntryPoint({
      mode: "register_server_asset",
      candidate_id: "candidate-real-asset-001",
      approval: APPROVE_SINGLE_SERVER_ACCESSIBLE_VIDEO_ASSET_REGISTRATION,
      candidates: [candidate()],
      serverAssetRegistrar: async () => ({
        ok: false,
        error_code: "R2_OR_STORAGE_PROVIDER_NOT_CONFIGURED",
        message: "Server-accessible storage provider is not configured.",
        blocked_reasons: ["r2_endpoint_missing"],
        r2_uploaded: false,
        db_written: false,
        rows_inserted_or_upserted: 0
      })
    });

    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("R2_OR_STORAGE_PROVIDER_NOT_CONFIGURED");
    expect(result.blocked_reasons).toEqual(["r2_endpoint_missing"]);
    expect(result.side_effects.r2_uploaded).toBe(false);
    expect(result.side_effects.db_written).toBe(false);
    expect(result.side_effects.product_assets_written).toBe(false);
    expect(result.side_effects.rows_inserted_or_upserted).toBe(0);
    expect(result.side_effects.youtube_execute_called).toBe(false);
    expect(result.next_action).toBe("CONFIGURE_SERVER_ACCESSIBLE_VIDEO_ASSET_PROVIDER_OR_PROVIDE_ASSET_REF");
  });

  it("lets auto pilot become package-ready when a candidate-linked server asset exists", () => {
    const result = buildRealProductAutoPilot({
      mode: "prepare_only",
      candidates: [candidate()],
      queueItems: [],
      productAssets: [candidateLinkedVideoAsset()]
    });

    expect(result.ok).toBe(true);
    expect(result.selected_product?.candidate_id).toBe("candidate-real-asset-001");
    expect(result.selected_product?.queue_id).toBeNull();
    expect(result.prepared_video_asset_ref?.server_accessible).toBe(true);
    expect(result.package_prepare?.ready).toBe(true);
    expect(result.package_prepare?.prepared_video_asset_ref_used).toBe(true);
    expect(result.side_effects.youtube_execute_called).toBe(false);
  });

  it("exposes a safe route response without writes or YouTube side effects", async () => {
    mockRepository = {
      getProductCandidates: vi.fn(async () => [candidate()]),
      getProductAssets: vi.fn(async () => [])
    };
    const { POST } = await import("../app/api/uploads/youtube/real-product-pilot/video-asset/prepare/route");

    const response = await POST(new Request("http://localhost/api/uploads/youtube/real-product-pilot/video-asset/prepare", {
      method: "POST",
      body: JSON.stringify({
        mode: "dry_run",
        candidate_id: "candidate-real-asset-001"
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.candidate.candidate_id).toBe("candidate-real-asset-001");
    expect(body.side_effects.db_written).toBe(false);
    expect(body.side_effects.r2_uploaded).toBe(false);
    expect(body.side_effects.youtube_execute_called).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/access_token|refresh_token|client_secret|Authorization|Bearer|link\.coupang\.com/i);
  });

  it("connects the route to a configured local-only video generator under exact approval", async () => {
    mockRepository = {
      getProductCandidates: vi.fn(async () => [candidate()]),
      getProductAssets: vi.fn(async () => [])
    };
    mockLocalVideoGenerator.mockResolvedValue({
      candidate_id: "candidate-real-asset-001",
      local_video_path: "C:\\Users\\LOVE\\MyProjects\\commerce-automation\\commerce-assets\\output\\video-packages\\real-product-candidate-real-asset-001\\candidate-real-asset-001.mp4",
      mime_type: "video/mp4",
      size_bytes: 8192,
      duration_seconds: 12,
      checksum_sha256: "d".repeat(64),
      black_screen_detected: null,
      generated_this_run: true,
      local_only: true
    });
    const { POST } = await import("../app/api/uploads/youtube/real-product-pilot/video-asset/prepare/route");

    const response = await POST(new Request("http://localhost/api/uploads/youtube/real-product-pilot/video-asset/prepare", {
      method: "POST",
      body: JSON.stringify({
        mode: "generate_local_only",
        candidate_id: "candidate-real-asset-001",
        approval: RUN_REAL_PRODUCT_VIDEO_ASSET_GENERATION
      })
    }));
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(mockLocalVideoGenerator).toHaveBeenCalledTimes(1);
    expect(body.ok).toBe(true);
    expect(body.error_code).toBeNull();
    expect(body.generated_video_asset).toMatchObject({
      candidate_id: "candidate-real-asset-001",
      local_video_path_present: true,
      local_only: true,
      domain_ready: false,
      mime_type: "video/mp4",
      size_bytes: 8192,
      generated_this_run: true
    });
    expect(body.prepared_video_asset_ref).toBeNull();
    expect(body.next_action).toBe("REGISTER_SERVER_ACCESSIBLE_VIDEO_ASSET");
    expect(body.side_effects).toMatchObject({
      video_generated: true,
      local_file_written: true,
      r2_uploaded: false,
      db_written: false,
      product_assets_written: false,
      queue_created: false,
      worker_job_created: false,
      upload_package_created: false,
      youtube_execute_called: false,
      youtube_upload_executed: false,
      videos_insert_called: false,
      public_upload_enabled: false
    });
    expect(serialized).not.toContain("commerce-assets");
    expect(serialized).not.toMatch(/link\.coupang\.com|product\.jpg|access_token|refresh_token|client_secret|Authorization|Bearer/i);
  });

  it("accepts the one-shot story voiceover approval for local generation", async () => {
    const result = await buildOneProductVideoAssetEntryPoint({
      mode: "generate_local_only",
      candidate_id: "candidate-real-asset-001",
      approval: APPROVE_GENERATE_STORY_VOICEOVER_MP4_AND_UPLOAD_ONE_PRIVATE,
      candidates: [candidate()],
      localVideoGenerator: async (item) => ({
        candidate_id: item.id,
        local_video_path: "C:\\Users\\LOVE\\MyProjects\\commerce-automation\\commerce-assets\\output\\video-packages\\real-product-candidate-real-asset-001\\candidate-real-asset-001_story_voiceover_v001.mp4",
        mime_type: "video/mp4",
        size_bytes: 8192,
        duration_seconds: 25,
        checksum_sha256: "d".repeat(64),
        black_screen_detected: false,
        story_video_generated: true,
        voiceover_audio_present: true,
        voiceover_audio_file_present: true,
        audio_duration_seconds: 25,
        audio_mime_type: "audio/wav",
        audio_muxed_into_video: true,
        video_has_audio_stream: true,
        scene_count: 6,
        caption_count: 6,
        static_single_image_only: false,
        product_image_present: true,
        content_quality_score: 100,
        generated_this_run: true,
        local_only: true
      })
    });

    expect(result.ok).toBe(true);
    expect(result.generated_video_asset).toMatchObject({
      story_video_generated: true,
      voiceover_audio_present: true,
      video_has_audio_stream: true,
      scene_count: 6,
      caption_count: 6
    });
  });
});
