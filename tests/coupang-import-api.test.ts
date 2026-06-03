import { describe, expect, test } from "vitest";
import { POST as importCoupangCandidate } from "../app/api/candidates/import-coupang/route";
import { getAutomationRepository, resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/candidates/import-coupang", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("Coupang candidate import API", () => {
  test("creates a ready candidate without creating queue rows or worker jobs", async () => {
    const repository = resetMockRepositoryForTests();
    const initialQueue = await repository.getQueue();
    const initialJobs = await repository.getWorkerJobs();

    const response = await importCoupangCandidate(
      request({
        product_name: "Coupang MVP test product",
        raw_coupang_url: "https://www.coupang.com/vp/products/123456789?utm_source=ad",
        selected_affiliate_url: "https://link.coupang.com/a/test-mvp",
        thumbnail_url: "https://picsum.photos/seed/coupang-mvp/1080/1920",
        price_now_text: "12,900원",
        category_path: "생활/수납",
        source_type: "manual_url",
        COUPANG_SECRET_KEY: "must-not-render"
      })
    );
    const payload = await response.json();
    const finalQueue = await repository.getQueue();
    const finalJobs = await repository.getWorkerJobs();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      worker_jobs_created: 0,
      queue_items_created: 0,
      readiness: {
        product_key: "coupang:product:123456789",
        affiliate_validation_status: "valid",
        duplicate_status: "unique",
        promotion_status: "ready"
      }
    });
    expect(payload.candidate).toMatchObject({
      product_name: "Coupang MVP test product",
      raw_coupang_url: "https://www.coupang.com/vp/products/123456789",
      selected_affiliate_url: "https://link.coupang.com/a/test-mvp",
      product_key: "coupang:product:123456789",
      platform: "coupang",
      source_type: "manual_url",
      category: "생활/수납",
      promotion_status: "ready"
    });
    expect(JSON.stringify(payload)).not.toContain("must-not-render");
    expect(finalQueue).toHaveLength(initialQueue.length);
    expect(finalJobs).toHaveLength(initialJobs.length);
  });

  test("stores candidates with missing affiliate links but blocks promotion readiness", async () => {
    resetMockRepositoryForTests();

    const response = await importCoupangCandidate(
      request({
        product_name: "Missing affiliate product",
        raw_coupang_url: "https://www.coupang.com/vp/products/987654321",
        thumbnail_url: "https://picsum.photos/seed/missing-affiliate/1080/1920"
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      readiness: {
        affiliate_validation_status: "missing",
        promotion_status: "blocked_missing_affiliate"
      }
    });
    await expect(getAutomationRepository().getProductCandidates()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          product_key: "coupang:product:987654321",
          selected_affiliate_url: "",
          promotion_status: "blocked_missing_affiliate"
        })
      ])
    );
  });

  test("normalizes thumbnail URL and marks missing image candidates for review", async () => {
    resetMockRepositoryForTests();

    const withImage = await importCoupangCandidate(
      request({
        product_name: "Image ready product",
        raw_coupang_url: "https://www.coupang.com/vp/products/13579",
        selected_affiliate_url: "https://link.coupang.com/a/image-ready",
        thumbnail_url: "  https://image.example.com/product.webp?size=1080  "
      })
    );
    const withoutImage = await importCoupangCandidate(
      request({
        product_name: "Missing image product",
        raw_coupang_url: "https://www.coupang.com/vp/products/24680",
        selected_affiliate_url: "https://link.coupang.com/a/missing-image"
      })
    );
    const withImagePayload = await withImage.json();
    const withoutImagePayload = await withoutImage.json();

    expect(withImage.status).toBe(200);
    expect(withImagePayload.candidate.payload.thumbnail_url).toBe("https://image.example.com/product.webp?size=1080");
    expect(withImagePayload.readiness).toMatchObject({
      image_readiness_status: "ready",
      promotion_status: "ready"
    });
    expect(withoutImage.status).toBe(200);
    expect(withoutImagePayload.readiness).toMatchObject({
      image_readiness_status: "missing_image",
      promotion_status: "needs_review"
    });
    expect(withImagePayload.readiness.candidate_score).toBeGreaterThan(withoutImagePayload.readiness.candidate_score);
  });

  test("rejects missing product name and non-product Coupang URLs", async () => {
    resetMockRepositoryForTests();

    const missingName = await importCoupangCandidate(
      request({
        raw_coupang_url: "https://www.coupang.com/vp/products/123456789",
        selected_affiliate_url: "https://link.coupang.com/a/test-mvp"
      })
    );
    const invalidUrl = await importCoupangCandidate(
      request({
        product_name: "Invalid URL",
        raw_coupang_url: "https://link.coupang.com/a/test-mvp",
        selected_affiliate_url: "https://link.coupang.com/a/test-mvp"
      })
    );

    expect(missingName.status).toBe(400);
    expect(await missingName.json()).toMatchObject({ ok: false, error_code: "MISSING_PRODUCT_NAME" });
    expect(invalidUrl.status).toBe(400);
    expect(await invalidUrl.json()).toMatchObject({ ok: false, error_code: "INVALID_COUPANG_PRODUCT_URL" });
  });
});
