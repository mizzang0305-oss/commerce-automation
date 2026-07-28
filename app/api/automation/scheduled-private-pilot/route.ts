import { NextResponse } from "next/server";
import { runScheduledQueueIntegration } from "@/lib/coupang/scheduledQueueIntegration";
import {
  COUPANG_SCHEDULED_PRODUCT_SEARCH_APPROVAL
} from "@/lib/coupang/scheduledProductProvider";
import {
  COMMERCE_DAILY_KST_SLOTS,
  type CommerceDailySlotId
} from "@/lib/orchestration/commerceDailyCadence";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { isServerBearerAuthorized } from "@/lib/server/serverSecretAuth";

export const dynamic = "force-dynamic";
const USAGE_SCENE_BLOCKER = "ACTUAL_USAGE_SCENE_EVIDENCE_REQUIRED_BEFORE_WORKER_DISPATCH";

export async function POST(request: Request) {
  if (!isServerBearerAuthorized(request, process.env.SCHEDULED_PRIVATE_PILOT_API_SECRET)) {
    return NextResponse.json(safeBlocked("SCHEDULED_PRIVATE_PILOT_AUTH_REQUIRED"), { status: 401 });
  }
  const body = await request.json().catch(() => ({})) as { slot_id?: unknown };
  if (!isSlotId(body.slot_id)) {
    return NextResponse.json(safeBlocked("SCHEDULED_PRIVATE_PILOT_SLOT_INVALID"), { status: 400 });
  }
  if (process.env.SCHEDULED_PRIVATE_PILOT_ENABLED?.trim().toLowerCase() !== "true") {
    return NextResponse.json(safeBlocked("SCHEDULED_PRIVATE_PILOT_DISABLED"), { status: 409 });
  }

  const repository = getAutomationRepository();
  const result = await runScheduledQueueIntegration({
    repository,
    slotId: body.slot_id,
    approval: COUPANG_SCHEDULED_PRODUCT_SEARCH_APPROVAL,
    env: process.env
  });
  let workerDispatch = {
    attempted: false,
    created_jobs: 0,
    guarded_items: 0,
    ok: false,
    deferred: false,
    blocker: result.ok ? USAGE_SCENE_BLOCKER : ""
  };
  if (result.ok) {
    await repository.updateQueueItemById(result.queue_id, {
      queue_status: "manual_review",
      error_message: USAGE_SCENE_BLOCKER
    });
    workerDispatch = {
      attempted: false,
      created_jobs: 0,
      guarded_items: 1,
      ok: true,
      deferred: true,
      blocker: USAGE_SCENE_BLOCKER
    };
  }
  return NextResponse.json(
    {
      ...result,
      worker_dispatch: workerDispatch,
      SAFE_TO_UPLOAD: false,
      SAFE_TO_PUBLIC_UPLOAD: false,
      PUBLIC_UPLOAD_ENABLED: false,
      UNLISTED_UPLOAD_ENABLED: false,
      COMMENT_AUTOMATION_ENABLED: false,
      MAX_PRIVATE_PILOT_ITEMS: 1,
      FAKE_SUCCESS: false
    },
    { status: result.ok && workerDispatch.ok ? 200 : 409 }
  );
}

function isSlotId(value: unknown): value is CommerceDailySlotId {
  return typeof value === "string" && COMMERCE_DAILY_KST_SLOTS.some((slot) => slot.id === value);
}

function safeBlocked(blocker: string) {
  return {
    ok: false,
    blocker,
    external_api_called: false,
    worker_job_created: false,
    upload_executor_called: false,
    videos_insert_called: false,
    raw_coupang_url_exposed: false
  };
}
