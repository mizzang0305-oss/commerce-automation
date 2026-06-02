import { beforeEach, describe, expect, test } from "vitest";
import { POST as buildUploadPackage } from "../app/api/queue/[id]/build-upload-package/route";
import { getAutomationRepository, resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";
import type { GeneratedContent, ProductQueueItem } from "@/types/automation";

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function request(body: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/queue/test/build-upload-package", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("channel upload package api", () => {
  beforeEach(() => {
    resetMockRepositoryForTests();
  });

  test("blocks package creation when video_url is missing", async () => {
    const repository = getAutomationRepository();
    const item = (await repository.getQueue({ status: "scheduled", limit: 1 }))[0];
    await repository.updateQueueItemById(item.id, {
      queue_status: "video_ready",
      selected_affiliate_url: "https://link.coupang.com/a/manual-package",
      video_url: "",
      thumbnail_url: "https://storage.example/thumb.jpg"
    });
    await repository.upsertGeneratedContent(buildContent(item));

    const response = await buildUploadPackage(request(), routeContext(item.id));
    const payload = await readJson(response);

    expect(response.status).toBe(400);
    expect(payload.missing_reasons).toContain("video_url");
    expect(await repository.getChannelUploadPackages(item.id)).toHaveLength(0);
  });

  test("blocks package creation when disclosure text is missing", async () => {
    const repository = getAutomationRepository();
    const item = (await repository.getQueue({ status: "scheduled", limit: 1 }))[0];
    await repository.updateQueueItemById(item.id, {
      queue_status: "video_ready",
      selected_affiliate_url: "https://link.coupang.com/a/manual-package",
      video_url: "https://storage.example/rendered-videos/item.mp4",
      thumbnail_url: "https://storage.example/thumb.jpg"
    });
    await repository.upsertGeneratedContent(buildContent(item, { disclosure_text: "" }));

    const response = await buildUploadPackage(request(), routeContext(item.id));
    const payload = await readJson(response);

    expect(response.status).toBe(400);
    expect(payload.missing_reasons).toContain("disclosure_text");
    expect(await repository.getChannelUploadPackages(item.id)).toHaveLength(0);
  });

  test("blocks package creation when channel profile is unknown", async () => {
    const repository = getAutomationRepository();
    const { item } = await prepareVideoReadyItem();

    const response = await buildUploadPackage(
      request({ channel_profile_id: "channel-missing" }),
      routeContext(item.id)
    );
    const payload = await readJson(response);

    expect(response.status).toBe(404);
    expect(payload.missing_reasons).toContain("channel_profile");
    expect(await repository.getChannelUploadPackages(item.id)).toHaveLength(0);
  });

  test("creates a manual-only channel package without creating worker jobs", async () => {
    const repository = getAutomationRepository();
    const { item, initialJobCount } = await prepareVideoReadyItem();

    const response = await buildUploadPackage(
      request({ channel_profile_id: "channel-coupang-daily" }),
      routeContext(item.id)
    );
    const payload = await readJson(response);
    const packages = await repository.getChannelUploadPackages(item.id);
    const finalJobs = await repository.getWorkerJobs();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      created_worker_jobs: 0
    });
    expect(packages).toHaveLength(1);
    expect(packages[0]).toMatchObject({
      product_queue_id: item.id,
      channel_profile_id: "channel-coupang-daily",
      platform: "youtube",
      status: "manual_ready",
      upload_enabled: false,
      manual_upload_only: true,
      video_url: "https://storage.example/rendered-videos/item.mp4",
      thumbnail_url: "https://storage.example/thumbnails/item.jpg",
      subtitle_url: "https://storage.example/subtitles/item.srt",
      upload_package_url: "https://storage.example/upload-packages/item.txt"
    });
    expect(packages[0].description).toContain("https://link.coupang.com/a/manual-package");
    expect(packages[0].description).toContain("disclosure");
    expect(packages[0].hashtags).toContain("#");
    expect(finalJobs).toHaveLength(initialJobCount);
  });
});

async function prepareVideoReadyItem() {
  const repository = getAutomationRepository();
  const item = (await repository.getQueue({ status: "scheduled", limit: 1 }))[0];
  await repository.updateQueueItemById(item.id, {
    queue_status: "scheduled",
    product_name: "Channel package product",
    category_path: "home/kitchen",
    theme: "kitchen organization",
    raw_coupang_url: "https://www.coupang.com/vp/products/manual-package",
    selected_affiliate_url: "https://link.coupang.com/a/manual-package",
    thumbnail_url: "https://storage.example/thumbnails/item.jpg"
  });
  const updated = (await repository.getQueueItem(item.id))!;
  await repository.upsertGeneratedContent(buildContent(updated));
  const job = await repository.createWorkerJob({
    job_type: "video_render",
    product_queue_id: item.id,
    product_candidate_id: "",
    priority: 10,
    payload: {},
    max_retries: 3
  });
  await repository.claimWorkerJob({ worker_id: "worker-1", job_types: ["video_render"] });
  await repository.completeWorkerJob(job.id, "worker-1", {
    video_url: "https://storage.example/rendered-videos/item.mp4",
    thumbnail_url: "https://storage.example/thumbnails/item.jpg",
    srt_url: "https://storage.example/subtitles/item.srt",
    upload_package_url: "https://storage.example/upload-packages/item.txt"
  });
  return {
    item: (await repository.getQueueItem(item.id))!,
    initialJobCount: (await repository.getWorkerJobs()).length
  };
}

function buildContent(item: ProductQueueItem, overrides: Partial<GeneratedContent> = {}): GeneratedContent {
  const now = new Date().toISOString();
  return {
    id: `content-${item.id}`,
    product_queue_id: item.id,
    raw_coupang_url: item.raw_coupang_url,
    product_name: item.product_name || "Channel package product",
    selected_affiliate_url: item.selected_affiliate_url,
    video_title: "Channel package product checklist",
    video_script: "Check the product, price, and options before buying.",
    caption_1: "Check the product",
    caption_2: "Review price and options",
    caption_3: "Use the affiliate link only after review",
    threads_text: "Channel package product checklist",
    blog_title: "Channel package product checklist",
    blog_body: "Review product details before purchase.",
    hashtags: "#commerce #manualupload",
    youtube_description: "Review price and options before buying.\n\nAffiliate link: " + item.selected_affiliate_url,
    tiktok_caption: "Channel package product checklist",
    disclosure_text: "disclosure: this content includes affiliate marketing links.",
    content_source: "fallback",
    creatomate_render_id: "",
    video_url: "",
    video_snapshot_url: "",
    video_status: "",
    blog_draft_url: "",
    blog_draft_status: "",
    created_at: now,
    updated_at: now,
    ...overrides
  };
}
