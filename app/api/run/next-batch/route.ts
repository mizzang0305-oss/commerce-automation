import { NextResponse } from "next/server";
import { canProcessBatch } from "@/lib/guards";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { createAutomationRun } from "@/lib/server/runLog";

export const dynamic = "force-dynamic";

export async function POST() {
  const repository = getAutomationRepository();
  const settings = await repository.getSettings();
  const requestId = `next_batch-${Date.now()}`;

  const guard = canProcessBatch(settings);
  if (!guard.ok) {
    await repository.appendRun(
      createAutomationRun({
        request_id: requestId,
        run_type: "next_batch",
        status: "failed",
        log: guard.message,
        safe_message: guard.message
      })
    );
    return NextResponse.json({ ok: false, message: guard.message, request_id: requestId }, { status: 409 });
  }

  const now = new Date();
  const dueItems = (await repository.getQueue({ status: "scheduled" }))
    .filter((item) => new Date(item.scheduled_at).getTime() <= now.getTime())
    .filter((item) => !["hold", "skipped", "error", "manual_review"].includes(item.queue_status))
    .sort((a, b) => a.queue_rank - b.queue_rank)
    .slice(0, settings.batch_size);

  const jobs = [];
  for (const item of dueItems) {
    await repository.updateQueueItemById(item.id, {
      queue_status: "processing",
      error_message: ""
    });
    const content = await repository.getGeneratedContentByQueueItem(item.id);
    jobs.push(
      await repository.createWorkerJob({
        job_type: "video_render",
        product_queue_id: item.id,
        product_candidate_id: "",
        priority: 1000 - item.queue_rank,
        max_retries: 3,
        payload: {
          product_queue_id: item.id,
          product_name: item.product_name,
          image_url: item.thumbnail_url,
          script: content?.video_script ?? item.video_angle,
          selected_affiliate_url: item.selected_affiliate_url,
          disclosure_text: content?.disclosure_text ?? "",
          upload_package: {
            title: content?.video_title ?? item.product_name,
            description: content?.youtube_description ?? "",
            hashtags: content?.hashtags ?? ""
          }
        }
      })
    );
  }

  const message = `Created ${jobs.length} worker video_render job(s). n8n webhook was not called.`;
  await repository.appendRun(
    createAutomationRun({
      request_id: requestId,
      run_type: "next_batch",
      status: "success",
      processed_count: jobs.length,
      error_count: 0,
      log: message,
      safe_message: message
    })
  );

  return NextResponse.json({
    ok: true,
    message,
    request_id: requestId,
    selected_items: dueItems.length,
    created_jobs: jobs.length,
    jobs
  });
}
