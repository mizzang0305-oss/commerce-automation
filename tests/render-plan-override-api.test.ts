import { beforeEach, describe, expect, test } from "vitest";
import { POST as saveRenderPlanOverride } from "../app/api/queue/[id]/render-plan-override/route";
import { getAutomationRepository, resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";
import type { GeneratedContent } from "@/types/automation";

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function request(body: unknown) {
  return new Request("http://localhost/api/queue/test/render-plan-override", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("queue render plan override API", () => {
  beforeEach(() => {
    resetMockRepositoryForTests();
  });

  test("stores a valid override and does not create worker jobs", async () => {
    const repository = getAutomationRepository();
    const item = (await repository.getQueue({ status: "scheduled", limit: 1 }))[0];
    await makeItemRenderable(item.id);

    const response = await saveRenderPlanOverride(
      request({
        shots: [
          {
            shot_id: "hook",
            caption: "Operator checked hook copy",
            voice_text: "This operator reviewed hook is safe for the next batch.",
            duration_seconds: 4
          }
        ],
        updated_by: "operator"
      }),
      routeContext(item.id)
    );
    const payload = await readJson(response);
    const content = await repository.getGeneratedContentByQueueItem(item.id);

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      created_worker_jobs: 0,
      render_plan_override: {
        updated_by: "operator",
        shots: expect.arrayContaining([
          expect.objectContaining({ shot_id: "hook", caption: "Operator checked hook copy" })
        ])
      },
      effective_render_plan: {
        shots: expect.arrayContaining([
          expect.objectContaining({ shot_id: "hook", caption: "Operator checked hook copy", duration_sec: 4 })
        ])
      }
    });
    expect(content?.render_plan_override?.shots[0]).toMatchObject({
      shot_id: "hook",
      caption: "Operator checked hook copy"
    });
    expect(await repository.getWorkerJobs()).toHaveLength(0);
  });

  test("rejects unsafe override copy with safe JSON and no worker jobs", async () => {
    const repository = getAutomationRepository();
    const item = (await repository.getQueue({ status: "scheduled", limit: 1 }))[0];
    await makeItemRenderable(item.id);

    const response = await saveRenderPlanOverride(
      request({ shots: [{ shot_id: "hook", caption: "100% lowest price guaranteed" }] }),
      routeContext(item.id)
    );
    const payload = await readJson(response);

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      ok: false,
      error_code: "UNSAFE_RENDER_PLAN_OVERRIDE",
      created_worker_jobs: 0
    });
    expect(JSON.stringify(payload)).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(JSON.stringify(payload)).not.toContain("WORKER_API_SECRET");
    expect(await repository.getWorkerJobs()).toHaveLength(0);
  });
});

async function makeItemRenderable(id: string) {
  const repository = getAutomationRepository();
  const item = await repository.updateQueueItemById(id, {
    selected_affiliate_url: `https://link.coupang.com/a/${id}`,
    thumbnail_url: `https://picsum.photos/seed/${id}/1080/1920`
  });
  if (!item) {
    throw new Error("missing fixture queue item");
  }
  await repository.upsertGeneratedContent(buildGeneratedContent(item.id));
}

function buildGeneratedContent(productQueueId: string): GeneratedContent {
  const now = new Date().toISOString();
  return {
    id: `content-${productQueueId}`,
    product_queue_id: productQueueId,
    raw_coupang_url: `https://www.coupang.com/vp/products/${productQueueId}`,
    product_name: `Renderable ${productQueueId}`,
    selected_affiliate_url: `https://link.coupang.com/a/${productQueueId}`,
    video_title: "Renderable product checklist",
    video_script: "Start with the product. Show key details. Ask viewers to confirm options before buying.",
    caption_1: "",
    caption_2: "",
    caption_3: "",
    threads_text: "",
    blog_title: "",
    blog_body: "",
    hashtags: "",
    youtube_description: "",
    tiktok_caption: "",
    disclosure_text: "This content contains affiliate links.",
    content_source: "fallback",
    creatomate_render_id: "",
    video_url: "",
    video_snapshot_url: "",
    video_status: "not_started",
    blog_draft_url: "",
    blog_draft_status: "not_started",
    created_at: now,
    updated_at: now
  };
}
