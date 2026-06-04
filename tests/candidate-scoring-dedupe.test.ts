import { describe, expect, test } from "vitest";
import { POST as collectCoupang } from "../app/api/candidates/collect-coupang/route";
import { buildCoupangCandidate } from "@/lib/coupang/coupangCandidateImport";
import { resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";

describe("candidate scoring and dedupe hardening", () => {
  test("normalizes Coupang duplicate keys and records scoring/source metadata", () => {
    const first = buildCoupangCandidate({
      product_name: "쿠팡 중복 테스트 상품",
      raw_coupang_url:
        "https://www.coupang.com/vp/products/123456789?itemId=111222&vendorItemId=333444&utm_source=alpha",
      selected_affiliate_url: "https://link.coupang.com/a/test-one",
      thumbnail_url: "https://picsum.photos/seed/dedupe-one/1080/1920",
      price_now_text: "15,900원",
      category_path: "생활/정리",
      source_type: "manual_url",
      source: "dedupe_test"
    });
    const duplicate = buildCoupangCandidate(
      {
        product_name: "쿠팡 중복 테스트 상품",
        raw_coupang_url:
          "https://www.coupang.com/vp/products/123456789?utm_campaign=ignored&vendorItemId=333444&itemId=111222",
        selected_affiliate_url: "https://link.coupang.com/a/test-two",
        thumbnail_url: "https://picsum.photos/seed/dedupe-two/1080/1920",
        price_now_text: "15,900원",
        category_path: "생활/정리",
        source_type: "manual_url",
        source: "dedupe_test"
      },
      { candidates: [first.candidate] }
    );

    expect(duplicate.candidate.product_key).toBe(first.candidate.product_key);
    expect(duplicate.candidate.payload).toEqual(
      expect.objectContaining({
        duplicate_key: first.candidate.product_key,
        score_breakdown: expect.objectContaining({
          demand_score: expect.any(Number),
          price_score: expect.any(Number),
          content_angle_score: expect.any(Number),
          risk_penalty: expect.any(Number),
          duplicate_penalty: expect.any(Number),
          final_score: expect.any(Number)
        }),
        source_trace: expect.objectContaining({
          source_platform: "coupang",
          collected_mode: "manual_url",
          collected_at: expect.any(String),
          collector_version: expect.any(String)
        }),
        risk_flags: expect.arrayContaining(["duplicate_candidate"])
      })
    );
    expect(duplicate.candidate.duplicate_status).toBe("duplicate_candidate");
  });

  test("collector response remains candidate-only and exposes safe scoring metadata", async () => {
    const repository = resetMockRepositoryForTests();
    const initialQueue = await repository.getQueue();
    const initialJobs = await repository.getWorkerJobs();

    const response = await collectCoupang(
      new Request("http://localhost/api/candidates/collect-coupang", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "dry_run", keywords: ["차량 정리"], limit_per_keyword: 1 })
      })
    );
    const payload = await response.json();
    const finalQueue = await repository.getQueue();
    const finalJobs = await repository.getWorkerJobs();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      mode: "dry_run",
      queue_created: false,
      worker_jobs_created: false,
      upload_triggered: false
    });
    expect(payload.items[0]).toEqual(
      expect.objectContaining({
        duplicate_key: expect.any(String),
        score_breakdown: expect.objectContaining({
          demand_score: expect.any(Number),
          price_score: expect.any(Number),
          content_angle_score: expect.any(Number),
          risk_penalty: expect.any(Number),
          duplicate_penalty: expect.any(Number),
          final_score: expect.any(Number)
        }),
        source_trace: expect.objectContaining({
          source_platform: "coupang",
          source_keyword: "차량 정리",
          collected_mode: "collector_dry_run",
          collected_at: expect.any(String),
          collector_version: expect.any(String)
        }),
        risk_flags: expect.any(Array)
      })
    );
    expect(finalQueue).toHaveLength(initialQueue.length);
    expect(finalJobs).toHaveLength(initialJobs.length);
  });
});
