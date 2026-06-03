import { describe, expect, test } from "vitest";
import { POST as importCollectorCsv } from "../app/api/collectors/import-csv/route";
import { parseCandidateCsv } from "@/lib/collectors/candidateImport";
import { getAutomationRepository, resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";

describe("collector candidate import", () => {
  test("parses safe CSV rows into deterministic product candidates", () => {
    const csv = [
      "product_name,url,selected_affiliate_url,category_path,source_type,thumbnail_url,price,discount_rate,review_count,rating",
      "Spring Deal,https://example.com/deal,https://link.coupang.com/a/spring,seasonal,event,https://image.example.com/deal.jpg,12900,20,150,4.5"
    ].join("\n");

    const result = parseCandidateCsv(csv, { source: "toss_csv" });

    expect(result.errors).toEqual([]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      product_name: "Spring Deal",
      raw_coupang_url: "https://example.com/deal",
      selected_affiliate_url: "https://link.coupang.com/a/spring"
    });
    expect(result.candidates[0].id).toMatch(/^candidate-[a-f0-9]{16}$/);
    expect(result.candidates[0].payload).toMatchObject({
      source: "toss_csv",
      category_path: "seasonal",
      source_type: "event",
      thumbnail_url: "https://image.example.com/deal.jpg"
    });
    expect(result.candidates[0]).toMatchObject({
      product_key: expect.stringMatching(/^toss:[a-f0-9]{12}:[a-f0-9]{12}$/),
      platform: "toss",
      source_type: "event",
      category: "seasonal",
      duplicate_status: "unique",
      promotion_status: "ready"
    });
    expect(result.candidates[0].candidate_score).toBeGreaterThanOrEqual(80);
    expect(result.candidates[0].score_reason).toContain("제휴 링크 있음");
  });

  test("rejects unsafe or incomplete source URLs", () => {
    const csv = [
      "product_name,url",
      "Unsafe,javascript:alert(1)",
      "Missing URL,"
    ].join("\n");

    const result = parseCandidateCsv(csv, { source: "manual_csv" });

    expect(result.candidates).toHaveLength(0);
    expect(result.errors).toEqual([
      "2행: http/https URL만 가져올 수 있습니다.",
      "3행: 상품 URL이 비어 있습니다."
    ]);
  });

  test("deduplicates candidates by normalized URL", () => {
    const csv = [
      "product_name,url",
      "Deal,https://example.com/deal",
      "Deal Again,https://example.com/deal/"
    ].join("\n");

    const result = parseCandidateCsv(csv, { source: "manual_csv" });

    expect(result.errors).toEqual([]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].product_name).toBe("Deal");
  });

  test("repository can upsert imported candidates without creating duplicates", async () => {
    const repository = resetMockRepositoryForTests();
    const result = parseCandidateCsv("product_name,url\nDeal,https://example.com/deal", {
      source: "manual_csv"
    });

    await repository.upsertProductCandidates(result.candidates);
    await repository.upsertProductCandidates(result.candidates);

    const candidates = await repository.getProductCandidates();
    expect(candidates.filter((candidate) => candidate.id === result.candidates[0].id)).toHaveLength(1);
  });

  test("collector import API stores CSV candidates in the repository", async () => {
    resetMockRepositoryForTests();

    const response = await importCollectorCsv(
      new Request("http://localhost/api/collectors/import-csv", {
        method: "POST",
        body: JSON.stringify({
          source: "manual_csv",
          csv: "product_name,url\nDeal,https://example.com/deal"
        })
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ imported_count: 1, error_count: 0 });
    await expect(getAutomationRepository().getProductCandidates()).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ product_name: "Deal" })])
    );
  });

  test("enriches Coupang CSV rows with product key and affiliate readiness", () => {
    const csv = [
      "product_name,raw_coupang_url,selected_affiliate_url,thumbnail_url,price_now_text,category_path,source_type,itemId,vendorItemId",
      "Coupang CSV Product,https://www.coupang.com/vp/products/123456789?utm_source=ad,https://link.coupang.com/a/test-csv,https://picsum.photos/seed/csv/1080/1920,12900원,생활/수납,manual_url,111,222",
      "Missing Affiliate,https://www.coupang.com/vp/products/987654321,,https://picsum.photos/seed/csv-missing/1080/1920,9900,생활,manual_url,,"
    ].join("\n");

    const result = parseCandidateCsv(csv, { source: "coupang_csv" });

    expect(result.errors).toEqual([]);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]).toMatchObject({
      product_name: "Coupang CSV Product",
      raw_coupang_url: "https://www.coupang.com/vp/products/123456789?itemId=111&vendorItemId=222",
      selected_affiliate_url: "https://link.coupang.com/a/test-csv",
      product_key: "coupang:product:123456789:item:111:vendor:222",
      platform: "coupang",
      source_type: "manual_url",
      category: "생활/수납",
      promotion_status: "ready"
    });
    expect(result.candidates[0].payload).toMatchObject({
      source: "coupang_csv",
      source_platform: "coupang",
      affiliate_validation_status: "valid",
      affiliate_validation_reason: "affiliate link validated"
    });
    expect(result.candidates[1]).toMatchObject({
      product_key: "coupang:product:987654321",
      promotion_status: "blocked_missing_affiliate"
    });
    expect(result.candidates[1].payload).toMatchObject({
      affiliate_validation_status: "missing"
    });
  });
});
