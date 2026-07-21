import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import CommercePocPreviewPage from "../app/commerce-poc/preview/page";
import { parseCommerceProductPreview } from "../src/lib/orchestration/commercePocPreview";

const validProduct = {
  schema_version: "1",
  product_name: "로컬 자동화 정리함",
  price: 12900,
  image_url: "https://shop.example/images/local-organizer.jpg",
  stock_status: "in_stock",
  seller: "Local Fixture Store",
  collected_at: "2026-07-21T05:15:00.000Z",
  source_url: "https://shop.example/products/local-organizer",
  raw_hash: "1".repeat(64)
};

describe("commerce PoC local preview", () => {
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

  test("previews a selected file in browser memory and keeps remote images opt-in", async () => {
    render(<CommercePocPreviewPage />);

    expect(screen.getByRole("heading", { name: "로컬 상품 자료 미리보기" })).toBeInTheDocument();
    expect(screen.getByText(/서버 업로드 없이 브라우저 메모리에서만/)).toBeInTheDocument();

    const content = JSON.stringify(validProduct);
    const file = new File([content], "products.jsonl", { type: "application/x-ndjson" });
    Object.defineProperty(file, "text", { value: async () => content });
    fireEvent.change(screen.getByLabelText("상품 JSONL 파일"), { target: { files: [file] } });

    expect(await screen.findByText("로컬 자동화 정리함")).toBeInTheDocument();
    expect(screen.getByText("12,900원")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "로컬 자동화 정리함" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "원격 이미지 미리보기 켜기" }));
    expect(screen.getByRole("img", { name: "로컬 자동화 정리함" })).toHaveAttribute(
      "src",
      validProduct.image_url
    );
    expect(screen.getByText("외부 업로드: 없음")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^업로드$/ })).not.toBeInTheDocument();
  });

  test("rejects files larger than the local preview limit before reading", async () => {
    render(<CommercePocPreviewPage />);
    const file = new File(["{}"], "large.jsonl", { type: "application/x-ndjson" });
    Object.defineProperty(file, "size", { value: 5 * 1024 * 1024 + 1 });
    Object.defineProperty(file, "text", {
      value: async () => {
        throw new Error("should not read oversized file");
      }
    });

    fireEvent.change(screen.getByLabelText("상품 JSONL 파일"), { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/5MB 이하 파일만 미리볼 수 있습니다/)).toBeInTheDocument();
    });
  });
});
