import { Buffer } from "node:buffer";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";

import { createOneProductLocalVideoGenerator } from "@/lib/uploads/videoAssets/oneProductLocalVideoGenerator";
import type { ProductCandidate } from "@/types/automation";

const candidate: ProductCandidate = {
  id: "candidate-real-asset-001",
  product_name: "빌리빈 스테인리스 조리도구 8종 세트",
  raw_coupang_url: "https://www.coupang.com/vp/products/123456789",
  selected_affiliate_url: "https://link.coupang.com/a/private-real-product",
  candidate_score: 91,
  payload: {
    thumbnail_url: "https://image.example.com/product.jpg",
    image_readiness_status: "ready",
    affiliate_validation_status: "valid"
  },
  created_at: "2026-06-15T00:00:00.000Z",
  updated_at: "2026-06-15T00:00:00.000Z"
};

describe("one-product local video generator adapter", () => {
  test("returns a local-only video contract without exposing source URLs", async () => {
    const execFileAsync = vi.fn(async () => ({ stdout: "", stderr: "" }));
    const mkdir = vi.fn(async () => undefined);
    const stat = vi.fn(async () => ({
      isFile: () => true,
      size: 8192
    }));
    const readFile = vi.fn(async () => Buffer.from("fake-mp4-content"));
    const generator = createOneProductLocalVideoGenerator({
      cwd: "C:\\repo\\commerce-automation",
      execFileAsync,
      mkdir,
      stat: stat as never,
      readFile: readFile as never
    });

    const result = await generator(candidate);
    const args = execFileAsync.mock.calls[0]?.[1] ?? [];
    const serialized = JSON.stringify(result);

    expect(execFileAsync).toHaveBeenCalledTimes(1);
    expect(args).toContain("https://image.example.com/product.jpg");
    expect(args).toContain("-i");
    expect(result).toMatchObject({
      candidate_id: "candidate-real-asset-001",
      mime_type: "video/mp4",
      size_bytes: 8192,
      duration_seconds: 12,
      black_screen_detected: null,
      generated_this_run: true,
      local_only: true
    });
    expect(result.local_video_path).toContain(path.join("commerce-assets", "output", "video-packages", "real-product-candidate-real-asset-001"));
    expect(result.checksum_sha256).toHaveLength(64);
    expect(serialized).not.toContain("link.coupang.com");
    expect(serialized).not.toContain("image.example.com/product.jpg");
    expect(serialized).not.toMatch(/access_token|refresh_token|client_secret|Authorization|Bearer/i);
  });

  test("blocks candidates without an HTTP product image before invoking ffmpeg", async () => {
    const execFileAsync = vi.fn(async () => ({ stdout: "", stderr: "" }));
    const generator = createOneProductLocalVideoGenerator({
      execFileAsync,
      mkdir: vi.fn(async () => undefined),
      stat: vi.fn() as never,
      readFile: vi.fn() as never
    });

    await expect(generator({
      ...candidate,
      payload: {
        image_readiness_status: "missing_image",
        affiliate_validation_status: "valid"
      }
    })).rejects.toThrow("candidate_image_url_not_ready");
    expect(execFileAsync).not.toHaveBeenCalled();
  });
});
