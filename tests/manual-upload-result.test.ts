import { beforeEach, describe, expect, test } from "vitest";
import { POST as buildUploadPackage } from "../app/api/queue/[id]/build-upload-package/route";
import { POST as markUploaded } from "../app/api/upload-packages/[id]/mark-uploaded/route";
import { POST as markSkipped } from "../app/api/upload-packages/[id]/mark-skipped/route";
import { POST as markNeedsFix } from "../app/api/upload-packages/[id]/mark-needs-fix/route";
import { getAutomationRepository, resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";
import type { GeneratedContent, ProductQueueItem } from "@/types/automation";

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function request(body: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/upload-packages/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("manual upload result tracking", () => {
  beforeEach(() => {
    resetMockRepositoryForTests();
  });

  test("blocks mark-uploaded when uploaded_url is missing", async () => {
    const repository = getAutomationRepository();
    const { packageId } = await prepareManualReadyPackage();

    const response = await markUploaded(request({ upload_notes: "uploaded manually" }), routeContext(packageId));
    const payload = await readJson(response);
    const [savedPackage] = await repository.getChannelUploadPackages();

    expect(response.status).toBe(400);
    expect(payload.missing_reasons).toContain("uploaded_url");
    expect(savedPackage.status).toBe("manual_ready");
    expect(savedPackage.uploaded_url).toBe("");
  });

  test("marks package uploaded with URL and keeps upload disabled", async () => {
    const repository = getAutomationRepository();
    const { packageId } = await prepareManualReadyPackage();
    const initialJobs = await repository.getWorkerJobs();

    const response = await markUploaded(
      request({
        uploaded_url: "https://youtube.example/manual/video-1",
        uploaded_by: "operator-1",
        upload_notes: "checked disclosure before publishing"
      }),
      routeContext(packageId)
    );
    const payload = await readJson(response);
    const [savedPackage] = await repository.getChannelUploadPackages();
    const finalJobs = await repository.getWorkerJobs();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, created_worker_jobs: 0 });
    expect(savedPackage).toMatchObject({
      status: "uploaded",
      uploaded_url: "https://youtube.example/manual/video-1",
      uploaded_by: "operator-1",
      upload_notes: "checked disclosure before publishing",
      platform_upload_status: "uploaded",
      upload_enabled: false,
      manual_upload_only: true
    });
    expect(savedPackage.uploaded_at).not.toBe("");
    expect(finalJobs).toHaveLength(initialJobs.length);
  });

  test("marks package skipped", async () => {
    const repository = getAutomationRepository();
    const { packageId } = await prepareManualReadyPackage();

    const response = await markSkipped(
      request({ uploaded_by: "operator-1", upload_notes: "campaign ended" }),
      routeContext(packageId)
    );
    const payload = await readJson(response);
    const [savedPackage] = await repository.getChannelUploadPackages();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, created_worker_jobs: 0 });
    expect(savedPackage).toMatchObject({
      status: "skipped",
      platform_upload_status: "skipped",
      upload_notes: "campaign ended",
      upload_enabled: false,
      manual_upload_only: true
    });
  });

  test("marks package needs_fix", async () => {
    const repository = getAutomationRepository();
    const { packageId } = await prepareManualReadyPackage();

    const response = await markNeedsFix(
      request({ uploaded_by: "operator-1", upload_notes: "thumbnail mismatch" }),
      routeContext(packageId)
    );
    const payload = await readJson(response);
    const [savedPackage] = await repository.getChannelUploadPackages();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, created_worker_jobs: 0 });
    expect(savedPackage).toMatchObject({
      status: "needs_fix",
      platform_upload_status: "needs_fix",
      upload_notes: "thumbnail mismatch",
      upload_enabled: false,
      manual_upload_only: true
    });
  });
});

async function prepareManualReadyPackage() {
  const repository = getAutomationRepository();
  const item = (await repository.getQueue({ status: "scheduled", limit: 1 }))[0];
  await repository.updateQueueItemById(item.id, {
    queue_status: "scheduled",
    product_name: "Manual upload tracking product",
    category_path: "home/kitchen",
    theme: "kitchen organization",
    raw_coupang_url: "https://www.coupang.com/vp/products/manual-upload-tracking",
    selected_affiliate_url: "https://link.coupang.com/a/manual-upload-tracking",
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

  const response = await buildUploadPackage(
    request({ channel_profile_id: "channel-coupang-daily" }),
    routeContext(item.id)
  );
  expect(response.status).toBe(200);
  const packages = await repository.getChannelUploadPackages(item.id);
  expect(packages[0].description.split(/\r?\n/)[0]).toBe("https://link.coupang.com/a/manual-upload-tracking");
  return { packageId: packages[0].id };
}

function buildContent(item: ProductQueueItem, overrides: Partial<GeneratedContent> = {}): GeneratedContent {
  const now = new Date().toISOString();
  return {
    id: `content-${item.id}`,
    product_queue_id: item.id,
    raw_coupang_url: item.raw_coupang_url,
    product_name: item.product_name || "Manual upload tracking product",
    selected_affiliate_url: item.selected_affiliate_url,
    video_title: "Manual upload tracking product checklist",
    video_script: "Check the product, price, and options before buying.",
    caption_1: "Check the product",
    caption_2: "Review price and options",
    caption_3: "Use the affiliate link only after review",
    threads_text: "Manual upload tracking product checklist",
    blog_title: "Manual upload tracking product checklist",
    blog_body: "Review product details before purchase.",
    hashtags: "#commerce #manualupload",
    youtube_description: "Review price and options before buying.\n\nAffiliate link: " + item.selected_affiliate_url,
    tiktok_caption: "Manual upload tracking product checklist",
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
