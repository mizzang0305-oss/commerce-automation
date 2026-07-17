import { NextResponse } from "next/server";
import type { GeneratedContent, ProductQueueItem, WorkerJob } from "@/types/automation";
import { canProcessBatch } from "@/lib/guards";
import {
  buildChannelNextBatchPayload,
  getDueQueueItems,
  isChannelAutomationKey,
  toChannelAutomationSettings
} from "@/lib/channelAutomation";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { callN8nWebhook } from "@/lib/server/n8nClient";
import { createAutomationRun } from "@/lib/server/runLog";
import { buildStoryboardRenderPlan } from "@/lib/video/storyboardTemplatePlanner";
import { getEffectiveRenderPlan } from "@/lib/video/renderPlanOverride";
import { countKstDailyVideoRenderJobs } from "@/lib/workerDailyLimit";
import { buildWorkerVisualBinding } from "@/lib/server/workerVisualBinding";

export const dynamic = "force-dynamic";

export async function POST(request?: Request) {
  const repository = getAutomationRepository();
  const settings = await repository.getSettings();
  const requestId = `next_batch-${Date.now()}`;
  const channelKey = request ? await getRequestedChannelKey(request) : null;

  if (channelKey) {
    const channelSettings = toChannelAutomationSettings(channelKey, settings);
    const now = new Date();
    const dueItems = getDueQueueItems(await repository.getQueue({ channelKey, status: "scheduled" }), channelSettings, now, channelKey);
    const selectedItems = dueItems.slice(0, channelSettings.batch_size);

    if (selectedItems.length === 0) {
      const message = "No due queue items for this channel. No upload or comment mutation was attempted.";
      await repository.appendRun(
        createAutomationRun({
          request_id: requestId,
          run_type: "channel_next_batch",
          channelKey,
          status: "success",
          processed_count: 0,
          error_count: 0,
          log: message,
          safe_message: message
        })
      );
      return NextResponse.json({
        ok: true,
        message,
        request_id: requestId,
        channel_key: channelKey,
        selected_items: 0,
        created_jobs: 0,
        items: [],
        uploadExecuteCalled: false,
        videosInsertCalled: false,
        commentThreadsInsertCalled: false,
        SAFE_TO_UPLOAD: false,
        SAFE_TO_PUBLIC_UPLOAD: false
      });
    }

    for (const item of selectedItems) {
      await repository.updateQueueItemById(item.id, { queue_status: "processing", error_message: "" });
    }

    const payload = buildChannelNextBatchPayload({
      channelKey,
      settings: channelSettings,
      requestId,
      requestedAt: now.toISOString(),
      items: selectedItems,
      callbackBaseUrl: process.env.PUBLIC_APP_BASE_URL
    });
    const n8nResult = await callN8nWebhook("next_batch", payload);

    if (!n8nResult.ok) {
      for (const item of selectedItems) {
        await repository.updateQueueItemById(item.id, {
          queue_status: "scheduled",
          error_message: ""
        });
      }
      await repository.appendRun(
        createAutomationRun({
          request_id: requestId,
          n8n_run_id: n8nResult.runId,
          http_status: n8nResult.httpStatus,
          run_type: "channel_next_batch",
          channelKey,
          status: "failed",
          processed_count: 0,
          error_count: 1,
          log: n8nResult.log,
          safe_message: n8nResult.message
        })
      );
      return NextResponse.json(
        {
          ok: false,
          message: n8nResult.message,
          request_id: requestId,
          channel_key: channelKey,
          selected_items: selectedItems.length,
          created_jobs: 0,
          videosInsertCalled: false,
          commentThreadsInsertCalled: false,
          SAFE_TO_UPLOAD: false,
          SAFE_TO_PUBLIC_UPLOAD: false
        },
        { status: 502 }
      );
    }

    const message = "Channel next-batch payload sent to n8n. Upload and comment automation remain disabled.";
    try {
      await repository.appendRun(
        createAutomationRun({
          request_id: requestId,
          n8n_run_id: n8nResult.runId,
          http_status: n8nResult.httpStatus,
          run_type: "channel_next_batch",
          channelKey,
          status: "success",
          processed_count: selectedItems.length,
          error_count: 0,
          log: n8nResult.log,
          safe_message: message
        })
      );
    } catch {
      const rollbackMessage =
        "Channel next-batch run log failed after n8n accepted the request. Selected items were returned to scheduled state for manual retry.";
      for (const item of selectedItems) {
        await repository.updateQueueItemById(item.id, {
          queue_status: "scheduled",
          error_message: rollbackMessage
        });
      }
      return NextResponse.json(
        {
          ok: false,
          message: rollbackMessage,
          request_id: requestId,
          channel_key: channelKey,
          selected_items: selectedItems.length,
          created_jobs: 0,
          uploadExecuteCalled: false,
          videosInsertCalled: false,
          commentThreadsInsertCalled: false,
          SAFE_TO_UPLOAD: false,
          SAFE_TO_PUBLIC_UPLOAD: false
        },
        { status: 500 }
      );
    }
    return NextResponse.json({
      ok: true,
      message,
      request_id: requestId,
      channel_key: channelKey,
      selected_items: selectedItems.length,
      created_jobs: 0,
      items: payload.items,
      uploadExecuteCalled: false,
      videosInsertCalled: false,
      commentThreadsInsertCalled: false,
      SAFE_TO_UPLOAD: false,
      SAFE_TO_PUBLIC_UPLOAD: false
    });
  }

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
    if (!renderPlan.ok) {
      guardedItems += 1;
      await repository.updateQueueItemById(item.id, {
        queue_status: "manual_review",
        error_message: `render_plan is not ready: ${renderPlan.missing_reasons.join(",")}`
      });
      continue;
    }
    const effectiveRenderPlan = getEffectiveRenderPlan(renderPlan.render_plan, content?.render_plan_override);
    if (effectiveRenderPlan && !effectiveRenderPlan.ok) {
      guardedItems += 1;
      await repository.updateQueueItemById(item.id, {
        queue_status: "manual_review",
        error_message: `render_plan override is invalid: ${effectiveRenderPlan.message}`
      });
      continue;
    }

    const visualBinding = buildWorkerVisualBinding({
      queueId: item.id,
      productName: item.product_name,
      affiliateUrl: item.selected_affiliate_url,
      categoryPath: item.category_path,
      theme: item.theme,
      keyword: item.keyword,
      renderPlan: effectiveRenderPlan.render_plan,
      secret: process.env.WORKER_VISUAL_BINDING_SECRET
    });
    if (!visualBinding.ok) {
      guardedItems += 1;
      await repository.updateQueueItemById(item.id, {
        queue_status: "manual_review",
        error_message: visualBinding.message
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
          render_plan: effectiveRenderPlan.render_plan,
          server_product_category: visualBinding.binding.target_category,
          server_visual_binding: visualBinding.binding
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

async function getRequestedChannelKey(request: Request) {
  const url = new URL(request.url);
  const queryValue = url.searchParams.get("channelKey") ?? url.searchParams.get("channel_key");
  if (isChannelAutomationKey(queryValue)) {
    return queryValue;
  }

  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json") && request.body === null) {
      return null;
    }
    const body = (await request.clone().json()) as { channelKey?: unknown; channel_key?: unknown };
    const bodyValue = body.channelKey ?? body.channel_key;
    return isChannelAutomationKey(bodyValue) ? bodyValue : null;
  } catch {
    return null;
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
