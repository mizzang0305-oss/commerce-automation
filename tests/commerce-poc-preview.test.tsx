import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { CommercePocLocalPreview } from "../src/components/CommercePocLocalPreview";
import { buildScheduledEventProductPreview } from "../src/lib/coupang/scheduledEventProductProvider";
import { COMMERCE_DAILY_KST_SLOTS } from "../src/lib/orchestration/commerceDailyCadence";
import {
  buildCommerceAutoPreviewPlan,
  parseCommerceProductPreview
} from "../src/lib/orchestration/commercePocPreview";

const validProduct = {
  schema_version: "1" as const,
  product_name: "설악칡냉면 물냉면+비빔냉면 10인세트, 1세트",
  price: 18800,
  image_url: "https://shop.example/images/cold-noodle.jpg",
  stock_status: "unknown" as const,
  seller: "www.coupang.com",
  collected_at: "2026-07-12T12:43:16.653Z",
  source_url: "https://www.coupang.com/vp/products/8006044049",
  raw_hash: "1".repeat(64)
};

describe("commerce PoC automatic Korea event preview", () => {
  test("parses valid JSONL rows and reports invalid rows without echoing their contents", () => {
    const result = parseCommerceProductPreview([
      JSON.stringify(validProduct),
      "{not-json}",
      JSON.stringify({ ...validProduct, raw_hash: "invalid" })
    ].join("\n"));

    expect(result.products).toEqual([validProduct]);
    expect(result.total_rows).toBe(3);
    expect(result.errors).toEqual([
      expect.objectContaining({ line: 2, code: "INVALID_JSON" }),
      expect.objectContaining({ line: 3, code: "INVALID_PRODUCT" })
    ]);
    expect(JSON.stringify(result.errors)).not.toContain("not-json");
  });

  test("rejects unsafe preview URLs and an oversized row count", () => {
    const unsafe = parseCommerceProductPreview(JSON.stringify({
      ...validProduct,
      image_url: "javascript:alert(1)"
    }));
    expect(unsafe.products).toHaveLength(0);
    expect(unsafe.errors[0]).toEqual(expect.objectContaining({ code: "UNSAFE_IMAGE_URL" }));

    const tooMany = parseCommerceProductPreview(
      Array.from({ length: 201 }, () => JSON.stringify(validProduct)).join("\n")
    );
    expect(tooMany.products).toHaveLength(0);
    expect(tooMany.errors[0]).toEqual(expect.objectContaining({ code: "ROW_LIMIT_EXCEEDED" }));
  });

  test("builds the Korean rolling 30-day event window including vacation boundaries", () => {
    const plan = buildCommerceAutoPreviewPlan({
      today: "2026-07-21",
      products: [validProduct],
      generatedAt: "2026-07-21T00:00:00.000Z"
    });

    expect(plan.event_window).toEqual({
      startDate: "2026-07-21",
      endDate: "2026-08-20",
      timezone: "Asia/Seoul",
      daysAhead: 30
    });
    expect(plan.events.map((event) => event.event_id)).toEqual(expect.arrayContaining([
      "jungbok",
      "malbok",
      "summer-vacation",
      "summer-break-end"
    ]));
    expect(plan.events.find((event) => event.event_id === "jungbok")).toMatchObject({
      name: "중복",
      start_date: "2026-07-25",
      days_until_start: 4
    });
    expect(plan.selected_product).toMatchObject({
      event_id: "jungbok",
      event_name: "중복",
      matched_terms: ["냉면"]
    });
    expect(plan.current_blocker).toBeNull();
    expect(plan.publish_allowed).toBe(false);
    expect(plan.external_upload).toBe(false);
    expect(plan.database_write).toBe(false);
    expect(plan.queue_write).toBe(false);
    expect(plan.worker_job_created).toBe(false);
    expect(plan.SAFE_TO_UPLOAD).toBe(false);
    expect(plan.SAFE_TO_PUBLIC_UPLOAD).toBe(false);
  });

  test("renders automatic owner review without asking the user for a product file", () => {
    const plan = buildCommerceAutoPreviewPlan({
      today: "2026-07-21",
      products: [validProduct],
      generatedAt: "2026-07-21T00:00:00.000Z"
    });

    render(<CommercePocLocalPreview plan={plan} />);

    expect(screen.getByText("자동 선정 결과")).toBeInTheDocument();
    expect(screen.getAllByText("중복").length).toBeGreaterThan(0);
    expect(screen.getByText(validProduct.product_name)).toBeInTheDocument();
    expect(screen.getByText("18,800원")).toBeInTheDocument();
    expect(screen.getByText("여름방학 종료·2학기 준비")).toBeInTheDocument();
    expect(screen.queryByLabelText("상품 JSONL 파일")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: validProduct.product_name })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "원격 이미지 미리보기 켜기" }));
    expect(screen.getByRole("img", { name: validProduct.product_name })).toHaveAttribute(
      "src",
      validProduct.image_url
    );
    expect(screen.getByText("외부 업로드: 없음")).toBeInTheDocument();
    expect(screen.getByText("owner review: 필수")).toBeInTheDocument();
  });

  test("renders four scheduled product candidates from the slot-specific pools", () => {
    const plan = buildCommerceAutoPreviewPlan({
      today: "2026-07-22",
      products: [validProduct],
      generatedAt: "2026-07-22T00:00:00.000Z"
    });
    const dailySlots = COMMERCE_DAILY_KST_SLOTS.map((slot, index) =>
      buildScheduledEventProductPreview({
        slotId: slot.id,
        now: "2026-07-22T00:00:00.000Z",
        products: [{
          ...validProduct,
          product_name: `${slot.label} 추천 상품`,
          raw_hash: String(index + 2).repeat(64)
        }]
      })
    );

    render(<CommercePocLocalPreview plan={plan} dailySlots={dailySlots} />);

    expect(screen.getByText("하루 4회 게시 후보 미리보기")).toBeInTheDocument();
    for (const slot of COMMERCE_DAILY_KST_SLOTS) {
      expect(screen.getByText(`${slot.local_time} · ${slot.label}`)).toBeInTheDocument();
      expect(screen.getByText(`${slot.label} 추천 상품`)).toBeInTheDocument();
    }
    expect(screen.getByText("상품 검색 연결 · 영상/플랫폼 게시 미연결")).toBeInTheDocument();
  });

  test("renders a local draft video player without claiming platform readiness", () => {
    const plan = buildCommerceAutoPreviewPlan({
      today: "2026-07-22",
      products: [validProduct],
      generatedAt: "2026-07-22T00:00:00.000Z"
    });
    const dailySlot = buildScheduledEventProductPreview({
      slotId: "morning_commute",
      now: "2026-07-22T00:00:00.000Z",
      products: [validProduct]
    });

    render(<CommercePocLocalPreview
      plan={plan}
      dailySlots={[{
        ...dailySlot,
        draft_video_preview_url: "/api/commerce-poc/video-drafts/morning_commute"
      }]}
    />);

    expect(screen.getByText("로컬 영상 초안 1/4 · 플랫폼 게시 미연결")).toBeInTheDocument();
    expect(screen.getByLabelText("아침 출근 로컬 영상 초안")).toHaveAttribute(
      "src",
      "/api/commerce-poc/video-drafts/morning_commute"
    );
  });

  test("fails closed when the local product pool has no event-matched product", () => {
    const plan = buildCommerceAutoPreviewPlan({
      today: "2026-07-21",
      products: [],
      generatedAt: "2026-07-21T00:00:00.000Z"
    });

    expect(plan.current_blocker).toBe("LOCAL_PRODUCT_POOL_EMPTY");
    expect(plan.selected_product).toBeNull();
    render(<CommercePocLocalPreview plan={plan} />);
    expect(screen.getByText("아직 자동 선택할 실제 상품 자료가 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "원격 이미지 미리보기 켜기" })).not.toBeInTheDocument();
  });
});
