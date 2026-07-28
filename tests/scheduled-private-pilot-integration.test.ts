import { afterEach, describe, expect, test, vi } from "vitest";
import { resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";
import { runScheduledQueueIntegration } from "@/lib/coupang/scheduledQueueIntegration";
import { COUPANG_SCHEDULED_PRODUCT_SEARCH_APPROVAL } from "@/lib/coupang/scheduledProductProvider";
import { POST as runNextBatch } from "../app/api/run/next-batch/route";

const NOW = "2026-07-28T03:20:00.000Z";

afterEach(() => vi.unstubAllEnvs());

describe("scheduled Coupang provider to authoritative queue", () => {
  test("creates ProductCandidate, scheduled queue, and GeneratedContent without upload execution", async () => {
    const repository = resetMockRepositoryForTests();
    const result = await runScheduledQueueIntegration({
      repository,
      slotId: "lunch_break",
      approval: COUPANG_SCHEDULED_PRODUCT_SEARCH_APPROVAL,
      now: NOW,
      env: readyEnv(),
      fetchImpl: vi.fn(async () => productResponse())
    });

    expect(result).toMatchObject({
      ok: true,
      queue_status: "scheduled",
      selected_affiliate_url_present: true,
      disclosure_text_present: true,
      raw_coupang_url_exposed: false,
      worker_job_created: false,
      upload_executor_called: false,
      videos_insert_called: false
    });
    if (!result.ok) throw new Error(result.blocker);
    const candidate = await repository.getProductCandidate(result.candidate_id);
    const queue = await repository.getQueueItem(result.queue_id);
    const content = await repository.getGeneratedContentByQueueItem(result.queue_id);
    expect(candidate?.payload.scheduled_provider_provenance).toMatchObject({
      provider: "coupang_partners_product_search",
      slot_id: "lunch_break"
    });
    expect(queue?.queue_status).toBe("scheduled");
    expect(content?.video_script.trim()).not.toBe("");
    expect(content?.disclosure_text.trim()).not.toBe("");
    expect(await repository.getWorkerJobs()).toHaveLength(0);
    expect(JSON.stringify(result)).not.toContain("www.coupang.com");
    expect(JSON.stringify(result)).not.toContain("link.coupang.com");
  });

  test("blocks missing affiliate deeplink and missing disclosure", async () => {
    const repository = resetMockRepositoryForTests();
    const noAffiliate = await runScheduledQueueIntegration({
      repository,
      slotId: "morning_commute",
      approval: COUPANG_SCHEDULED_PRODUCT_SEARCH_APPROVAL,
      now: NOW,
      env: readyEnv(),
      fetchImpl: async () => productResponse({ productUrl: "" })
    });
    expect(noAffiliate).toMatchObject({
      ok: false,
      blocker: "COUPANG_SCHEDULED_PRODUCT_CANDIDATES_EMPTY",
      worker_job_created: false,
      videos_insert_called: false
    });

    const fetchImpl = vi.fn(async () => productResponse());
    const noDisclosure = await runScheduledQueueIntegration({
      repository,
      slotId: "morning_commute",
      approval: COUPANG_SCHEDULED_PRODUCT_SEARCH_APPROVAL,
      now: NOW,
      env: readyEnv(),
      disclosureText: " ",
      fetchImpl
    });
    expect(noDisclosure).toMatchObject({ ok: false, blocker: "DISCLOSURE_TEXT_REQUIRED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("blocks duplicate product and same-day duplicate", async () => {
    const repository = resetMockRepositoryForTests();
    const input = {
      repository,
      slotId: "evening_commute" as const,
      approval: COUPANG_SCHEDULED_PRODUCT_SEARCH_APPROVAL,
      now: NOW,
      env: readyEnv(),
      fetchImpl: async () => productResponse()
    };
    expect((await runScheduledQueueIntegration(input)).ok).toBe(true);
    expect(await runScheduledQueueIntegration(input)).toMatchObject({
      ok: false,
      blocker: "DUPLICATE_PRODUCT_OR_SAME_DAY_DUPLICATE",
      worker_job_created: false,
      videos_insert_called: false
    });
  });

  test("binds the authoritative candidate into the signed Worker job", async () => {
    const repository = resetMockRepositoryForTests();
    for (const item of await repository.getQueue()) {
      await repository.updateQueueItemById(item.id, { queue_status: "hold" });
    }
    await repository.updateSettings({
      is_paused: false,
      python_worker_enabled: true,
      allowed_worker_job_types: ["video_render"],
      batch_size: 1,
      max_daily_videos: 1
    });
    vi.stubEnv("WORKER_VISUAL_BINDING_SECRET", "scheduled-pilot-binding-secret-0123456789");
    const integrated = await runScheduledQueueIntegration({
      repository,
      slotId: "before_bed",
      approval: COUPANG_SCHEDULED_PRODUCT_SEARCH_APPROVAL,
      now: NOW,
      env: readyEnv(),
      fetchImpl: async () => productResponse()
    });
    expect(integrated.ok).toBe(true);
    if (!integrated.ok) throw new Error(integrated.blocker);

    const response = await runNextBatch();
    const payload = await response.json();
    const jobs = await repository.getWorkerJobs();
    expect(payload.created_jobs).toBe(1);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      product_queue_id: integrated.queue_id,
      product_candidate_id: integrated.candidate_id
    });
    expect(jobs[0].payload).toMatchObject({
      product_candidate_id: integrated.candidate_id,
      server_visual_binding: {
        product_candidate_id_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        signature: expect.stringMatching(/^[a-f0-9]{64}$/)
      }
    });
  });
});

function readyEnv() {
  return {
    COUPANG_PARTNERS_PROVIDER_ENABLED: "true",
    COUPANG_PARTNERS_ACCESS_KEY: "configured-access",
    COUPANG_PARTNERS_SECRET_KEY: "configured-secret",
    COUPANG_PARTNER_ID: "configured-partner"
  };
}

function productResponse(overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      data: {
        productData: [{
          productId: 123456789,
          productName: "장마철 빠른 건조 제습기",
          productUrl: "https://link.coupang.com/a/private-pilot",
          productImage: "https://image.example.com/dehumidifier.jpg",
          productPrice: 129000,
          categoryName: "생활가전",
          ...overrides
        }]
      }
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
