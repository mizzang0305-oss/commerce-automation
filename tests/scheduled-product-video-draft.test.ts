import { describe, expect, test, vi } from "vitest";

import {
  buildScheduledProductVideoDraftPlan,
  downloadScheduledProductImage,
  renderScheduledProductVideoDraft,
  SCHEDULED_PRODUCT_VIDEO_DRAFT_APPROVAL,
  validateScheduledProductImageUrl
} from "@/lib/coupang/scheduledProductVideoDraft";

const products = Array.from({ length: 4 }, (_, index) => ({
  schema_version: "1" as const,
  product_name: [
    "사무용품 문구 선물 세트, 1개",
    "접이식 캠핑의자, 2개, 브라운",
    "경량 캠핑의자 1+1, 블랙, 2개",
    "무선 휴대용 넥밴드 선풍기, 블랙"
  ][index],
  price: 12000 + index * 1000,
  image_url: `https://ads-partners.coupang.com/products/${index + 1}`,
  stock_status: "unknown" as const,
  seller: "Coupang",
  collected_at: "2026-07-22T00:00:00.000Z",
  source_url: `https://link.coupang.com/re/AFFSDP?product=${index + 1}`,
  raw_hash: String(index + 1).repeat(64)
}));

describe("scheduled product video draft", () => {
  test("builds event and product-specific copy without reusing the kitchen-utensil script", () => {
    const plan = buildScheduledProductVideoDraftPlan({
      slotId: "morning_commute",
      products,
      now: "2026-07-22T00:00:00.000Z"
    });

    expect(plan).toMatchObject({
      slot_id: "morning_commute",
      local_time: "07:30",
      event_name: "여름방학 시작",
      primary_keyword: "문구 세트",
      quality: {
        status: "draft_preview_only",
        duration_seconds: 20,
        scene_count: 4,
        motion_present: true,
        caption_safe_area_layout: true,
        disclosure_present: true,
        single_product_image_only: true,
        voiceover_present: false,
        real_usage_scenes_present: false,
        owner_review_required: true
      },
      side_effects: {
        external_upload: false,
        publish_attempted: false,
        SAFE_TO_UPLOAD: false,
        SAFE_TO_PUBLIC_UPLOAD: false
      }
    });
    expect(plan.product.product_name).toBe(products[0].product_name);
    expect(plan.copy.hook).toContain("여름방학 시작");
    expect(plan.copy.review_point).toContain("문구 구성과 수량");
    expect(JSON.stringify(plan.copy)).not.toContain("주방 조리도구");
    expect(plan.copy.youtube_description).toContain("쿠팡파트너스 활동의 일환");
    expect(plan.quality.blockers).toEqual(expect.arrayContaining([
      "DRAFT_SINGLE_IMAGE_VIDEO",
      "VOICEOVER_REQUIRED",
      "REAL_USAGE_SCENES_REQUIRED",
      "PLATFORM_UPLOAD_NOT_CONNECTED"
    ]));
  });

  test("uses the slot rank when building the video product package", () => {
    const plan = buildScheduledProductVideoDraftPlan({
      slotId: "evening_commute",
      products,
      now: "2026-07-22T00:00:00.000Z"
    });

    expect(plan.product.product_name).toBe(products[2].product_name);
    expect(plan.event_name).toBe("여름휴가·물놀이 시즌");
    expect(plan.copy.review_point).toContain("의자 구성·수량·옵션");
  });

  test("blocks image hosts outside the explicit Coupang allowlist", () => {
    expect(() => validateScheduledProductImageUrl("https://example.com/product.jpg"))
      .toThrow("SCHEDULED_PRODUCT_IMAGE_HOST_BLOCKED");
    expect(() => validateScheduledProductImageUrl("http://ads-partners.coupang.com/product"))
      .toThrow("SCHEDULED_PRODUCT_IMAGE_HOST_BLOCKED");
    expect(validateScheduledProductImageUrl("https://image3.coupangcdn.com/product.jpg"))
      .toBe("https://image3.coupangcdn.com/product.jpg");
  });

  test("follows only a bounded redirect to a trusted Coupang CDN image", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { Location: "https://image3.coupangcdn.com/product.jpg" }
      }))
      .mockResolvedValueOnce(new Response(Buffer.from([0xff, 0xd8, 0xff, 0x01]), {
        status: 200,
        headers: { "Content-Type": "image/jpeg" }
      }));

    const result = await downloadScheduledProductImage(
      "https://ads-partners.coupang.com/product",
      fetchImpl
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.every((call) => call[1]?.redirect === "manual")).toBe(true);
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.finalHost).toBe("image3.coupangcdn.com");
    expect(result.buffer).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0x01]));
  });

  test("rejects a trusted-host response whose bytes do not match its image MIME type", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(Buffer.from("not-an-image"), {
      status: 200,
      headers: { "Content-Type": "image/jpeg" }
    }));

    await expect(downloadScheduledProductImage(
      "https://image3.coupangcdn.com/product.jpg",
      fetchImpl
    )).rejects.toThrow("SCHEDULED_PRODUCT_IMAGE_SIGNATURE_BLOCKED");
  });

  test("requires exact local render approval before image download or ffmpeg", async () => {
    const plan = buildScheduledProductVideoDraftPlan({
      slotId: "before_bed",
      products,
      now: "2026-07-22T00:00:00.000Z"
    });
    const fetchImpl = vi.fn<typeof fetch>();
    const execFileAsync = vi.fn();
    const result = await renderScheduledProductVideoDraft({
      plan,
      approval: "wrong",
      dependencies: { fetchImpl, execFileAsync }
    });

    expect(result).toMatchObject({
      ok: false,
      blocker: "SCHEDULED_PRODUCT_VIDEO_DRAFT_APPROVAL_REQUIRED",
      video_generated: false,
      image_downloaded: false,
      ffmpeg_executed: false,
      publish_attempted: false
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(execFileAsync).not.toHaveBeenCalled();
  });

  test("renders an approved local MP4 draft without any upload side effect", async () => {
    const plan = buildScheduledProductVideoDraftPlan({
      slotId: "lunch_break",
      products,
      now: "2026-07-22T00:00:00.000Z"
    });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(Buffer.from([0xff, 0xd8, 0xff, 0x01]), {
      status: 200,
      headers: { "Content-Type": "image/jpeg" }
    }));
    const execFileAsync = vi.fn(async () => ({ stdout: "", stderr: "" }));
    const writeFile = vi.fn(async () => undefined);
    const result = await renderScheduledProductVideoDraft({
      plan,
      approval: SCHEDULED_PRODUCT_VIDEO_DRAFT_APPROVAL,
      dependencies: {
        cwd: "C:\\repo",
        fetchImpl,
        execFileAsync,
        mkdir: vi.fn(async () => undefined),
        writeFile,
        readFile: vi.fn(async () => Buffer.from("video")) as never,
        stat: vi.fn(async () => ({ isFile: () => true, size: 4096 })) as never
      }
    });

    expect(result).toMatchObject({
      ok: true,
      blocker: null,
      video_generated: true,
      image_downloaded: true,
      ffmpeg_executed: true,
      publish_attempted: false,
      SAFE_TO_UPLOAD: false,
      SAFE_TO_PUBLIC_UPLOAD: false
    });
    expect(execFileAsync).toHaveBeenCalledTimes(1);
    expect(execFileAsync.mock.calls[0]?.[0]).toBe("ffmpeg");
    const ffmpegArgs = execFileAsync.mock.calls[0]?.[1] ?? [];
    expect(ffmpegArgs.join(" ")).toContain("preview.mp4");
    expect(ffmpegArgs.join(" ")).not.toContain("https://");
    expect(ffmpegArgs.join(" ")).toContain("zoompan");
    expect(ffmpegArgs.join(" ")).toContain("between(t,15,19.9)");
    expect(ffmpegArgs.join(" ").match(/expansion=none/g)).toHaveLength(6);
    expect(ffmpegArgs).toContain("20");
    const manifestWrite = writeFile.mock.calls.find((call) => String(call[0]).endsWith("manifest.json"));
    expect(String(manifestWrite?.[1])).toContain('"external_upload": false');
    expect(String(manifestWrite?.[1])).toContain('"scene_count": 4');
  });
});
