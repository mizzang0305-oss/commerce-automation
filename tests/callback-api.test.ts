import { beforeEach, describe, expect, test } from "vitest";
import { POST as nightlyCallback } from "../app/api/callback/n8n/nightly-scout/route";
import { POST as batchCallback } from "../app/api/callback/n8n/batch-result/route";
import { POST as itemCallback } from "../app/api/callback/n8n/item-result/route";
import { getAutomationRepository, resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

function callbackRequest(body: unknown, secret = "callback-secret") {
  return new Request("http://localhost/api/callback/n8n/test", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
    body: JSON.stringify(body)
  });
}

describe("n8n callback api", () => {
  beforeEach(() => {
    resetMockRepositoryForTests();
    delete process.env.COMMERCE_AUTOMATION_API_SECRET;
  });

  test("returns safe disabled error when callback secret is missing", async () => {
    const response = await nightlyCallback(callbackRequest({ request_id: "req-1" }));
    const payload = await readJson(response);

    expect(response.status).toBe(503);
    expect(payload.message).toBe("n8n callback 설정이 없어 결과를 반영할 수 없습니다.");
  });

  test("returns 401 when callback secret is wrong", async () => {
    process.env.COMMERCE_AUTOMATION_API_SECRET = "callback-secret";

    const response = await nightlyCallback(callbackRequest({ request_id: "req-1" }, "wrong"));

    expect(response.status).toBe(401);
  });

  test("upserts nightly scout callback items", async () => {
    process.env.COMMERCE_AUTOMATION_API_SECRET = "callback-secret";

    const response = await nightlyCallback(
      callbackRequest({
        request_id: "nightly-req",
        status: "success",
        queue_date: "2026-05-11",
        created_count: 1,
        items: [
          {
            id: "n8n-item-1",
            queue_date: "2026-05-11",
            queue_rank: 1,
            upload_slot: 1,
            scheduled_at: "2026-05-11T01:00:00.000Z",
            keyword: "n8n keyword",
            theme: "n8n theme",
            product_name: "n8n product",
            raw_coupang_url: "https://www.coupang.com/vp/products/n8n-1",
            selected_affiliate_url: "https://link.coupang.com/a/n8n-1",
            product_score: 90,
            queue_status: "scheduled"
          }
        ],
        error_message: ""
      })
    );

    const item = await getAutomationRepository().getQueueItem("n8n-item-1");
    const runs = await getAutomationRepository().getRuns();

    expect(response.status).toBe(200);
    expect(item?.product_name).toBe("n8n product");
    expect(runs[0]).toMatchObject({ request_id: "nightly-req", run_type: "nightly_scout" });
  });

  test("updates batch callback item by raw_coupang_url", async () => {
    process.env.COMMERCE_AUTOMATION_API_SECRET = "callback-secret";
    const existing = (await getAutomationRepository().getQueue({ limit: 1 }))[0];

    const response = await batchCallback(
      callbackRequest({
        request_id: "batch-req",
        status: "success",
        processed_count: 1,
        error_count: 0,
        items: [
          {
            raw_coupang_url: existing.raw_coupang_url,
            queue_status: "ready_for_manual_upload",
            video_url: "https://cdn.example/video.mp4",
            video_snapshot_url: "https://cdn.example/snapshot.jpg",
            blog_draft_url: "https://docs.example/blog",
            youtube_upload_status: "ready_to_upload",
            tiktok_upload_status: "ready_to_upload",
            threads_post_status: "ready_to_post",
            error_message: ""
          }
        ]
      })
    );

    const updated = await getAutomationRepository().getQueueItem(existing.id);

    expect(response.status).toBe(200);
    expect(updated?.queue_status).toBe("ready_for_manual_upload");
    expect(updated?.video_url).toBe("https://cdn.example/video.mp4");
  });

  test("updates item callback by id", async () => {
    process.env.COMMERCE_AUTOMATION_API_SECRET = "callback-secret";

    const response = await itemCallback(
      callbackRequest({
        request_id: "item-req",
        status: "failed",
        item: {
          id: "queue-001",
          queue_status: "error",
          error_message: "n8n item failed"
        },
        error_message: "n8n item failed"
      })
    );
    const item = await getAutomationRepository().getQueueItem("queue-001");

    expect(response.status).toBe(200);
    expect(item?.queue_status).toBe("error");
    expect(item?.error_message).toBe("n8n item failed");
  });
});
