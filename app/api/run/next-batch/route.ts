import { NextResponse } from "next/server";
import type { GeneratedContent, ProductQueueItem, WorkerJob } from "@/types/automation";
import { canProcessBatch } from "@/lib/guards";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { createAutomationRun } from "@/lib/server/runLog";
import { buildStoryboardRenderPlan } from "@/lib/video/storyboardTemplatePlanner";
import { getEffectiveRenderPlan } from "@/lib/video/renderPlanOverride";
import { countKstDailyVideoRenderJobs } from "@/lib/workerDailyLimit";

export const dynamic = "force-dynamic";

export async function POST() {
  const repository = getAutomationRepository();
  const settings = await repository.getSettings();
  const requestId = `next_batch-${Date.now()}`;

  const guard = canProcessBatch(settings);
  if (!guard.ok) {
    await recordRun(requestId, "failed", 0, 1, guard.message);
    return NextResponse.json(
      { ok: false, message: guard.message, request_id: requestId, selected_items: 0, created_jobs: 0 },
      { status: 409 }
    );
  }

  if (!settings.python_worker_enabled) {
    const message = "Python Worker가 비활성화되어 worker job을 생성하지 않았습니다.";
    await recordRun(requestId, "failed", 0, 1, message);
    return NextResponse.json(
      { ok: false, message, request_id: requestId, selected_items: 0, created_jobs: 0 },
      { status: 409 }
    );
  }

  if (!settings.allowed_worker_job_types.includes("video_render")) {
    const message = "video_render worker job type이 허용되지 않아 job을 생성하지 않았습니다.";
    await recordRun(requestId, "failed", 0, 1, message);
    return NextResponse.json(
      { ok: false, message, request_id: requestId, selected_items: 0, created_jobs: 0 },
      { status: 409 }
    );
  }

  const now = new Date();
  const dueItems = (await repository.getQueue({ status: "scheduled" }))
    .filter((item) => new Date(item.scheduled_at).getTime() <= now.getTime())
    .filter((item) => !["hold", "skipped", "error", "manual_review"].includes(item.queue_status))
    .sort((a, b) => a.queue_rank - b.queue_rank)
    .slice(0, settings.batch_size);

  if (dueItems.length === 0) {
    const message = "처리할 예약 상품이 없습니다.";
    await recordRun(requestId, "success", 0, 0, message);
    return NextResponse.json({
      ok: true,
      message,
      request_id: requestId,
      selected_items: 0,
      created_jobs: 0,
      jobs: []
    });
  }

  const existingDailyVideoJobs = countKstDailyVideoRenderJobs(await repository.getWorkerJobs(), now);
  const remainingDailyCapacity = Math.max(0, settings.max_daily_videos - existingDailyVideoJobs);
  if (remainingDailyCapacity === 0) {
    const message = "하루 영상 생성 제한에 도달해 worker job을 생성하지 않았습니다.";
    await recordRun(requestId, "success", 0, 0, message);
    return NextResponse.json({
      ok: true,
      message,
      request_id: requestId,
      selected_items: dueItems.length,
      created_jobs: 0,
      jobs: []
    });
  }

  const jobs: WorkerJob[] = [];
  let guardedItems = 0;
  for (const item of dueItems) {
    if (jobs.length >= remainingDailyCapacity) {
      break;
    }

    const content = await repository.getGeneratedContentByQueueItem(item.id);
    const itemGuard = validateRenderableItem(item, content);
    if (!itemGuard.ok) {
      guardedItems += 1;
      await repository.updateQueueItemById(item.id, {
        queue_status: "manual_review",
        error_message: itemGuard.message
      });
      continue;
    }

    const renderPlan = buildStoryboardRenderPlan(item, content);
    const effectiveRenderPlan = renderPlan.ok
      ? getEffectiveRenderPlan(renderPlan.render_plan, content?.render_plan_override)
      : null;
    if (effectiveRenderPlan && !effectiveRenderPlan.ok) {
      guardedItems += 1;
      await repository.updateQueueItemById(item.id, {
        queue_status: "manual_review",
        error_message: `render_plan override is invalid: ${effectiveRenderPlan.message}`
      });
      continue;
    }

    await repository.updateQueueItemById(item.id, {
      queue_status: "processing",
      error_message: ""
    });
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
          thumbnail_url: item.thumbnail_url,
          script: content?.video_script?.trim() ?? "",
          selected_affiliate_url: item.selected_affiliate_url,
          disclosure_text: content?.disclosure_text?.trim() ?? "",
          upload_package: {
            title: content?.video_title ?? item.product_name,
            description: content?.youtube_description ?? "",
            hashtags: content?.hashtags ?? ""
          },
          ...(effectiveRenderPlan?.ok ? { render_plan: effectiveRenderPlan.render_plan } : {})
        }
      })
    );
  }

  const message = `video_render worker job ${jobs.length}개를 생성했습니다. n8n webhook은 호출하지 않았습니다.`;
  await recordRun(requestId, "success", jobs.length, guardedItems, message);

  return NextResponse.json({
    ok: true,
    message,
    request_id: requestId,
    selected_items: dueItems.length,
    created_jobs: jobs.length,
    guarded_items: guardedItems,
    jobs
  });

  async function recordRun(
    requestIdValue: string,
    status: "success" | "failed",
    processedCount: number,
    errorCount: number,
    message: string
  ) {
    await repository.appendRun(
      createAutomationRun({
        request_id: requestIdValue,
        run_type: "next_batch",
        status,
        processed_count: processedCount,
        error_count: errorCount,
        log: message,
        safe_message: message
      })
    );
  }
}

function validateRenderableItem(
  item: ProductQueueItem,
  content: GeneratedContent | null
): { ok: true } | { ok: false; message: string } {
  if (!item.selected_affiliate_url.trim()) {
    return { ok: false, message: "제휴 링크가 없어 영상 생성 worker job을 만들지 않았습니다." };
  }
  if (!content?.disclosure_text?.trim()) {
    return { ok: false, message: "제휴 고지 문구가 없어 영상 생성 worker job을 만들지 않았습니다." };
  }
  if (!content.video_script?.trim()) {
    return { ok: false, message: "영상 대본이 없어 영상 생성 worker job을 만들지 않았습니다." };
  }
  if (!item.thumbnail_url.trim()) {
    return { ok: false, message: "상품 이미지 URL이 없어 영상 생성 worker job을 만들지 않았습니다." };
  }
  return { ok: true };
}
