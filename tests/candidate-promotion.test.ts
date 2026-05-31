import { describe, expect, test } from "vitest";
import type { ProductCandidate } from "@/types/automation";
import { resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";
import { createQueueItemFixture } from "@/test/fixtures";

function candidateFixture(overrides: Partial<ProductCandidate> = {}): ProductCandidate {
  return {
    id: "candidate-safe-001",
    product_name: "검수 후보 상품",
    raw_coupang_url: "https://www.coupang.com/vp/products/candidate-safe-001",
    selected_affiliate_url: "https://link.coupang.com/a/candidate-safe-001",
    payload: {
      source: "manual_csv",
      category_path: "생활/정리",
      keyword: "정리템",
      thumbnail_url: "https://image.example.com/candidate-safe-001.jpg",
      score: 88
    },
    created_at: "2026-05-31T00:00:00.000Z",
    updated_at: "2026-05-31T00:00:00.000Z",
    ...overrides
  };
}

describe("candidate to queue promotion", () => {
  test("blocks promotion when selected_affiliate_url is missing", async () => {
    const repository = resetMockRepositoryForTests();
    await repository.upsertProductCandidates([
      candidateFixture({ id: "candidate-no-affiliate", selected_affiliate_url: "" })
    ]);

    await expect(repository.promoteCandidateToQueue("candidate-no-affiliate")).rejects.toThrow(
      "제휴 링크가 없어 후보를 상품 큐로 승격할 수 없습니다."
    );
  });

  test("blocks promotion when product_name is missing", async () => {
    const repository = resetMockRepositoryForTests();
    await repository.upsertProductCandidates([
      candidateFixture({ id: "candidate-no-name", product_name: " " })
    ]);

    await expect(repository.promoteCandidateToQueue("candidate-no-name")).rejects.toThrow(
      "상품명이 없어 후보를 상품 큐로 승격할 수 없습니다."
    );
  });

  test("blocks duplicate promotion by raw_coupang_url", async () => {
    const repository = resetMockRepositoryForTests();
    const rawUrl = "https://www.coupang.com/vp/products/already-queued";
    await repository.upsertQueueItems([
      createQueueItemFixture({
        id: "queue-already-queued",
        raw_coupang_url: rawUrl,
        selected_affiliate_url: "https://link.coupang.com/a/already-queued"
      })
    ]);
    await repository.upsertProductCandidates([
      candidateFixture({ id: "candidate-duplicate", raw_coupang_url: rawUrl })
    ]);

    await expect(repository.promoteCandidateToQueue("candidate-duplicate")).rejects.toThrow(
      "이미 상품 큐에 있는 후보입니다."
    );
  });

  test("creates scheduled queue item and generated content scaffold without worker job", async () => {
    const repository = resetMockRepositoryForTests();
    await repository.upsertProductCandidates([candidateFixture()]);

    const result = await repository.promoteCandidateToQueue("candidate-safe-001", {
      now: "2026-05-31T03:00:00.000Z"
    });
    const queueItem = await repository.getQueueItem(result.queue_item.id);
    const content = await repository.getGeneratedContentByQueueItem(result.queue_item.id);
    const jobs = await repository.getWorkerJobs();

    expect(result.queue_item).toMatchObject({
      queue_status: "scheduled",
      product_name: "검수 후보 상품",
      raw_coupang_url: "https://www.coupang.com/vp/products/candidate-safe-001",
      selected_affiliate_url: "https://link.coupang.com/a/candidate-safe-001",
      thumbnail_url: "https://image.example.com/candidate-safe-001.jpg",
      product_score: 88
    });
    expect(queueItem?.id).toBe(result.queue_item.id);
    expect(content).toMatchObject({
      product_queue_id: result.queue_item.id,
      product_name: "검수 후보 상품",
      selected_affiliate_url: "https://link.coupang.com/a/candidate-safe-001",
      video_script: "",
      disclosure_text:
        "이 콘텐츠는 제휴마케팅 활동을 포함하며, 링크를 통한 구매가 발생하면 작성자에게 수수료가 지급됩니다."
    });
    expect(jobs).toHaveLength(0);
  });
});
