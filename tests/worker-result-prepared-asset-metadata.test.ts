import { describe, expect, test } from "vitest";
import { buildWorkerResultQa } from "@/lib/repositories/workerResultQa";

describe("Worker result prepared asset metadata", () => {
  test("persists the exact checksum, provider, storage key, URL, and server binding with passed QA", () => {
    const result = buildWorkerResultQa({
      creative_policy_gate: { gate_pass: true },
      visual_gate: { gate_pass: true },
      asr_gate: {
        pass: true,
        similarity: 0.91,
        product_anchor_recognized: true
      },
      render_output_gate: {
        pass: true,
        width: 1080,
        height: 1920,
        video_codec: "h264",
        audio_codec: "aac",
        audio_present: true
      },
      prepared_video_asset: {
        asset_id: "asset-job-1-video",
        checksum_sha256: "a".repeat(64),
        size_bytes: 123456,
        provider: "r2",
        storage_key: "job-1/video.mp4",
        prepared_video_asset_url: "https://assets.example/video.mp4",
        mime_type: "video/mp4",
        expires_at: "2026-07-28T03:30:00.000Z",
        server_accessible: true
      }
    });
    expect(result.status).toBe("passed");
    expect(result.metadata).toMatchObject({
      video_checksum_sha256: "a".repeat(64),
      video_size_bytes: 123456,
      prepared_video_asset_provider: "r2",
      prepared_video_asset_storage_key: "job-1/video.mp4",
      prepared_video_asset_url: "https://assets.example/video.mp4",
      prepared_video_asset_expires_at: "2026-07-28T03:30:00.000Z",
      prepared_video_asset_server_accessible: true
    });
  });

  test("does not mark QA passed for invalid checksum, provider, or non-HTTPS URL", () => {
    const result = buildWorkerResultQa({
      creative_policy_gate: { gate_pass: true },
      visual_gate: { gate_pass: true },
      asr_gate: { pass: true, product_anchor_recognized: true },
      render_output_gate: { pass: true, audio_present: true },
      prepared_video_asset: {
        checksum_sha256: "invalid",
        size_bytes: 1,
        provider: "caller_forged",
        storage_key: "job-1/video.mp4",
        prepared_video_asset_url: "http://assets.example/video.mp4",
        server_accessible: true
      }
    });
    expect(result.metadata).toMatchObject({
      video_checksum_sha256: "",
      prepared_video_asset_provider: "",
      prepared_video_asset_url: ""
    });
    expect(result.status).toBe("needs_fix");
  });

  test("does not mark QA passed when prepared asset evidence is omitted", () => {
    const result = buildWorkerResultQa({
      creative_policy_gate: { gate_pass: true },
      visual_gate: { gate_pass: true },
      asr_gate: { pass: true, product_anchor_recognized: true },
      render_output_gate: { pass: true, audio_present: true }
    });

    expect(result.status).toBe("needs_fix");
    expect(result.metadata).toMatchObject({
      video_checksum_sha256: "",
      video_size_bytes: 0,
      prepared_video_asset_provider: "",
      prepared_video_asset_storage_key: "",
      prepared_video_asset_url: "",
      prepared_video_asset_server_accessible: false
    });
  });
});
